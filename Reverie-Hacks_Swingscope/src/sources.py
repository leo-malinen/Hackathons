from pathlib import Path

import numpy as np
import pandas as pd

from src.fips_fix import drop_invalid_fips, normalize_fips
from src.schema_map import (
    ACS_ALIASES,
    ERS_ATTRIBUTE_ALIASES,
    ERS_FIPS_ALIASES,
    ERS_VALUE_ALIASES,
    MIT_ALIASES,
    extract_year,
    find_column,
    norm,
    normalize_columns,
    to_number,
)

PATTERNS = {
    "mit": ["countypres"],
    "acs": ["acs", "county_data"],
    "ers_education": ["education"],
    "ers_unemployment": ["unemployment"],
    "ers_population": ["populationestimates", "population_estimates"],
    "ers_poverty": ["povertyestimates", "poverty_estimates"],
    "pep": ["co-est", "coest"],
    "gazetteer": ["gaz_counties", "gazetteer"],
    "fec": ["fec", "weball", "candidate_summary"],
}


def discover(raw_dir):
    raw_dir = Path(raw_dir)
    files = [p for p in raw_dir.rglob("*") if p.is_file()]
    found = {}
    for path in sorted(files):
        if path.suffix.lower() not in (".csv", ".txt", ".tsv"):
            continue
        key = norm(path.name)
        for label, needles in PATTERNS.items():
            if label == "acs":
                if "acs" in key and "county" in key:
                    found.setdefault("acs", []).append(path)
                continue
            if any(norm(n) in key for n in needles):
                found.setdefault(label, path)
                break
    return found


def _read_flexible(path, aliases, sep=None):
    last_error = None
    for skip in range(0, 6):
        try:
            df = pd.read_csv(
                path,
                dtype=str,
                skiprows=skip,
                sep=sep,
                engine="python" if sep is None else "c",
                encoding="latin-1",
            )
        except Exception as exc:
            last_error = exc
            continue
        df = normalize_columns(df)
        if find_column(df, aliases, required=False) is not None:
            return df
    if last_error is not None:
        raise last_error
    raise KeyError(f"{path.name}: could not locate any of {aliases} in the header")


def load_mit_votes(path, years=None):
    raw = _read_flexible(path, MIT_ALIASES["fips"])
    fips_col = find_column(raw, MIT_ALIASES["fips"], label="county FIPS")
    year_col = find_column(raw, MIT_ALIASES["year"], label="year")
    party_col = find_column(raw, MIT_ALIASES["party"], label="party")
    votes_col = find_column(raw, MIT_ALIASES["candidatevotes"], label="candidate votes")
    total_col = find_column(raw, MIT_ALIASES["totalvotes"], required=False)
    office_col = find_column(raw, MIT_ALIASES["office"], required=False)
    mode_col = find_column(raw, MIT_ALIASES["mode"], required=False)

    df = pd.DataFrame(
        {
            "fips": normalize_fips(raw[fips_col]),
            "year": to_number(raw[year_col]),
            "party": raw[party_col].fillna("OTHER").astype(str).str.upper().str.strip(),
            "votes": to_number(raw[votes_col]),
        }
    )
    if total_col is not None:
        df["totalvotes"] = to_number(raw[total_col])
    if office_col is not None:
        office = raw[office_col].astype(str).str.upper()
        df = df[office.str.contains("PRESIDENT", na=True).values]
    if mode_col is not None:
        mode = raw.loc[df.index, mode_col].astype(str).str.upper().str.strip()
        is_total = mode.eq("TOTAL")
        group_has_total = is_total.groupby([df.fips, df.year]).transform("any")
        df = df[(~group_has_total) | is_total]

    df = df.dropna(subset=["year", "votes"])
    df["year"] = df["year"].astype(int)
    if years:
        df = df[df.year.isin(list(years))]
    if df.empty:
        raise ValueError(f"{path.name}: no presidential rows survived filtering")

    def bucket(value):
        if "DEMOCRAT" in value:
            return "dem_votes"
        if "REPUBLICAN" in value:
            return "rep_votes"
        return "other_votes"

    df["bucket"] = df.party.map(bucket)
    wide = (
        df.groupby(["fips", "year", "bucket"], as_index=False)["votes"]
        .sum()
        .pivot_table(index=["fips", "year"], columns="bucket", values="votes", fill_value=0.0)
        .reset_index()
    )
    for col in ("dem_votes", "rep_votes", "other_votes"):
        if col not in wide.columns:
            wide[col] = 0.0

    if "totalvotes" in df.columns:
        totals = df.groupby(["fips", "year"], as_index=False)["totalvotes"].max()
        wide = wide.merge(totals, on=["fips", "year"], how="left")
        wide["total_votes"] = wide["totalvotes"]
    else:
        wide["total_votes"] = np.nan

    summed = wide.dem_votes + wide.rep_votes + wide.other_votes
    wide["total_votes"] = wide["total_votes"].fillna(summed)
    wide.loc[wide.total_votes < summed, "total_votes"] = summed
    wide = wide[wide.total_votes > 0]
    out = wide[["fips", "year", "dem_votes", "rep_votes", "total_votes"]].copy()
    return drop_invalid_fips(out).reset_index(drop=True)


