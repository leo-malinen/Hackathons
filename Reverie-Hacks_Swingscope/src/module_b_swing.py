import argparse
import json

import joblib
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.dummy import DummyClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.preprocessing import StandardScaler
from torch.utils.data import DataLoader, TensorDataset

from src.config import (
    CLASSES,
    CLUSTER_PATH,
    DEMO_FEATURES,
    HISTORY_FEATURES,
    MODEL_DIR,
    REPORT_DIR,
    SEED,
    SWING_PRED_PATH,
    TEST_YEAR,
    TRAIN_YEARS,
    VAL_YEAR,
)
from src.io_utils import load_table, save_table


def set_seed(seed=SEED):
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


class SwingNet(nn.Module):
    def __init__(self, n_in, n_clusters, emb_dim=4, hidden=(128, 64), dropout=0.3, n_classes=3):
        super().__init__()
        self.emb = nn.Embedding(n_clusters, emb_dim)
        dim = n_in + emb_dim
        layers = []
        for h in hidden:
            layers += [nn.Linear(dim, h), nn.BatchNorm1d(h), nn.ReLU(), nn.Dropout(dropout)]
            dim = h
        layers += [nn.Linear(dim, n_classes)]
        self.net = nn.Sequential(*layers)

    def forward(self, x_num, x_cluster):
        return self.net(torch.cat([x_num, self.emb(x_cluster)], dim=1))


def make_splits(df, use_clusters=True, use_demographics=True):
    features = list(HISTORY_FEATURES)
    if use_demographics:
        features += list(DEMO_FEATURES)

    data = df[df.swing_label.notna()].copy()
    data = data[data.year.isin(TRAIN_YEARS + [VAL_YEAR, TEST_YEAR])]
    data["y"] = data.swing_label.map({c: i for i, c in enumerate(CLASSES)})
    data = data[data.y.notna()]
    data["y"] = data.y.astype(int)

    if use_clusters:
        codes = data.cluster_id.astype(int)
        data["cluster_code"] = codes - codes.min()
    else:
        data["cluster_code"] = 0

    train = data[data.year.isin(TRAIN_YEARS)]
    val = data[data.year == VAL_YEAR]
    test = data[data.year == TEST_YEAR]

    scaler = StandardScaler().fit(train[features].astype(float))
    packs = {}
    for name, part in (("train", train), ("val", val), ("test", test)):
        packs[name] = {
            "X": scaler.transform(part[features].astype(float)),
            "c": part.cluster_code.to_numpy(dtype=np.int64),
            "y": part.y.to_numpy(dtype=np.int64),
            "frame": part,
        }
    n_clusters = int(data.cluster_code.max()) + 1
    return packs, features, scaler, n_clusters


def to_loader(pack, batch_size=256, shuffle=False):
    ds = TensorDataset(
        torch.tensor(pack["X"], dtype=torch.float32),
        torch.tensor(pack["c"], dtype=torch.long),
        torch.tensor(pack["y"], dtype=torch.long),
    )
    return DataLoader(ds, batch_size=batch_size, shuffle=shuffle, drop_last=shuffle and len(ds) > batch_size)


def predict(model, pack, device):
    model.eval()
    xs = torch.tensor(pack["X"], dtype=torch.float32, device=device)
    cs = torch.tensor(pack["c"], dtype=torch.long, device=device)
    with torch.no_grad():
        logits = model(xs, cs)
        probs = torch.softmax(logits, dim=1).cpu().numpy()
    return probs


def train_model(packs, n_clusters, epochs=150, lr=1e-3, patience=25, device="cpu", seed=SEED):
    set_seed(seed)
    n_in = packs["train"]["X"].shape[1]
    model = SwingNet(n_in, max(n_clusters, 1)).to(device)

    counts = np.bincount(packs["train"]["y"], minlength=len(CLASSES)).astype(float)
    counts[counts == 0] = 1.0
    weights = torch.tensor(counts.sum() / (len(CLASSES) * counts), dtype=torch.float32, device=device)

    criterion = nn.CrossEntropyLoss(weight=weights, label_smoothing=0.05)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)

    train_loader = to_loader(packs["train"], shuffle=True)
    best_f1 = -1.0
    best_state = None
    stale = 0
    history = []

    for epoch in range(epochs):
        model.train()
        running = 0.0
        for xb, cb, yb in train_loader:
            xb, cb, yb = xb.to(device), cb.to(device), yb.to(device)
            optimizer.zero_grad()
            loss = criterion(model(xb, cb), yb)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            running += float(loss) * len(yb)
        scheduler.step()

        val_probs = predict(model, packs["val"], device)
        val_f1 = f1_score(packs["val"]["y"], val_probs.argmax(1), average="macro", zero_division=0)
        history.append({"epoch": epoch, "loss": running / max(len(packs["train"]["y"]), 1), "val_macro_f1": val_f1})

        if val_f1 > best_f1:
            best_f1 = val_f1
            best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
            stale = 0
        else:
            stale += 1
            if stale >= patience:
                break

    if best_state is not None:
        model.load_state_dict(best_state)
    return model, best_f1, history


