import argparse

import numpy as np
import pandas as pd

from src.config import (
    DEMO_FEATURES,
    HISTORY_FEATURES,
    PANEL_PATH,
    STABLE_THRESHOLD,
    SEED,
)
from src.data_loader import load_raw
from src.fips_fix import drop_invalid_fips
from src.io_utils import save_table


def build_panel(votes, acs, pop):
    v = drop_invalid_fips(votes).copy()
    v = v[v.total_votes > 0]
    v["dem_share"] = v.dem_votes / v.total_votes
    v["rep_share"] = v.rep_votes / v.total_votes
    v["margin"] = v.dem_share - v.rep_share
    v = v.sort_values(["fips", "year"]).reset_index(drop=True)

    g = v.groupby("fips")
    v["margin_lag1"] = g.margin.shift(1)
    v["margin_lag2"] = g.margin.shift(2)
    v["margin_delta"] = v.margin - v.margin_lag1
    v["margin_vol"] = g.margin.transform(lambda s: s.shift(1).rolling(3, min_periods=2).std())
    v["turnout_delta"] = g.total_votes.pct_change()

    flipped = (np.sign(v.margin) != np.sign(v.margin_lag1)) & v.margin_lag1.notna()
    v["flipped"] = flipped.astype(int)
    v["flip_count_prior"] = (
        v.groupby("fips").flipped.transform(lambda s: s.shift(1).rolling(3, min_periods=1).sum())
    )

    acs = drop_invalid_fips(acs)
    pop = drop_invalid_fips(pop)
    df = v.merge(acs, on=["fips", "year"], how="left").merge(pop, on=["fips", "year"], how="left")

    df = df.sort_values(["fips", "year"]).reset_index(drop=True)
    df["pop_growth_4yr"] = df.groupby("fips").population.pct_change()
    df["income_growth"] = df.groupby("fips").median_income.pct_change()
    df["log_pop"] = np.log1p(df.population)
    df["log_density"] = np.log1p(df.population / df.land_area_sqmi.replace(0, np.nan))

    df = add_swing_labels(df)
    df = impute(df)
    return df


def add_swing_labels(df):
    out = df.copy()
    lag1 = out.margin_lag1
    flips = out.flip_count_prior.fillna(0)
    label = np.where(
        lag1 > 0,
        "Stable Democrat",
        "Stable Republican",
    )
    swing = (flips >= 1) | (lag1.abs() < STABLE_THRESHOLD)
    label = np.where(swing, "Swing", label)
    out["swing_label"] = np.where(lag1.isna(), None, label)
    return out


def impute(df):
    out = df.copy()
    cols = [c for c in DEMO_FEATURES + HISTORY_FEATURES if c in out.columns]
    for c in cols:
        out[c] = pd.to_numeric(out[c], errors="coerce")
        out[c] = out.groupby("year")[c].transform(lambda s: s.fillna(s.median()))
        out[c] = out[c].fillna(out[c].median())
        out[c] = out[c].replace([np.inf, -np.inf], np.nan).fillna(0.0)
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["auto", "real", "synthetic"], default="auto")
    parser.add_argument("--seed", type=int, default=SEED)
    args = parser.parse_args()

    votes, acs, pop, source = load_raw(mode=args.mode, seed=args.seed)
    panel = build_panel(votes, acs, pop)
    written = save_table(panel, PANEL_PATH)

    labelled = panel[panel.swing_label.notna()]
    print(f"data source        : {source}")
    print(f"rows               : {len(panel):,}")
    print(f"counties           : {panel.fips.nunique():,}")
    print(f"years              : {sorted(panel.year.unique())}")
    print(f"labelled rows      : {len(labelled):,}")
    print(labelled.swing_label.value_counts().to_string())
    print(f"written            : {written}")


if __name__ == "__main__":
    main()
