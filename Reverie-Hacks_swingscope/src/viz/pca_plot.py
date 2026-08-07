import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import pandas as pd

from src.config import CLUSTER_PATH, FIGURE_DIR, TEST_YEAR
from src.io_utils import load_table


def pca_scatter(df, out_path=None, year=TEST_YEAR):
    out_path = out_path or (FIGURE_DIR / "pca_clusters.png")
    snap = df[df.year == year]
    if snap.empty:
        snap = df[df.year == df.year.max()]
    snap = snap.dropna(subset=["pc1", "pc2"])

    fig, axes = plt.subplots(1, 2, figsize=(16, 7))
    for name, part in snap.groupby("cluster_name"):
        axes[0].scatter(part.pc1, part.pc2, s=6, alpha=0.6, label=name)
    axes[0].set_title("County clusters in PCA space")
    axes[0].set_xlabel("PC1")
    axes[0].set_ylabel("PC2")
    axes[0].legend(fontsize=8, markerscale=2)

    sc = axes[1].scatter(snap.pc1, snap.pc2, c=snap.margin, cmap="coolwarm_r", s=6, vmin=-0.8, vmax=0.8)
    axes[1].set_title("Same space colored by actual vote margin")
    axes[1].set_xlabel("PC1")
    axes[1].set_ylabel("PC2")
    fig.colorbar(sc, ax=axes[1], label="Democratic margin")

    fig.tight_layout()
    fig.savefig(out_path, dpi=180)
    plt.close(fig)
    return out_path


def silhouette_plot(diagnostics, out_path=None):
    out_path = out_path or (FIGURE_DIR / "silhouette_by_k.png")
    scores = diagnostics["silhouette_by_k"]
    ks = sorted(int(k) for k in scores)
    fig, ax = plt.subplots(figsize=(8, 5))
    ax.plot(ks, [scores[str(k)] if str(k) in scores else scores[k] for k in ks], marker="o")
    ax.set_xlabel("k")
    ax.set_ylabel("silhouette score")
    ax.set_title("Cluster count selection")
    ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(out_path, dpi=180)
    plt.close(fig)
    return out_path


if __name__ == "__main__":
    frame = load_table(CLUSTER_PATH)
    print(pca_scatter(frame))
