import pandas as pd

RECODES = {
    "46113": "46102",
    "02270": "02158",
    "51515": "51019",
}

DROP_FIPS = {"00000", "99999", ""}


def normalize_fips(series):
    s = pd.Series(series).astype(str).str.strip()
    s = s.str.replace(r"\.0$", "", regex=True)
    s = s.str.extract(r"(\d+)", expand=False).fillna("")
    s = s.str.zfill(5)
    s = s.replace(RECODES)
    return s


def drop_invalid_fips(df, column="fips"):
    out = df.copy()
    out[column] = normalize_fips(out[column])
    out = out[~out[column].isin(DROP_FIPS)]
    out = out[out[column].str.len() == 5]
    return out.reset_index(drop=True)


def state_fips(series):
    return normalize_fips(series).str[:2]