def baselines(packs, features):
    y_train = packs["train"]["y"]
    y_test = packs["test"]["y"]
    results = {}

    dummy = DummyClassifier(strategy="most_frequent").fit(packs["train"]["X"], y_train)
    pred = dummy.predict(packs["test"]["X"])
    results["majority_class"] = {
        "accuracy": float(accuracy_score(y_test, pred)),
        "macro_f1": float(f1_score(y_test, pred, average="macro", zero_division=0)),
    }

    test_frame = packs["test"]["frame"]
    prior = np.where(
        test_frame.flip_count_prior.fillna(0) >= 1,
        CLASSES.index("Swing"),
        np.where(test_frame.margin_lag1 > 0, CLASSES.index("Stable Democrat"), CLASSES.index("Stable Republican")),
    )
    results["persistence_rule"] = {
        "accuracy": float(accuracy_score(y_test, prior)),
        "macro_f1": float(f1_score(y_test, prior, average="macro", zero_division=0)),
    }

    logit = LogisticRegression(max_iter=2000, class_weight="balanced")
    logit.fit(packs["train"]["X"], y_train)
    pred = logit.predict(packs["test"]["X"])
    results["logistic_regression"] = {
        "accuracy": float(accuracy_score(y_test, pred)),
        "macro_f1": float(f1_score(y_test, pred, average="macro", zero_division=0)),
    }

    try:
        from lightgbm import LGBMClassifier

        gbm = LGBMClassifier(n_estimators=400, learning_rate=0.05, class_weight="balanced", verbose=-1)
        gbm.fit(packs["train"]["X"], y_train)
        pred = gbm.predict(packs["test"]["X"])
        results["lightgbm"] = {
            "accuracy": float(accuracy_score(y_test, pred)),
            "macro_f1": float(f1_score(y_test, pred, average="macro", zero_division=0)),
        }
    except Exception:
        results["lightgbm"] = {"accuracy": None, "macro_f1": None}

    return results


def run(df, use_clusters=True, use_demographics=True, epochs=150, device="cpu", seed=SEED):
    packs, features, scaler, n_clusters = make_splits(df, use_clusters, use_demographics)
    model, val_f1, history = train_model(packs, n_clusters, epochs=epochs, device=device, seed=seed)
    probs = predict(model, packs["test"], device)
    preds = probs.argmax(1)
    y_test = packs["test"]["y"]
    metrics = {
        "val_macro_f1": float(val_f1),
        "test_macro_f1": float(f1_score(y_test, preds, average="macro", zero_division=0)),
        "test_accuracy": float(accuracy_score(y_test, preds)),
        "test_swing_recall": float(
            classification_report(y_test, preds, output_dict=True, zero_division=0)
            .get(str(CLASSES.index("Swing")), {})
            .get("recall", 0.0)
        ),
    }
    return model, packs, features, scaler, probs, metrics, history


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=150)
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument("--ablation", action="store_true")
    args = parser.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    df = load_table(CLUSTER_PATH)

    model, packs, features, scaler, probs, metrics, history = run(
        df, True, True, epochs=args.epochs, device=device, seed=args.seed
    )

    y_test = packs["test"]["y"]
    preds = probs.argmax(1)
    report = classification_report(
        y_test, preds, labels=list(range(len(CLASSES))), target_names=CLASSES, zero_division=0
    )
    matrix = confusion_matrix(y_test, preds, labels=list(range(len(CLASSES)))).tolist()

    test_frame = packs["test"]["frame"].copy()
    test_frame["p_stable_dem"] = probs[:, 0]
    test_frame["p_stable_rep"] = probs[:, 1]
    test_frame["p_swing"] = probs[:, 2]
    test_frame["pred_label"] = [CLASSES[i] for i in preds]
    keep = [
        "fips",
        "year",
        "cluster_id",
        "cluster_name",
        "margin",
        "margin_lag1",
        "swing_label",
        "pred_label",
        "p_stable_dem",
        "p_stable_rep",
        "p_swing",
    ]
    written = save_table(test_frame[keep], SWING_PRED_PATH)

    torch.save(
        {"state_dict": model.state_dict(), "features": features, "n_in": len(features)},
        MODEL_DIR / "swingnet.pt",
    )
    joblib.dump(scaler, MODEL_DIR / "swing_scaler.joblib")

    output = {
        "device": device,
        "features": features,
        "metrics": metrics,
        "confusion_matrix": matrix,
        "classes": CLASSES,
        "baselines": baselines(packs, features),
        "epochs_run": len(history),
    }

    if args.ablation:
        ablation = {}
        for name, (clusters, demos) in {
            "history_only": (False, False),
            "history_plus_demographics": (False, True),
            "full_swingscope": (True, True),
        }.items():
            _, _, _, _, _, m, _ = run(df, clusters, demos, epochs=args.epochs, device=device, seed=args.seed)
            ablation[name] = m
        output["ablation"] = ablation

    with open(REPORT_DIR / "module_b_metrics.json", "w") as fh:
        json.dump(output, fh, indent=2)

    print(f"device             : {device}")
    print(f"epochs run         : {len(history)}")
    print(f"val macro-F1       : {metrics['val_macro_f1']:.4f}")
    print(f"test macro-F1      : {metrics['test_macro_f1']:.4f}")
    print(f"test accuracy      : {metrics['test_accuracy']:.4f}")
    print()
    print(report)
    print("confusion matrix")
    for row in matrix:
        print("   ", row)
    print()
    for name, vals in output["baselines"].items():
        print(f"{name:<26} macro-F1 {vals['macro_f1']}")
    if args.ablation:
        print()
        for name, vals in output["ablation"].items():
            print(f"{name:<28} test macro-F1 {vals['test_macro_f1']:.4f}")
    print()
    print(f"written            : {written}")


if __name__ == "__main__":
    main()
