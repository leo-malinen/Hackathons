import argparse
import json

import joblib
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.calibration import calibration_curve
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score
from sklearn.preprocessing import StandardScaler
from torch.utils.data import DataLoader, TensorDataset

from src.config import (
    CLUSTER_PATH,
    MODEL_DIR,
    RACE_FEATURES,
    RACE_PATH,
    REPORT_DIR,
    SEED,
    SWING_PRED_PATH,
    TEST_YEAR,
    TRAIN_YEARS,
    VAL_YEAR,
    WINPROB_PATH,
)
from src.io_utils import load_table, save_table, table_exists

NATIONAL_ENV = {2000: 0.0, 2004: -0.025, 2008: 0.062, 2012: 0.032, 2016: 0.015, 2020: 0.038}


class WinProbNet(nn.Module):
    def __init__(self, n_in, hidden=(96, 48), dropout=0.25):
        super().__init__()
        layers = []
        dim = n_in
        for h in hidden:
            layers += [nn.Linear(dim, h), nn.ReLU(), nn.Dropout(dropout)]
            dim = h
        layers += [nn.Linear(dim, 1)]
        self.net = nn.Sequential(*layers)

    def forward(self, x):
        return self.net(x).squeeze(-1)


def build_race_table(panel, swing_preds, spend_file=None, seed=SEED):
    rng = np.random.default_rng(seed)
    base = panel[panel.swing_label.notna()].copy()
    base = base[base.year.isin(TRAIN_YEARS + [VAL_YEAR, TEST_YEAR])]

    swing_lookup = None
    if swing_preds is not None and "p_swing" in swing_preds.columns:
        swing_lookup = swing_preds[["fips", "year", "p_swing"]].drop_duplicates(["fips", "year"]).copy()
        swing_lookup["fips"] = swing_lookup.fips.astype(str)
        swing_lookup["year"] = swing_lookup.year.astype(int)

    rows = []
    for party, sign in (("D", 1.0), ("R", -1.0)):
        part = base.copy()
        part["party"] = party
        part["prev_margin"] = sign * part.margin_lag1
        part["prev_margin_2"] = sign * part.margin_lag2.fillna(part.margin_lag1)
        part["is_incumbent"] = (part.prev_margin > 0).astype(int)
        part["partisan_lean"] = part.prev_margin - part.groupby("year").prev_margin.transform("mean")
        part["national_env"] = sign * part.year.map(NATIONAL_ENV).fillna(0.0)
        part["won"] = ((sign * part.margin) > 0).astype(int)
        rows.append(part)

    races = pd.concat(rows, ignore_index=True)

    if spend_file is not None:
        spend = pd.read_csv(spend_file, dtype={"fips": str})
        races = races.merge(spend, on=["fips", "year", "party"], how="left")
        races["spend"] = races.spend.fillna(races.spend.median())
        races["spend_is_synthetic"] = 0
    else:
        competitiveness = 1.0 - races.prev_margin.abs().clip(0, 1)
        strength = 0.5 + 0.5 * np.tanh(3.0 * races.prev_margin.fillna(0))
        base_spend = (
            races.total_votes.clip(lower=100)
            * (2.5 + 9.0 * competitiveness)
            * (0.6 + 0.8 * strength)
            * (1.0 + 0.35 * races.is_incumbent)
        )
        races["spend"] = base_spend * np.exp(rng.normal(0, 0.45, len(races)))
        races["spend_is_synthetic"] = 1

    races["log_spend"] = np.log1p(races.spend)
    opponent = races.groupby(["fips", "year"]).spend.transform("sum") - races.spend
    races["log_spend_ratio"] = np.log((races.spend + 1.0) / (opponent + 1.0))

    if swing_lookup is not None:
        races["fips"] = races.fips.astype(str)
        races["year"] = races.year.astype(int)
        races = races.merge(swing_lookup, on=["fips", "year"], how="left")
        races["p_swing"] = races.p_swing.fillna(races.p_swing.median())
    else:
        races["p_swing"] = 0.0
    races["p_swing"] = races.p_swing.fillna(0.0)

    cluster_dummies = pd.get_dummies(races.cluster_name.fillna("Unassigned"), prefix="cluster_mix")
    races = pd.concat([races.reset_index(drop=True), cluster_dummies.reset_index(drop=True)], axis=1)

    for col in RACE_FEATURES:
        races[col] = pd.to_numeric(races[col], errors="coerce")
        races[col] = races[col].replace([np.inf, -np.inf], np.nan)
        races[col] = races[col].fillna(races[col].median()).fillna(0.0)

    return races, list(cluster_dummies.columns)


