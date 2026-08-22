import argparse
import json

import joblib
import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN, KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import StandardScaler

from src.config import (
    CLUSTER_PATH,
    DEMO_FEATURES,
    FIGURE_DIR,
    MODEL_DIR,
    PANEL_PATH,
    REPORT_DIR,
    SEED,
    TEST_YEAR,
)
from src.io_utils import load_table, save_table


def fit_clusters(df, features=None, k_range=range(2, 13), random_state=SEED, sample_size=3000):
    features = features or DEMO_FEATURES
    X_raw = df[features].astype(float)
    X_raw = X_raw.fillna(X_raw.median())
    scaler = StandardScaler().fit(X_raw)
    X = scaler.transform(X_raw)

    scores = {}
    inertia = {}
    for k in k_range:
        km = KMeans(n_clusters=k, n_init=10, random_state=random_state).fit(X)
        scores[int(k)] = float(
            silhouette_score(X, km.labels_, sample_size=min(sample_size, len(X)), random_state=random_state)
        )
        inertia[int(k)] = float(km.inertia_)

    best_k = int(max(scores, key=scores.get))
    kmeans = KMeans(n_clusters=best_k, n_init=25, random_state=random_state).fit(X)

    nn = NearestNeighbors(n_neighbors=10).fit(X)
    dists, _ = nn.kneighbors(X)
    eps = float(np.percentile(np.sort(dists[:, -1]), 95))
    dbscan = DBSCAN(eps=eps, min_samples=10).fit(X)

    pca = PCA(n_components=2, random_state=random_state).fit(X)
    coords = pca.transform(X)

    out = df.copy()
    out["cluster_id"] = kmeans.labels_
    out["dbscan_id"] = dbscan.labels_
    out["pc1"] = coords[:, 0]
    out["pc2"] = coords[:, 1]

    loadings = pd.DataFrame(pca.components_.T, index=features, columns=["pc1", "pc2"])
    centroids = pd.DataFrame(scaler.inverse_transform(kmeans.cluster_centers_), columns=features)
    centroids_z = pd.DataFrame(kmeans.cluster_centers_, columns=features)

    diagnostics = {
        "best_k": best_k,
        "silhouette_by_k": scores,
        "inertia_by_k": inertia,
        "dbscan_eps": eps,
        "dbscan_outliers": int((dbscan.labels_ == -1).sum()),
        "dbscan_clusters": int(len(set(dbscan.labels_)) - (1 if -1 in dbscan.labels_ else 0)),
        "explained_variance_ratio": pca.explained_variance_ratio_.tolist(),
        "loadings": loadings.round(4).to_dict(),
        "centroids_z": centroids_z.round(3).to_dict(orient="index"),
    }
    artifacts = {"scaler": scaler, "kmeans": kmeans, "pca": pca, "features": features}
    return out, diagnostics, artifacts, centroids


def name_clusters(centroids_z):
    names = {}
    for idx, row in centroids_z.iterrows():
        edu = row.get("pct_bachelors_plus", 0.0)
        dens = row.get("log_density", 0.0)
        inc = row.get("median_income", 0.0)
        growth = row.get("pop_growth_4yr", 0.0)
        manu = row.get("pct_manufacturing", 0.0)
        if dens > 0.7 and edu > 0.5:
            label = "Dense High-Education Metro"
        elif growth > 0.5 and dens > -0.2:
            label = "Sunbelt Growth Exurb"
        elif manu > 0.6 and growth < 0:
            label = "Manufacturing Decline Belt"
        elif edu > 0.6 and dens < 0:
            label = "College Town"
        elif inc < -0.4 and dens < -0.2:
            label = "Rural Low-Income"
        elif dens < -0.5:
            label = "Rural Mixed"
        else:
            label = "Suburban Middle"
        names[int(idx)] = label
    seen = {}
    for key in sorted(names):
        base = names[key]
        if base in seen.values():
            names[key] = f"{base} {sum(1 for v in seen.values() if v.startswith(base)) + 1}"
        seen[key] = base
    return names


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--kmin", type=int, default=2)
    parser.add_argument("--kmax", type=int, default=12)
    parser.add_argument("--year", type=int, default=TEST_YEAR)
    parser.add_argument("--seed", type=int, default=SEED)
    args = parser.parse_args()

    panel = load_table(PANEL_PATH)
    snapshot = panel[panel.year == args.year].reset_index(drop=True)
    if snapshot.empty:
        snapshot = panel[panel.year == panel.year.max()].reset_index(drop=True)

    clustered, diagnostics, artifacts, centroids = fit_clusters(
        snapshot, k_range=range(args.kmin, args.kmax + 1), random_state=args.seed
    )

    centroids_z = pd.DataFrame(diagnostics["centroids_z"]).T
    names = name_clusters(centroids_z)
    diagnostics["cluster_names"] = names
    clustered["cluster_name"] = clustered.cluster_id.map(names)

    lookup = clustered[["fips", "cluster_id", "cluster_name", "dbscan_id", "pc1", "pc2"]]
    full = panel.merge(lookup, on="fips", how="left")
    full["cluster_id"] = full.cluster_id.fillna(-1).astype(int)
    full["cluster_name"] = full.cluster_name.fillna("Unassigned")
    written = save_table(full, CLUSTER_PATH)

    joblib.dump(artifacts, MODEL_DIR / "cluster_artifacts.joblib")
    with open(REPORT_DIR / "cluster_diagnostics.json", "w") as fh:
        json.dump(diagnostics, fh, indent=2)

    profile = (
        clustered.groupby("cluster_name")
        .agg(
            counties=("fips", "nunique"),
            mean_margin=("margin", "mean"),
            mean_edu=("pct_bachelors_plus", "mean"),
            mean_income=("median_income", "mean"),
            mean_density=("log_density", "mean"),
        )
        .sort_values("counties", ascending=False)
    )
    profile.round(3).to_csv(REPORT_DIR / "cluster_profile.csv")

    print(f"best k             : {diagnostics['best_k']}")
    print(f"silhouette         : {diagnostics['silhouette_by_k'][diagnostics['best_k']]:.4f}")
    print(f"dbscan eps         : {diagnostics['dbscan_eps']:.4f}")
    print(f"dbscan outliers    : {diagnostics['dbscan_outliers']}")
    print(f"pca variance       : {[round(v, 4) for v in diagnostics['explained_variance_ratio']]}")
    print()
    print(profile.round(3).to_string())
    print()
    print(f"written            : {written}")


if __name__ == "__main__":
    main()
