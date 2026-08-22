import argparse
import io
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.config import RAW_DIR

KAGGLE_DATASETS = {
    "acs": "muonneutrino/us-census-demographic-data",
    "mit": "wumanandpat/county-presidential-election-returns-2000-2020",
}

MIT_MIRRORS = [
    "https://raw.githubusercontent.com/xsarinix/election2020-data/main/countypres_2000-2020.csv",
    "https://dataverse.harvard.edu/api/access/datafile/6104822",
]

CENSUS_FILES = {
    "co-est2020-alldata.csv": "https://www2.census.gov/programs-surveys/popest/datasets/2010-2020/counties/totals/co-est2020-alldata.csv",
}

CENSUS_ZIPS = {
    "2020_Gaz_counties_national.zip": "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2020_Gazetteer/2020_Gaz_counties_national.zip",
}

ERS_PAGE = "https://www.ers.usda.gov/data-products/county-level-data-sets/"
ERS_FILES = ["Education.csv", "Unemployment.csv", "PopulationEstimates.csv"]

UA = {"User-Agent": "Mozilla/5.0 (SwingScope data fetcher)"}


def fetch(url, dest):
    dest.parent.mkdir(parents=True, exist_ok=True)
    request = Request(url, headers=UA)
    with urlopen(request, timeout=120) as response:
        payload = response.read()
    dest.write_bytes(payload)
    return dest


def fetch_zip(url, dest_dir):
    dest_dir.mkdir(parents=True, exist_ok=True)
    request = Request(url, headers=UA)
    with urlopen(request, timeout=180) as response:
        payload = response.read()
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        archive.extractall(dest_dir)
    return dest_dir


def have_kaggle_credentials():
    if os.environ.get("KAGGLE_USERNAME") and os.environ.get("KAGGLE_KEY"):
        return True
    for candidate in (
        Path.home() / ".kaggle" / "kaggle.json",
        Path("/root/.kaggle/kaggle.json"),
        Path("/content/kaggle.json"),
    ):
        if candidate.exists():
            return True
    return False


def kaggle_download(slug, dest_dir):
    dest_dir.mkdir(parents=True, exist_ok=True)
    try:
        import kagglehub

        path = Path(kagglehub.dataset_download(slug))
        copied = 0
        for item in path.rglob("*"):
            if item.is_file() and item.suffix.lower() in (".csv", ".txt"):
                shutil.copy2(item, dest_dir / item.name)
                copied += 1
        if copied:
            print(f"  kagglehub: copied {copied} file(s) from {slug}")
            return True
    except Exception as exc:
        print(f"  kagglehub failed for {slug}: {exc}")

    command = [
        "kaggle",
        "datasets",
        "download",
        "-d",
        slug,
        "-p",
        str(dest_dir),
        "--unzip",
    ]
    try:
        subprocess.run(command, check=True)
        print(f"  kaggle CLI: downloaded {slug}")
        return True
    except FileNotFoundError:
        print("  kaggle CLI not installed. pip install kaggle kagglehub")
    except subprocess.CalledProcessError as exc:
        print(f"  kaggle CLI failed for {slug}: exit {exc.returncode}")
    return False


def do_kaggle(raw_dir):
    print("Kaggle datasets")
    if not have_kaggle_credentials():
        print("  No Kaggle credentials found.")
        print("  Create a token at https://www.kaggle.com/settings -> API -> Create New Token")
        print("  Then place kaggle.json at ~/.kaggle/kaggle.json (chmod 600),")
        print("  or export KAGGLE_USERNAME and KAGGLE_KEY.")
        return False
    ok = True
    for label, slug in KAGGLE_DATASETS.items():
        print(f"  {label}: {slug}")
        ok = kaggle_download(slug, raw_dir) and ok
    return ok


def do_mit_mirror(raw_dir):
    print("County presidential returns (mirror fallback)")
    target = raw_dir / "countypres_2000-2020.csv"
    if target.exists() and target.stat().st_size > 100_000:
        print(f"  already present: {target.name}")
        return True
    for url in MIT_MIRRORS:
        try:
            fetch(url, target)
            if target.stat().st_size > 100_000:
                print(f"  downloaded from {url.split('/')[2]}")
                return True
        except Exception as exc:
            print(f"  failed {url.split('/')[2]}: {exc}")
    print("  Manual: https://doi.org/10.7910/DVN/VOQCHQ -> countypres_2000-2020.csv")
    return False


def do_census(raw_dir):
    print("Census files")
    ok = True
    for name, url in CENSUS_FILES.items():
        target = raw_dir / name
        if target.exists():
            print(f"  already present: {name}")
            continue
        try:
            fetch(url, target)
            print(f"  downloaded {name}")
        except Exception as exc:
            print(f"  failed {name}: {exc}")
            ok = False
    for name, url in CENSUS_ZIPS.items():
        try:
            fetch_zip(url, raw_dir)
            print(f"  extracted {name}")
        except Exception as exc:
            print(f"  failed {name}: {exc}")
            ok = False
    return ok


def do_ers(raw_dir):
    print("USDA ERS county-level data sets")
    present = [f for f in ERS_FILES if (raw_dir / f).exists()]
    missing = [f for f in ERS_FILES if not (raw_dir / f).exists()]
    for name in present:
        print(f"  already present: {name}")
    if missing:
        print("  ERS rotates its download URLs, so these are a manual step:")
        print(f"    1. Open {ERS_PAGE}")
        print("    2. Download the CSV for: Education, Unemployment and median household income,")
        print("       and Population estimates")
        print(f"    3. Save them into {raw_dir} keeping the names {', '.join(missing)}")
        print("  These give real per-year education, income and unemployment back to 2000.")
        print("  Without them the panel still builds, but demographics come only from ACS.")
    return not missing


def do_check(raw_dir):
    print(f"Contents of {raw_dir}")
    files = sorted(p for p in raw_dir.rglob("*") if p.is_file())
    if not files:
        print("  empty")
        return False
    for path in files:
        size = path.stat().st_size
        print(f"  {path.relative_to(raw_dir)!s:<46} {size / 1_048_576:8.2f} MB")
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--kaggle", action="store_true")
    parser.add_argument("--census", action="store_true")
    parser.add_argument("--ers", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--raw-dir", default=str(RAW_DIR))
    args = parser.parse_args()

    raw_dir = Path(args.raw_dir)
    raw_dir.mkdir(parents=True, exist_ok=True)

    if args.check:
        return 0 if do_check(raw_dir) else 1

    run_all = args.all or not (args.kaggle or args.census or args.ers)

    if run_all or args.kaggle:
        if not do_kaggle(raw_dir):
            do_mit_mirror(raw_dir)
    if run_all or args.census:
        do_census(raw_dir)
    if run_all or args.ers:
        do_ers(raw_dir)

    print()
    do_check(raw_dir)
    print("\nNext: python scripts/inspect_data.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