def load_acs_kaggle(paths):
    parts = {}
    for path in paths:
        ref_year = extract_year(path.name)
        if ref_year is None:
            continue
        raw = _read_flexible(path, ACS_ALIASES["fips"])
        fips_col = find_column(raw, ACS_ALIASES["fips"], label="ACS county id")
        fips = normalize_fips(raw[fips_col])
        percent_fields = {
            "pct_white": "pct_white",
            "pct_black": "pct_black",
            "pct_hispanic": "pct_hispanic",
            "pct_asian": "pct_asian",
            "unemployment_rate": "unemployment_rate",
            "pct_manufacturing": "pct_manufacturing",
        }
        for key, out_name in percent_fields.items():
            col = find_column(raw, ACS_ALIASES[key], required=False)
            if col is None:
                continue
            frame = pd.DataFrame(
                {"fips": fips, "year": ref_year, out_name: to_number(raw[col]) / 100.0}
            ).dropna()
            parts.setdefault(out_name, []).append(frame)
        income_col = find_column(raw, ACS_ALIASES["median_income"], required=False)
        if income_col is not None:
            parts.setdefault("median_income", []).append(
                pd.DataFrame(
                    {"fips": fips, "year": ref_year, "median_income": to_number(raw[income_col])}
                ).dropna()
            )
        pop_col = find_column(raw, ACS_ALIASES["population"], required=False)
        if pop_col is not None:
            parts.setdefault("population", []).append(
                pd.DataFrame(
                    {"fips": fips, "year": ref_year, "population": to_number(raw[pop_col])}
                ).dropna()
            )
    return {k: pd.concat(v, ignore_index=True) for k, v in parts.items()}


def _ers_long(path):
    raw = _read_flexible(path, ERS_FIPS_ALIASES)
    fips_col = find_column(raw, ERS_FIPS_ALIASES, label="ERS FIPS")
    attr_col = find_column(raw, ERS_ATTRIBUTE_ALIASES, required=False)
    val_col = find_column(raw, ERS_VALUE_ALIASES, required=False)
    fips = normalize_fips(raw[fips_col])
    if attr_col is not None and val_col is not None:
        return pd.DataFrame(
            {
                "fips": fips,
                "attribute": raw[attr_col].astype(str),
                "value": to_number(raw[val_col]),
            }
        )
    keep = [c for c in raw.columns if c != fips_col]
    melted = raw[keep].copy()
    melted["fips"] = fips
    long = melted.melt(id_vars=["fips"], var_name="attribute", value_name="value")
    long["value"] = to_number(long["value"])
    return long


def _ers_feature(path, include, out_name, exclude=(), scale=1.0, how="mean"):
    long = _ers_long(path)
    keys = long.attribute.map(norm)
    mask = keys.map(lambda k: all(norm(i) in k for i in include))
    if exclude:
        mask &= keys.map(lambda k: not any(norm(x) in k for x in exclude))
    sub = long[mask].copy()
    if sub.empty:
        return None
    sub["year"] = sub.attribute.map(extract_year)
    sub = sub.dropna(subset=["year", "value"])
    if sub.empty:
        return None
    sub["year"] = sub.year.astype(int)
    grouped = sub.groupby(["fips", "year"], as_index=False)["value"]
    out = grouped.sum() if how == "sum" else grouped.mean()
    out[out_name] = out.value * scale
    return out[["fips", "year", out_name]]


