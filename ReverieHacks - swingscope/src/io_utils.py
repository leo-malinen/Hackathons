from pathlib import Path

import pandas as pd

STR_COLUMNS = {"fips": str}


def parquet_available():
    try:
        import pyarrow  # noqa: F401

        return True
    except Exception:
        pass
    try:
        import fastparquet  # noqa: F401

        return True
    except Exception:
        return False


PARQUET = parquet_available()


def resolve(path):
    path = Path(path)
    if PARQUET:
        return path
    return path.with_suffix(".csv")


def save_table(df, path):
    target = resolve(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.suffix == ".parquet":
        df.to_parquet(target, index=False)
    else:
        df.to_csv(target, index=False)
    return target


def load_table(path):
    path = Path(path)
    csv_path = path.with_suffix(".csv")
    if path.suffix == ".parquet" and path.exists() and PARQUET:
        return pd.read_parquet(path)
    if csv_path.exists():
        return pd.read_csv(csv_path, dtype=STR_COLUMNS)
    if path.exists():
        return pd.read_parquet(path)
    raise FileNotFoundError(f"Neither {path} nor {csv_path} exists. Run the earlier pipeline steps first.")


def table_exists(path):
    path = Path(path)
    return path.exists() or path.with_suffix(".csv").exists()
