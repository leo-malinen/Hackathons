# Datasets

Everything here is free. Only the first file is mandatory.

## Quick answer

| # | Dataset | Source | Needed? | What it gives you |
|---|---------|--------|---------|-------------------|
| 1 | County presidential returns 2000-2020 | Kaggle mirror or MIT Election Lab | **Required** | Margins, turnout, the swing labels |
| 2 | ERS county-level data sets | USDA ERS (direct, no login) | **Strongly recommended** | Per-year education, income, unemployment, population |
| 3 | US Census Demographic Data (ACS) | Kaggle | Recommended | Race mix, industry mix, commute |
| 4 | County population totals | Census PEP (direct) | Optional | Annual population 2010-2020 |
| 5 | County Gazetteer | Census (direct) | Optional | Land area, needed for density |
| 6 | Candidate financials | FEC bulk data | Optional | Real spending for Module C |

The pipeline degrades gracefully. With only #1 it still runs, and anything missing gets
median-imputed with the imputation flag recorded in `reports/data_coverage.json`.

---

## 1. County presidential returns (required)

- **Kaggle:** `wumanandpat/county-presidential-election-returns-2000-2020`
- **Original:** MIT Election Data and Science Lab, <https://doi.org/10.7910/DVN/VOQCHQ>
- **Save as:** `data/raw/countypres_2000-2020.csv`

This is the backbone. It is the only county-level returns file that has **real FIPS codes
and all six election cycles in one table**. Every label and every history feature is derived
from it.

Two things the loader handles for you:

- **2020 rows are split by voting mode** (`ELECTION DAY`, `ABSENTEE`, `EARLY VOTE`) while
  earlier years use a single `TOTAL` row. Naively summing `candidatevotes` double-counts
  any year that has both. The loader keeps `TOTAL` rows when a county-year has them and
  sums the modes only when it does not.
- **Third parties** are bucketed into `other_votes` so `total_votes` stays consistent.

The MIT version on Dataverse now covers **2000-2024**. Extra years are filtered out unless
you add them to `ELECTION_YEARS` in `src/config.py`. Harvard Dataverse has been throttling
non-browser API access, so prefer the Kaggle mirror.

## 2. USDA ERS county-level data sets (strongly recommended)

- **Page:** <https://www.ers.usda.gov/data-products/county-level-data-sets/>
- **Save as:** `data/raw/Education.csv`, `data/raw/Unemployment.csv`, `data/raw/PopulationEstimates.csv`

This is the single highest-value addition and the reason the project stops being a
snapshot model. ERS publishes **one value per county per year going back to 1970**, which
means `income_growth`, `pop_growth_4yr` and `margin_vol` are computed from genuinely
different years instead of the same number copied six times.

Without ERS your demographics are frozen at 2015/2017 and every growth feature is
structurally zero. The model still trains. It just cannot see change, which is most of
what Module B is supposed to detect.

ERS rotates its download URLs, so `scripts/download_data.py` prints instructions rather
than pretending it can fetch them. Both the modern long format
(`FIPS_Code, State, Area_Name, Attribute, Value`) and the older wide format
(`Unemployment_rate_2000`, ...) are parsed.

## 3. Kaggle US Census Demographic Data (recommended)

- **Kaggle:** `muonneutrino/us-census-demographic-data`
- **Save as:** `data/raw/acs2015_county_data.csv`, `data/raw/acs2017_county_data.csv`

Use the **county** files, not the tract files. Download both years: two snapshots let the
loader interpolate instead of holding a single year constant.

A real gotcha that silently breaks naive loaders: **`acs2015_county_data.csv` names its key
column `CensusId`, and `acs2017_county_data.csv` names it `CountyId`.** Anything hardcoded
to one of them fails on the other. `src/schema_map.py` resolves both, along with `GEOID`
and `county_fips`.

What this file does **not** contain: educational attainment, median age, and insurance
coverage. Education comes from ERS. `median_age` and `pct_uninsured` have no free
county-year source in this stack and are imputed. That is disclosed in the coverage report
rather than hidden.

## 4. Census population estimates (optional)

- **Direct:** <https://www2.census.gov/programs-surveys/popest/datasets/2010-2020/counties/totals/co-est2020-alldata.csv>
- **Save as:** `data/raw/co-est2020-alldata.csv`