def load_ers_education(path):
    parts = {}
    bachelors = _ers_feature(
        path, ["percent", "bachelor"], "pct_bachelors_plus", scale=1.0 / 100.0
    )
    if bachelors is not None:
        parts["pct_bachelors_plus"] = bachelors
    low = _ers_feature(
        path, ["percent", "less than a high school"], "a", scale=1.0 / 100.0
    )
    hs = _ers_feature(
        path, ["percent", "high school diploma only"], "b", scale=1.0 / 100.0
    )
    if low is not None and hs is not None:
        merged = low.merge(hs, on=["fips", "year"], how="outer")
        merged["pct_hs_or_less"] = merged[["a", "b"]].sum(axis=1, min_count=1)
        parts["pct_hs_or_less"] = merged[["fips", "year", "pct_hs_or_less"]].dropna()
    elif low is not None:
        parts["pct_hs_or_less"] = low.rename(columns={"a": "pct_hs_or_less"})
    return parts


def load_ers_unemployment(path):
    parts = {}
    unemp = _ers_feature(
        path, ["unemployment_rate"], "unemployment_rate", scale=1.0 / 100.0
    )
    if unemp is None:
        unemp = _ers_feature(
            path, ["unemployment", "rate"], "unemployment_rate", scale=1.0 / 100.0
        )
    if unemp is not None:
        parts["unemployment_rate"] = unemp
    income = _ers_feature(
        path,
        ["median_household_income"],
        "median_income",
        exclude=["percent"],
    )
    if income is None:
        income = _ers_feature(
            path, ["median", "income"], "median_income", exclude=["percent"]
        )
    if income is not None:
        parts["median_income"] = income
    return parts


def load_ers_population(path):
    pop = _ers_feature(path, ["pop_estimate"], "population")
    if pop is None:
        pop = _ers_feature(path, ["population", "estimate"], "population")
    return {"population": pop} if pop is not None else {}


def load_pep(path):
    raw = _read_flexible(path, ["STATE"])
    state_col = find_column(raw, ["STATE"], label="state fips")
    county_col = find_column(raw, ["COUNTY"], label="county fips")
    sumlev = find_column(raw, ["SUMLEV"], required=False)
    df = raw
    if sumlev is not None:
        df = df[df[sumlev].astype(str).str.zfill(3).eq("050")]
    fips = normalize_fips(
        df[state_col].astype(str).str.zfill(2) + df[county_col].astype(str).str.zfill(3)
    )
    frames = []
    for col in df.columns:
        key = norm(col)
        if not key.startswith("popestimate"):
            continue
        year = extract_year(col)
        if year is None:
            continue
        frames.append(
            pd.DataFrame(
                {"fips": fips, "year": year, "population": to_number(df[col])}
            ).dropna()
        )
    if not frames:
        return {}
    return {"population": pd.concat(frames, ignore_index=True)}


def load_gazetteer(path):
    sep = "\t" if path.suffix.lower() in (".txt", ".tsv") else None
    raw = _read_flexible(path, ["GEOID"], sep=sep)
    geoid = find_column(raw, ["GEOID"], label="GEOID")
    area = find_column(raw, ["ALAND_SQMI", "ALAND"], required=False)
    if area is None:
        return {}
    values = to_number(raw[area])
    if norm(area) == "aland":
        values = values / 2589988.110336
    frame = pd.DataFrame({"fips": normalize_fips(raw[geoid]), "land_area_sqmi": values}).dropna()
    return {"land_area_sqmi": frame}


def collect_features(found, years):
    parts = {}
    coverage = {}

    def absorb(new_parts, label, static=False):
        for name, frame in new_parts.items():
            if frame is None or frame.empty:
                continue
            if static:
                frame = frame.copy()
            existing = parts.get(name)
            if existing is None:
                parts[name] = frame
                coverage[name] = label
            else:
                merged = pd.concat([existing, frame], ignore_index=True)
                parts[name] = merged.drop_duplicates(["fips", "year"], keep="first") if "year" in merged.columns else merged
                coverage[name] = f"{coverage[name]} + {label}"

    if "ers_education" in found:
        absorb(load_ers_education(found["ers_education"]), "ERS Education")
    if "ers_unemployment" in found:
        absorb(load_ers_unemployment(found["ers_unemployment"]), "ERS Unemployment")
    if "ers_population" in found:
        absorb(load_ers_population(found["ers_population"]), "ERS Population")
    if "pep" in found:
        absorb(load_pep(found["pep"]), "Census PEP")
    if "acs" in found:
        absorb(load_acs_kaggle(found["acs"]), "Kaggle ACS")
    if "gazetteer" in found:
        absorb(load_gazetteer(found["gazetteer"]), "Census Gazetteer")

    return parts, coverage
