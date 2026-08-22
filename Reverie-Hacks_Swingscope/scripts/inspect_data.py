import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd

from src.config import ELECTION_YEARS, RAW_DIR
from src.schema_map import PANEL_FEATURES
from src.sources import collect_features, discover, load_mit_votes


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-dir", default=str(RAW_DIR))
    args = parser.parse_args()

    raw_dir = Path(args.raw_dir)
    print(f"Scanning {raw_dir}")
    found = discover(raw_dir)

    if not found:
        print("No recognised data files found.")
        print("Run: python scripts/download_data.py --all")
        return 1

    print("\nRecognised files")
    for label, value in found.items():
        if isinstance(value, list):
            for path in value:
                print(f"  {label:<18} {path.name}")
        else:
            print(f"  {label:<18} {value.name}")

    print("\nElection returns")
    if "mit" not in found:
        print("  MISSING. This file is required. Nothing else can be built without it.")
        return 1
    try:
        votes = load_mit_votes(found["mit"], years=ELECTION_YEARS)
        print(f"  rows            {len(votes):,}")
        print(f"  counties        {votes.fips.nunique():,}")
        print(f"  years           {[int(y) for y in sorted(votes.year.unique())]}")
        missing_years = sorted(int(y) for y in set(ELECTION_YEARS) - set(votes.year.unique()))
        if missing_years:
            print(f"  MISSING YEARS   {missing_years}")
        per_year = votes.groupby("year").fips.nunique()
        thin = per_year[per_year < 2800]
        if len(thin) and votes.fips.nunique() > 500:
            print(f"  THIN COVERAGE   {({int(k): int(v) for k, v in thin.items()})}")
    except Exception as exc:
        print(f"  FAILED to parse: {exc}")
        return 1

    print("\nFeature coverage")
    parts, coverage = collect_features(found, ELECTION_YEARS)
    rows = []
    for feature in PANEL_FEATURES + ["population"]:
        frame = parts.get(feature)
        if frame is None or frame.empty:
            rows.append({"feature": feature, "source": "MISSING (imputed)", "years": "", "counties": 0})
            continue
        years = sorted(frame.year.unique()) if "year" in frame.columns else ["static"]
        shown = years if len(years) <= 6 else [years[0], "...", years[-1]]
        rows.append(
            {
                "feature": feature,
                "source": coverage.get(feature, "?"),
                "years": ", ".join(str(y) for y in shown),
                "counties": frame.fips.nunique(),
            }
        )
    table = pd.DataFrame(rows)
    print(table.to_string(index=False))

    missing = [r["feature"] for r in rows if r["source"].startswith("MISSING")]
    print("\nSummary")
    print(f"  {len(rows) - len(missing)}/{len(rows)} features have real data")
    if missing:
        print(f"  imputed at build time: {', '.join(missing)}")
    print("\nNext: python -m src.build_features --mode real")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
