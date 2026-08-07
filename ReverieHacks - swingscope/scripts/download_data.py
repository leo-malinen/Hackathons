import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
RAW.mkdir(parents=True, exist_ok=True)

KAGGLE_DATASETS = [
    "muonneutrino/us-census-demographic-data",
    "unanimad/us-election-2020",
]

MIT_URL = "https://dataverse.harvard.edu/api/access/datafile/6104822"


def have_kaggle_credentials():
    if os.environ.get("KAGGLE_USERNAME") and os.environ.get("KAGGLE_KEY"):
        return True
    return (Path.home() / ".kaggle" / "kaggle.json").exists()


def download_kaggle():
    if not have_kaggle_credentials():
        print("No Kaggle credentials found.")
        print("Upload kaggle.json to ~/.kaggle/ or set KAGGLE_USERNAME and KAGGLE_KEY.")
        return False
    ok = True
    for dataset in KAGGLE_DATASETS:
        print(f"downloading {dataset}")
        result = subprocess.run(
            [sys.executable, "-m", "kaggle", "datasets", "download", "-d", dataset, "-p", str(RAW), "--unzip"]
        )
        ok = ok and result.returncode == 0
    return ok


def download_mit():
    target = RAW / "countypres_2000-2020.csv"
    if target.exists():
        print(f"already present: {target}")
        return True
    try:
        from urllib.request import urlretrieve

        print("downloading MIT county presidential returns")
        urlretrieve(MIT_URL, target)
        return True
    except Exception as exc:
        print(f"MIT download failed: {exc}")
        print("Download manually from https://doi.org/10.7910/DVN/VOQCHQ")
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-kaggle", action="store_true")
    args = parser.parse_args()

    mit_ok = download_mit()
    kaggle_ok = True if args.skip_kaggle else download_kaggle()

    print()
    print(f"raw directory : {RAW}")
    for path in sorted(RAW.glob("*")):
        print(f"   {path.name}")
    if not (mit_ok and kaggle_ok):
        print()
        print("Some downloads failed. The pipeline still runs with --mode synthetic.")


if __name__ == "__main__":
    main()
