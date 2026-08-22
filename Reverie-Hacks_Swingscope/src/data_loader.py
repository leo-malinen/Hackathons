import json

import numpy as np
import pandas as pd

from src.config import ELECTION_YEARS, RAW_DIR, REPORT_DIR, SEED
from src.fips_fix import drop_invalid_fips, normalize_fips
from src.schema_map import PANEL_FEATURES
from src.sources import collect_features, discover, load_mit_votes

N_SYNTHETIC_COUNTIES = 3100

NATIONAL_ENV = {
    2000: 0.000,
    2004: -0.025,
    2008: 0.062,
    2012: 0.032,
    2016: 0.015,
    2020: 0.038,
}

MIT_FILE = "countypres_2000-2020.csv"
ACS_FILE = "acs2017_county_data.csv"


def generate_synthetic(seed=SEED):
    rng = np.random.default_rng(seed)
    n = N_SYNTHETIC_COUNTIES

    fips = np.array([f"{(i // 62) + 1:02d}{(i % 62) + 1:03d}" for i in range(n)])
    urban = rng.beta(2.0, 5.0, n)
    edu0 = np.clip(0.08 + 0.62 * urban + rng.normal(0, 0.06, n), 0.03, 0.86)
    hs_only = np.clip(0.92 - 1.05 * edu0 + rng.normal(0, 0.05, n), 0.08, 0.92)
    income0 = np.clip(
        26000 + 96000 * (0.45 * urban + 0.55 * edu0) + rng.normal(0, 7000, n),
        17000,
        195000,
    )
    pop0 = np.exp(rng.normal(9.4, 1.35, n)) * (1.0 + 7.0 * urban)
    land = np.exp(rng.normal(6.35, 0.75, n))
    age0 = np.clip(41.5 - 9.0 * urban + rng.normal(0, 3.5, n), 22.0, 63.0)
    white = np.clip(0.87 - 0.46 * urban + rng.normal(0, 0.12, n), 0.12, 0.995)
    black = np.clip((1.0 - white) * rng.beta(2.0, 3.0, n), 0.0, 0.62)
    hisp = np.clip((1.0 - white - black) * rng.beta(2.0, 2.0, n), 0.0, 0.56)
    asian = np.clip(1.0 - white - black - hisp, 0.0, 0.30)
    manu0 = np.clip(0.23 - 0.12 * urban + rng.normal(0, 0.05, n), 0.01, 0.42)
    unins0 = np.clip(0.20 - 0.10 * edu0 + rng.normal(0, 0.03, n), 0.02, 0.35)
    unemp0 = np.clip(0.075 - 0.035 * edu0 + rng.normal(0, 0.015, n), 0.012, 0.20)
    growth = rng.normal(0.008, 0.045, n) + 0.055 * urban

    lean0 = (
        -0.34
        + 1.35 * edu0
        + 0.50 * urban
        + 0.85 * black
        + 0.22 * hisp
        - 0.55 * manu0
        + rng.normal(0, 0.085, n)
    )
    persistent_noise = rng.normal(0, 0.03, n)

    votes_rows = []
    acs_rows = []
    pop_rows = []

    for k, year in enumerate(ELECTION_YEARS):
        t = k / (len(ELECTION_YEARS) - 1)
        realign = 0.42 * t
        lean_y = (
            lean0
            + NATIONAL_ENV[year]
            + realign * (edu0 - edu0.mean()) * 1.9
            - realign * (manu0 - manu0.mean()) * 1.6
            - realign * (urban.mean() - urban) * 0.55
            + persistent_noise
            + rng.normal(0, 0.032, n)
        )
        margin = np.clip(lean_y, -0.93, 0.93)

        pop = pop0 * np.power(1.0 + growth, k) * np.exp(rng.normal(0, 0.012, n))
        turnout = np.clip(0.50 + 0.18 * edu0 + rng.normal(0, 0.035, n), 0.28, 0.82)
        total = np.maximum(np.round(pop * turnout * 0.74), 60.0)
        third = np.clip(rng.normal(0.021, 0.009, n), 0.002, 0.07)
        dem_share = np.clip((1.0 + margin) / 2.0 * (1.0 - third), 0.01, 0.985)
        rep_share = np.clip(1.0 - third - dem_share, 0.01, 0.985)

        votes_rows.append(
            pd.DataFrame(
                {
                    "fips": fips,
                    "year": year,
                    "dem_votes": np.round(total * dem_share),
                    "rep_votes": np.round(total * rep_share),
                    "total_votes": total,
                }
            )
        )

        acs_rows.append(
            pd.DataFrame(
                {
                    "fips": fips,
                    "year": year,
                    "pct_bachelors_plus": np.clip(edu0 + 0.045 * k + rng.normal(0, 0.008, n), 0.02, 0.92),
                    "pct_hs_or_less": np.clip(hs_only - 0.035 * k + rng.normal(0, 0.008, n), 0.05, 0.95),
                    "median_income": income0 * np.power(1.031, k) * np.exp(rng.normal(0, 0.02, n)),
                    "median_age": np.clip(age0 + 0.75 * k + rng.normal(0, 0.4, n), 20.0, 68.0),
                    "pct_white": np.clip(white - 0.012 * k, 0.08, 0.995),
                    "pct_black": black,
                    "pct_hispanic": np.clip(hisp + 0.009 * k, 0.0, 0.75),
                    "pct_asian": np.clip(asian + 0.003 * k, 0.0, 0.4),
                    "unemployment_rate": np.clip(unemp0 + 0.02 * np.sin(k) + rng.normal(0, 0.006, n), 0.01, 0.25),
                    "pct_manufacturing": np.clip(manu0 - 0.014 * k + rng.normal(0, 0.006, n), 0.004, 0.45),
                    "pct_uninsured": np.clip(unins0 - 0.012 * k + rng.normal(0, 0.005, n), 0.01, 0.38),
                    "land_area_sqmi": land,
                }
            )
        )

        pop_rows.append(pd.DataFrame({"fips": fips, "year": year, "population": pop}))

    votes = pd.concat(votes_rows, ignore_index=True)
    acs = pd.concat(acs_rows, ignore_index=True)
    pop = pd.concat(pop_rows, ignore_index=True)
    return votes, acs, pop