Annual population 2010-2020, filtered to `SUMLEV == 050`. Redundant if you have ERS
`PopulationEstimates.csv`, but it is a stable URL and downloads without login.

## 5. Census Gazetteer (optional)

- **Direct:** <https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2020_Gazetteer/2020_Gaz_counties_national.zip>
- **Save as:** `data/raw/2020_Gaz_counties_national.txt`

Supplies `ALAND_SQMI`, the only way to compute population density, which is one of the
strongest cluster separators. Tab-separated, so it is read with an explicit separator.

## 6. FEC candidate financials (optional)

- **Page:** <https://www.fec.gov/data/browse-data/?tab=bulk-data>

Module C needs per-race spending. Without a spend file it generates a **synthetic spend
column** and sets `spend_is_synthetic: true` in `reports/module_c_metrics.json`. Do not
report spending coefficients as real findings while that flag is true. Pass a real file with
`--spend-file` once you have one.

---

## Datasets deliberately not used

**`unanimad/us-election-2020`** is the most popular county election dataset on Kaggle and
is the wrong choice here. It identifies counties by **name, not FIPS**, and covers 2020
only. Joining on name is a trap: there are about 30 Washington Counties, dozens of
Jefferson Counties, Louisiana has parishes, Alaska has boroughs, and Virginia has
independent cities that share a name with an adjacent county. You would spend the whole
datathon on fuzzy string matching and still lose rows. The MIT file has clean FIPS and six
cycles. Use it.

**Tract-level ACS** requires aggregating tracts to counties with population weights. The
same Kaggle dataset already ships the county rollup.

**Shapefiles / geopandas** are avoided entirely. Mapping uses a Plotly county GeoJSON so
nothing has to compile on Colab.

---

## Loading it

### On Colab

Upload your Kaggle token, then let the script do the rest.

```python
from google.colab import files
files.upload()          # select kaggle.json

!mkdir -p ~/.kaggle && cp kaggle.json ~/.kaggle/ && chmod 600 ~/.kaggle/kaggle.json
!pip install -q kaggle kagglehub
!python scripts/download_data.py --all
!python scripts/inspect_data.py
```

Get `kaggle.json` from <https://www.kaggle.com/settings> under API, then
"Create New Token".

### Locally

```bash
export KAGGLE_USERNAME=your_username
export KAGGLE_KEY=your_key

python scripts/download_data.py --all
python scripts/inspect_data.py
```

### Fully manual

Download the files by hand and drop them in `data/raw/` using the filenames above. Names
are matched by substring and are case-insensitive, so `Education (1).csv` still resolves.
Then run `python scripts/inspect_data.py`.

### Then build

```bash
python -m src.build_features --mode real
python -m src.run_all --mode real --ablation
```

`--mode auto` tries real data and falls back to synthetic with a printed warning.
`--mode real` fails loudly instead, which is what you want in a submission run.

---

## Always check coverage first

`python scripts/inspect_data.py` prints which files were recognised, how many counties and
years survived parsing, and which feature came from which source. Run it before training.
It is much cheaper than discovering after a training run that 12 features were silently
median-imputed.

The same information is written to `reports/data_coverage.json` on every real build, so you
can quote exact provenance in your report.

## Expected real-data shape

| Check | Expected |
|-------|----------|
| Counties | ~3,110-3,150 |
| County-year vote rows | ~18,600 |
| Years | 2000, 2004, 2008, 2012, 2016, 2020 |
| Labelled rows | ~15,500 (2000 and 2004 are consumed by lags) |
| Real feature fraction | 0.83 with ERS + ACS + Gazetteer |

If counties come out near 2,800 or below, your returns file is probably missing a state.
Alaska is the usual culprit: it reports by legislative district, not borough, and MIT codes
it as a single statewide FIPS.

## FIPS handling

FIPS codes are strings, always five characters, zero-padded. Reading them as integers drops
the leading zero on every Alabama, Alaska, Arizona, Arkansas, California, Colorado and
Connecticut county. `src/fips_fix.py` also recodes boundary changes so counties stay joinable
across 2000-2020:

| Old | New | Reason |
|-----|-----|--------|
| 46113 | 46102 | Shannon County SD renamed Oglala Lakota, 2015 |
| 02270 | 02158 | Wade Hampton AK renamed Kusilvak, 2015 |
| 51515 | 51019 | Bedford City VA merged into Bedford County, 2013 |
