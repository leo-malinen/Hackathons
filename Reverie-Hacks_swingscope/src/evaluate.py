import json

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from src.config import CLASSES, FIGURE_DIR, METRICS_PATH, REPORT_DIR, SWING_PRED_PATH


def confusion_plot(matrix, classes=CLASSES, out_path=None):
    out_path = out_path or (FIGURE_DIR / "confusion_matrix.png")
    matrix = np.array(matrix, dtype=float)
    normed = matrix / np.clip(matrix.sum(axis=1, keepdims=True), 1, None)
    fig, ax = plt.subplots(figsize=(7, 6))
    im = ax.imshow(normed, cmap="Blues", vmin=0, vmax=1)
    ax.set_xticks(range(len(classes)))
    ax.set_yticks(range(len(classes)))
    ax.set_xticklabels(classes, rotation=30, ha="right")
    ax.set_yticklabels(classes)
    ax.set_xlabel("Predicted")
    ax.set_ylabel("Actual")
    ax.set_title("Swing detector confusion matrix (row-normalized)")
    for i in range(len(classes)):
        for j in range(len(classes)):
            ax.text(j, i, f"{int(matrix[i, j])}\n{normed[i, j]:.2f}", ha="center", va="center", fontsize=9)
    fig.colorbar(im, ax=ax)
    fig.tight_layout()
    fig.savefig(out_path, dpi=180)
    plt.close(fig)
    return out_path


def reliability_plot(reliability, out_path=None):
    out_path = out_path or (FIGURE_DIR / "reliability_diagram.png")
    fig, ax = plt.subplots(figsize=(7, 7))
    ax.plot([0, 1], [0, 1], "k--", label="perfect calibration")
    ax.plot(
        reliability["mean_predicted"],
        reliability["observed_fraction"],
        marker="o",
        color="#e63946",
        label="SwingScope",
    )
    ax.set_xlabel("Mean predicted win probability")
    ax.set_ylabel("Observed win frequency")
    ax.set_title("Win probability reliability diagram")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.grid(alpha=0.3)
    ax.legend()
    fig.tight_layout()
    fig.savefig(out_path, dpi=180)
    plt.close(fig)
    return out_path


def collect():
    summary = {}
    for name, path in {
        "module_a": REPORT_DIR / "cluster_diagnostics.json",
        "module_b": REPORT_DIR / "module_b_metrics.json",
        "module_c": REPORT_DIR / "module_c_metrics.json",
    }.items():
        if path.exists():
            with open(path) as fh:
                summary[name] = json.load(fh)

    figures = []
    if "module_b" in summary and "confusion_matrix" in summary["module_b"]:
        figures.append(str(confusion_plot(summary["module_b"]["confusion_matrix"])))
    if "module_c" in summary and "reliability" in summary["module_c"]:
        figures.append(str(reliability_plot(summary["module_c"]["reliability"])))

    summary["figures"] = figures
    with open(METRICS_PATH, "w") as fh:
        json.dump(summary, fh, indent=2)
    return summary


def headline(summary):
    lines = []
    a = summary.get("module_a", {})
    b = summary.get("module_b", {}).get("metrics", {})
    c = summary.get("module_c", {}).get("calibrated", {})
    if a:
        lines.append(f"clusters (k)         : {a.get('best_k')}")
        lines.append(f"pca variance         : {[round(v, 3) for v in a.get('explained_variance_ratio', [])]}")
    if b:
        lines.append(f"swing test macro-F1  : {b.get('test_macro_f1', 0):.4f}")
        lines.append(f"swing test accuracy  : {b.get('test_accuracy', 0):.4f}")
    if c:
        lines.append(f"win prob brier       : {c.get('brier', 0):.4f}")
        lines.append(f"win prob auc         : {c.get('auc', 0):.4f}")
    return "\n".join(lines)


if __name__ == "__main__":
    result = collect()
    print(headline(result))
    print()
    print(f"written : {METRICS_PATH}")