def _interpolate_panel(parts, fips_universe, years):
    static = {}
    dynamic = {}
    for name, frame in parts.items():
        if frame is None or frame.empty:
            continue
        if "year" in frame.columns:
            dynamic[name] = frame
        else:
            static[name] = frame

    source_years = {int(y) for f in dynamic.values() for y in f.year.unique()}
    all_years = sorted(source_years | set(years))
    index = pd.MultiIndex.from_product(
        [sorted(fips_universe), all_years], names=["fips", "year"]
    )
    wide = pd.DataFrame(index=index)

    for name, frame in dynamic.items():
        series = (
            frame.dropna(subset=[name])
            .drop_duplicates(["fips", "year"], keep="last")
            .set_index(["fips", "year"])[name]
            .astype(float)
        )
        wide[name] = series.reindex(index)

    columns = list(wide.columns)
    if columns:
        wide = wide.sort_index()
        wide[columns] = wide.groupby(level="fips")[columns].transform(
            lambda s: s.interpolate(limit_direction="both")
        )

    wide = wide.reset_index()
    wide = wide[wide.year.isin(list(years))].copy()

    for name, frame in static.items():
        lean = frame.dropna(subset=[name]).drop_duplicates(["fips"], keep="last")
        wide = wide.merge(lean[["fips", name]], on="fips", how="left")

    return wide


def assemble_real(raw_dir=RAW_DIR, years=None, write_report=True):
    years = list(years or ELECTION_YEARS)
    found = discover(raw_dir)

    if "mit" not in found:
        raise FileNotFoundError(
            f"No county presidential returns file found in {raw_dir}. "
            "Expected a file whose name contains 'countypres'. "
            "Run: python scripts/download_data.py --all"
        )

    votes = load_mit_votes(found["mit"], years=years)
    parts, coverage = collect_features(found, years)
    fips_universe = set(votes.fips.unique())
    panel = _interpolate_panel(parts, fips_universe, years)

    if panel.empty:
        panel = pd.DataFrame(
            [(f, y) for f in sorted(fips_universe) for y in years], columns=["fips", "year"]
        )

    imputed = []
    for column in PANEL_FEATURES:
        if column not in panel.columns:
            panel[column] = np.nan
            imputed.append(column)
        elif panel[column].isna().all():
            imputed.append(column)

    if "population" not in panel.columns:
        panel["population"] = np.nan
        imputed.append("population")

    acs = panel[["fips", "year"] + PANEL_FEATURES].copy()
    pop = panel[["fips", "year", "population"]].copy()
    acs = drop_invalid_fips(acs)
    pop = drop_invalid_fips(pop)

    report = {
        "files_used": {
            k: ([p.name for p in v] if isinstance(v, list) else v.name)
            for k, v in found.items()
        },
        "years": years,
        "vote_rows": int(len(votes)),
        "counties": int(votes.fips.nunique()),
        "counties_per_year": {
            str(int(y)): int(c) for y, c in votes.groupby("year").fips.nunique().items()
        },
        "feature_sources": coverage,
        "features_imputed": sorted(set(imputed)),
        "real_feature_fraction": round(
            1.0 - len(set(imputed) & set(PANEL_FEATURES)) / len(PANEL_FEATURES), 3
        ),
    }

    if write_report:
        REPORT_DIR.mkdir(parents=True, exist_ok=True)
        (REPORT_DIR / "data_coverage.json").write_text(json.dumps(report, indent=2))

    return votes, acs, pop, report


def load_raw(mode="auto", seed=SEED):
    if mode == "synthetic":
        return generate_synthetic(seed) + ("synthetic",)

    if mode in ("auto", "real"):
        try:
            votes, acs, pop, report = assemble_real()
            print(
                f"[data] real mode: {report['counties']:,} counties, "
                f"{report['vote_rows']:,} county-year vote rows"
            )
            for feature, source in sorted(report["feature_sources"].items()):
                print(f"[data]   {feature:<22} <- {source}")
            if report["features_imputed"]:
                print(f"[data]   imputed: {', '.join(report['features_imputed'])}")
            return votes, acs, pop, "real"
        except Exception as exc:
            if mode == "real":
                raise
            print(f"[data] real mode unavailable ({type(exc).__name__}: {exc})")
            print("[data] falling back to synthetic. Run scripts/inspect_data.py to debug.")

    votes, acs, pop = generate_synthetic(seed)
    return votes, acs, pop, "synthetic"