def train_model(X_train, y_train, X_val, y_val, epochs=200, lr=1e-3, patience=25, device="cpu", seed=SEED):
    torch.manual_seed(seed)
    np.random.seed(seed)
    model = WinProbNet(X_train.shape[1]).to(device)
    criterion = nn.BCEWithLogitsLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)

    ds = TensorDataset(
        torch.tensor(X_train, dtype=torch.float32), torch.tensor(y_train, dtype=torch.float32)
    )
    loader = DataLoader(ds, batch_size=256, shuffle=True)

    xv = torch.tensor(X_val, dtype=torch.float32, device=device)
    yv = torch.tensor(y_val, dtype=torch.float32, device=device)

    best = float("inf")
    best_state = None
    stale = 0
    for _ in range(epochs):
        model.train()
        for xb, yb in loader:
            xb, yb = xb.to(device), yb.to(device)
            optimizer.zero_grad()
            loss = criterion(model(xb), yb)
            loss.backward()
            optimizer.step()
        model.eval()
        with torch.no_grad():
            val_loss = float(criterion(model(xv), yv))
        if val_loss < best - 1e-5:
            best = val_loss
            best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
            stale = 0
        else:
            stale += 1
            if stale >= patience:
                break
    if best_state is not None:
        model.load_state_dict(best_state)
    return model, best


def probabilities(model, X, device="cpu"):
    model.eval()
    with torch.no_grad():
        logits = model(torch.tensor(X, dtype=torch.float32, device=device))
        return torch.sigmoid(logits).cpu().numpy()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=200)
    parser.add_argument("--calibrate", choices=["isotonic", "none"], default="isotonic")
    parser.add_argument("--spend-file", default=None)
    parser.add_argument("--seed", type=int, default=SEED)
    args = parser.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    panel = load_table(CLUSTER_PATH)
    swing = load_table(SWING_PRED_PATH) if table_exists(SWING_PRED_PATH) else None

    races, cluster_cols = build_race_table(panel, swing, args.spend_file, args.seed)
    save_table(races, RACE_PATH)

    features = list(RACE_FEATURES) + cluster_cols
    train = races[races.year.isin(TRAIN_YEARS)]
    val = races[races.year == VAL_YEAR]
    test = races[races.year == TEST_YEAR]

    scaler = StandardScaler().fit(train[features].astype(float))
    X_train = scaler.transform(train[features].astype(float))
    X_val = scaler.transform(val[features].astype(float))
    X_test = scaler.transform(test[features].astype(float))
    y_train = train.won.to_numpy(dtype=float)
    y_val = val.won.to_numpy(dtype=float)
    y_test = test.won.to_numpy(dtype=float)

    model, val_loss = train_model(
        X_train, y_train, X_val, y_val, epochs=args.epochs, device=device, seed=args.seed
    )

    raw_val = probabilities(model, X_val, device)
    raw_test = probabilities(model, X_test, device)

    if args.calibrate == "isotonic":
        iso = IsotonicRegression(out_of_bounds="clip").fit(raw_val, y_val)
        cal_test = np.clip(iso.predict(raw_test), 1e-6, 1 - 1e-6)
        joblib.dump(iso, MODEL_DIR / "winprob_calibrator.joblib")
    else:
        cal_test = np.clip(raw_test, 1e-6, 1 - 1e-6)

    metrics = {
        "val_bce": float(val_loss),
        "raw": {
            "brier": float(brier_score_loss(y_test, raw_test)),
            "log_loss": float(log_loss(y_test, np.clip(raw_test, 1e-6, 1 - 1e-6))),
            "auc": float(roc_auc_score(y_test, raw_test)),
        },
        "calibrated": {
            "brier": float(brier_score_loss(y_test, cal_test)),
            "log_loss": float(log_loss(y_test, cal_test)),
            "auc": float(roc_auc_score(y_test, cal_test)),
        },
        "baseline_brier_always_half": float(brier_score_loss(y_test, np.full_like(y_test, 0.5))),
        "spend_is_synthetic": bool(races.spend_is_synthetic.max() == 1),
    }

    frac_pos, mean_pred = calibration_curve(y_test, cal_test, n_bins=10, strategy="quantile")
    metrics["reliability"] = {
        "mean_predicted": [float(v) for v in mean_pred],
        "observed_fraction": [float(v) for v in frac_pos],
    }

    out = test[["fips", "year", "party", "cluster_name", "won"]].copy()
    out["p_win_raw"] = raw_test
    out["p_win"] = cal_test
    save_table(out, WINPROB_PATH)

    torch.save(
        {"state_dict": model.state_dict(), "features": features},
        MODEL_DIR / "winprobnet.pt",
    )
    joblib.dump(scaler, MODEL_DIR / "winprob_scaler.joblib")
    with open(REPORT_DIR / "module_c_metrics.json", "w") as fh:
        json.dump(metrics, fh, indent=2)

    print(f"device             : {device}")
    print(f"races              : {len(races):,}")
    print(f"synthetic spend    : {metrics['spend_is_synthetic']}")
    print(f"brier raw          : {metrics['raw']['brier']:.4f}")
    print(f"brier calibrated   : {metrics['calibrated']['brier']:.4f}")
    print(f"log loss           : {metrics['calibrated']['log_loss']:.4f}")
    print(f"auc                : {metrics['calibrated']['auc']:.4f}")
    print(f"baseline brier 0.5 : {metrics['baseline_brier_always_half']:.4f}")
    print()
    print("reliability (predicted -> observed)")
    for p, o in zip(metrics["reliability"]["mean_predicted"], metrics["reliability"]["observed_fraction"]):
        print(f"    {p:.3f} -> {o:.3f}")


if __name__ == "__main__":
    main()
