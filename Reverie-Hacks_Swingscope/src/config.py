from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
INTERIM_DIR = DATA_DIR / "interim"
PROCESSED_DIR = DATA_DIR / "processed"
MODEL_DIR = ROOT / "models"
REPORT_DIR = ROOT / "reports"
FIGURE_DIR = REPORT_DIR / "figures"

for _d in (RAW_DIR, INTERIM_DIR, PROCESSED_DIR, MODEL_DIR, FIGURE_DIR):
    _d.mkdir(parents=True, exist_ok=True)

PANEL_PATH = PROCESSED_DIR / "county_panel.parquet"
CLUSTER_PATH = PROCESSED_DIR / "county_clusters.parquet"
SWING_PRED_PATH = PROCESSED_DIR / "swing_predictions.parquet"
RACE_PATH = PROCESSED_DIR / "race_table.parquet"
WINPROB_PATH = PROCESSED_DIR / "win_probabilities.parquet"
METRICS_PATH = REPORT_DIR / "metrics.json"

SEED = 42

ELECTION_YEARS = [2000, 2004, 2008, 2012, 2016, 2020]
TRAIN_YEARS = [2008, 2012]
VAL_YEAR = 2016
TEST_YEAR = 2020

STABLE_THRESHOLD = 0.10
CLASSES = ["Stable Democrat", "Stable Republican", "Swing"]

DEMO_FEATURES = [
    "pct_bachelors_plus",
    "pct_hs_or_less",
    "median_income",
    "income_growth",
    "log_pop",
    "log_density",
    "pop_growth_4yr",
    "median_age",
    "pct_white",
    "pct_black",
    "pct_hispanic",
    "pct_asian",
    "unemployment_rate",
    "pct_manufacturing",
    "pct_uninsured",
]

HISTORY_FEATURES = [
    "margin_lag1",
    "margin_lag2",
    "margin_vol",
    "turnout_delta",
    "flip_count_prior",
]

RACE_FEATURES = [
    "is_incumbent",
    "log_spend",
    "log_spend_ratio",
    "prev_margin",
    "prev_margin_2",
    "partisan_lean",
    "national_env",
    "p_swing",
]
