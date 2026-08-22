import re

import pandas as pd


def norm(name):
    return re.sub(r"[^a-z0-9]", "", str(name).lower())


def normalize_columns(df):
    out = df.copy()
    out.columns = [str(c).strip() for c in out.columns]
    return out


def find_column(df, aliases, required=True, label=None):
    lookup = {norm(c): c for c in df.columns}
    for alias in aliases:
        key = norm(alias)
        if key in lookup:
            return lookup[key]
    for alias in aliases:
        key = norm(alias)
        for candidate_norm, original in lookup.items():
            if key and key in candidate_norm:
                return original
    if required:
        raise KeyError(
            f"Could not find a column for {label or aliases[0]}. "
            f"Tried {aliases}. Available columns: {sorted(df.columns)}"
        )
    return None


def find_columns_matching(df, must_include, must_exclude=()):
    hits = []
    for c in df.columns:
        key = norm(c)
        if all(norm(m) in key for m in must_include) and not any(
            norm(x) in key for x in must_exclude
        ):
            hits.append(c)
    return hits


def extract_year(text):
    years = re.findall(r"(19\d{2}|20\d{2})", str(text))
    if not years:
        return None
    return int(years[0])


def to_number(series):
    if series.dtype.kind in "if":
        return series.astype(float)
    cleaned = (
        series.astype(str)
        .str.replace(",", "", regex=False)
        .str.replace("$", "", regex=False)
        .str.replace("%", "", regex=False)
        .str.strip()
        .replace({"": None, "NA": None, "N/A": None, "nan": None, "(NA)": None, "--": None})
    )
    return pd.to_numeric(cleaned, errors="coerce")


MIT_ALIASES = {
    "fips": ["county_fips", "countyfips", "fips", "fips_code", "county_fips_code"],
    "year": ["year"],
    "party": ["party", "party_simplified", "party_detailed"],
    "candidatevotes": ["candidatevotes", "candidate_votes", "votes"],
    "totalvotes": ["totalvotes", "total_votes"],
    "office": ["office"],
    "mode": ["mode"],
}

ACS_ALIASES = {
    "fips": ["CountyId", "CensusId", "county_fips", "fips", "GEOID"],
    "population": ["TotalPop", "total_pop", "population"],
    "median_income": ["Income", "median_household_income", "MedianIncome"],
    "income_per_cap": ["IncomePerCap"],
    "pct_white": ["White"],
    "pct_black": ["Black"],
    "pct_hispanic": ["Hispanic"],
    "pct_asian": ["Asian"],
    "unemployment_rate": ["Unemployment"],
    "pct_manufacturing": ["Production"],
    "pct_professional": ["Professional"],
    "pct_poverty": ["Poverty"],
    "mean_commute": ["MeanCommute"],
    "pct_work_home": ["WorkAtHome"],
    "pct_self_employed": ["SelfEmployed"],
}

ERS_FIPS_ALIASES = [
    "FIPS_Code",
    "FIPStxt",
    "FIPS_code",
    "FIPS Code",
    "fips",
    "FIPS",
    "GEOID",
]

ERS_ATTRIBUTE_ALIASES = ["Attribute", "attribute", "Variable_Name", "variable"]
ERS_VALUE_ALIASES = ["Value", "value"]

PANEL_FEATURES = [
    "pct_bachelors_plus",
    "pct_hs_or_less",
    "median_income",
    "median_age",
    "pct_white",
    "pct_black",
    "pct_hispanic",
    "pct_asian",
    "unemployment_rate",
    "pct_manufacturing",
    "pct_uninsured",
    "land_area_sqmi",
]
