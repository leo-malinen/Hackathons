import numpy as np
import pandas as pd

from src.config import ELECTION_YEARS, RAW_DIR, SEED
from src.fips_fix import drop_invalid_fips, normalize_fips

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


def _load_mit_votes(path):
    raw = pd.read_csv(path)
    raw.columns = [c.lower().strip() for c in raw.columns]
    raw = raw[raw["office"].str.upper().str.contains("PRESIDENT", na=False)]
    raw["fips"] = normalize_fips(raw["county_fips"])
    raw["party"] = raw["party"].fillna("OTHER").str.upper()
    grouped = raw.groupby(["fips", "year", "party"], as_index=False)["candidatevotes"].sum()
    wide = grouped.pivot_table(
        index=["fips", "year"], columns="party", values="candidatevotes", fill_value=0
    ).reset_index()
    wide["dem_votes"] = wide.get("DEMOCRAT", 0)
    wide["rep_votes"] = wide.get("REPUBLICAN", 0)
    totals = raw.groupby(["fips", "year"], as_index=False)["totalvotes"].max()
    out = wide[["fips", "year", "dem_votes", "rep_votes"]].merge(totals, on=["fips", "year"], how="left")
    out = out.rename(columns={"totalvotes": "total_votes"})
    out["total_votes"] = out["total_votes"].fillna(out.dem_votes + out.rep_votes)
    out = out[out.total_votes > 0]
    return drop_invalid_fips(out)


def _load_acs_snapshot(path, years):
    raw = pd.read_csv(path)
    raw.columns = [c.lower().strip() for c in raw.columns]
    base = pd.DataFrame({"fips": normalize_fips(raw["countyid"])})
    total = raw["totalpop"].replace(0, np.nan)
    base["pct_bachelors_plus"] = np.nan
    base["pct_hs_or_less"] = np.nan
    base["median_income"] = raw["income"]
    base["median_age"] = np.nan
    base["pct_white"] = raw["white"] / 100.0
    base["pct_black"] = raw["black"] / 100.0
    base["pct_hispanic"] = raw["hispanic"] / 100.0
    base["pct_asian"] = raw["asian"] / 100.0
    base["unemployment_rate"] = raw["unemployment"] / 100.0
    base["pct_manufacturing"] = raw["production"] / 100.0
    base["pct_uninsured"] = np.nan
    base["land_area_sqmi"] = total / 100.0
    base["population"] = raw["totalpop"]
    frames = []
    for year in years:
        f = base.copy()
        f["year"] = year
        frames.append(f)
    panel = pd.concat(frames, ignore_index=True)
    acs_cols = [c for c in panel.columns if c not in ("population",)]
    return panel[acs_cols], panel[["fips", "year", "population"]]


def load_raw(mode="auto", seed=SEED):
    mit_path = RAW_DIR / MIT_FILE
    acs_path = RAW_DIR / ACS_FILE
    if mode == "synthetic":
        return generate_synthetic(seed) + ("synthetic",)
    if mode in ("auto", "real") and mit_path.exists() and acs_path.exists():
        try:
            votes = _load_mit_votes(mit_path)
            years = sorted(votes.year.unique())
            acs, pop = _load_acs_snapshot(acs_path, years)
            return votes, acs, pop, "real"
        except Exception:
            if mode == "real":
                raise
    if mode == "real":
        raise FileNotFoundError(
            f"Expected {mit_path} and {acs_path}. Run scripts/download_data.py or use --mode synthetic."
        )
    votes, acs, pop = generate_synthetic(seed)
    return votes, acs, pop, "synthetic"
