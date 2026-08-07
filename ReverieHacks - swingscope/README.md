# SwingScope

County-level electoral intelligence: cluster counties, detect which ones are likely to flip, and produce calibrated candidate win probabilities.

Three chained models:

1. **Module A** - unsupervised clustering (K-Means + DBSCAN + PCA) assigns every county an archetype.
2. **Module B** - PyTorch classifier predicts `Stable Democrat` / `Stable Republican` / `Swing`, using the Module A cluster as a learned embedding.
3. **Module C** - PyTorch binary model + isotonic calibration outputs a candidate win probability, using Module B's `p_swing` as an input feature.

Because each stage feeds the next, the repo can run an ablation study proving whether clustering actually improves downstream accuracy.

---

## Google Colab

The whole pipeline runs on a free Colab CPU instance in roughly 3-5 minutes. Everything it needs is already preinstalled on Colab except nothing at all in synthetic mode.

Open a new notebook and run:

```python
!unzip -q swingscope.zip -d /content
%cd /content/swingscope
!python -m src.run_all --mode synthetic --ablation
```

Or open `notebooks/SwingScope_Colab.ipynb` directly in Colab (File > Upload notebook).

Notes for Colab specifically:

- **No GPU required.** These are small tabular MLPs. Runtime > Change runtime type > GPU will be used automatically if present (`torch.cuda.is_available()` is checked), but CPU is fine.
- **No geopandas.** Mapping uses Plotly's county GeoJSON instead, because geopandas/GDAL installs are slow and fragile on Colab. If the GeoJSON fetch fails, the code automatically falls back to a matplotlib bar chart of the 25 most volatile counties.
- **No Kaggle key required.** `--mode synthetic` generates a realistic 3,100-county x 6-cycle panel locally, so the code runs end to end with zero credentials. Switch to `--mode real` after downloading the datasets below.
- Restarting the runtime is never required; nothing is pinned or downgraded.

---

## Datasets

| Dataset | Link |
| --- | --- |
| US Election 2020 Results by County | https://www.kaggle.com/datasets/unanimad/us-election-2020 |
| US Census Demographic Data (ACS) | https://www.kaggle.com/datasets/muonneutrino/us-census-demographic-data |
| MIT County Presidential Returns 2000-2020 | https://doi.org/10.7910/DVN/VOQCHQ |
| FEC Bulk Campaign Finance | https://www.fec.gov/data/browse-data/ |
| Census TIGER county boundaries | https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html |

To use real data:

```bash
python scripts/download_data.py
python -m src.run_all --mode real
```

`scripts/download_data.py` needs `~/.kaggle/kaggle.json` or the `KAGGLE_USERNAME` / `KAGGLE_KEY` environment variables. On Colab, upload `kaggle.json` first:

```python
from google.colab import files
files.upload()
!mkdir -p ~/.kaggle && mv kaggle.json ~/.kaggle/ && chmod 600 ~/.kaggle/kaggle.json
```

---

## Local install

```bash
git clone <your-repo-url> swingscope
cd swingscope
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m src.run_all --mode synthetic --ablation
streamlit run app/streamlit_app.py
```

All modules are run as packages from the repo root (`python -m src.module_b_swing`), not as loose scripts, so the `src` imports resolve.

---

## Running modules individually

```bash
python -m src.build_features --mode synthetic
python -m src.module_a_cluster --kmin 2 --kmax 12
python -m src.module_b_swing --epochs 150 --ablation
python -m src.module_c_winprob --epochs 200 --calibrate isotonic
python -m src.evaluate
python -m src.viz.pca_plot
python -m src.viz.volatility_map
```

---

## Outputs

| Path | Contents |
| --- | --- |
| `data/processed/county_panel.parquet` | Tidy county-year panel with engineered features and swing labels |
| `data/processed/county_clusters.parquet` | Panel plus `cluster_id`, `cluster_name`, PCA coordinates |
| `data/processed/swing_predictions.parquet` | Test-year class probabilities including `p_swing` |
| `data/processed/win_probabilities.parquet` | Calibrated per-candidate win probabilities |
| `reports/metrics.json` | Combined metrics for all three modules |
| `reports/cluster_profile.csv` | Named archetypes with size and mean margin |
| `reports/top_volatile_counties.csv` | The 25 most volatile counties |
| `reports/figures/` | Confusion matrix, reliability diagram, PCA scatter, volatility map |
| `models/` | `swingnet.pt`, `winprobnet.pt`, scalers, isotonic calibrator |

---

## Methodology decisions worth defending in the report

**Temporal validation, not random.** Train on 2008-2012, validate on 2016, test on 2020. A random split puts the same county on both sides with nearly identical features and inflates every metric.

**No leakage.** When predicting year T, every feature is drawn from year T-4 or earlier. `margin_lag1`, `margin_lag2`, `margin_vol`, and `flip_count_prior` are all shifted before any rolling window is applied. The current-cycle `margin` is only ever used to build the target.

**Swing definition.** A county is `Swing` if it flipped party in any of the three prior cycles, or if the previous margin was inside 10 points. Otherwise it is labeled by the sign of its previous margin. The threshold lives in `src/config.py:STABLE_THRESHOLD`.

**Class weighting over resampling.** Swing counties are the minority class, so the loss is inverse-frequency weighted rather than SMOTE-resampled; synthetic tabular neighbors are not meaningful for geographic units.

**Brier score as the headline metric for Module C.** A win probability is only useful if it is calibrated, so isotonic regression is fit on the validation year and applied to the test year, and a reliability diagram is produced.

**FIPS hygiene.** Codes are stored as zero-padded 5-character strings and passed through `src/fips_fix.py`, which handles the Oglala Lakota (46113 to 46102), Wade Hampton (02270 to 02158), and Bedford City (51515 to 51019) recodes.

**Synthetic spending.** Unless a real FEC file is supplied via `--spend-file`, Module C simulates campaign spending as a function of competitiveness, turnout, and incumbency. The output JSON records `spend_is_synthetic: true` so results are never overstated.

---

## Baselines

Module B is scored against a majority-class classifier, a persistence rule (predict the same as last cycle), multinomial logistic regression, and LightGBM. Module C is scored against an always-0.5 predictor. Report macro-F1 and Swing-class recall, not accuracy, since roughly 85% of counties are stable.

---

## Ablation

`python -m src.module_b_swing --ablation` trains three configurations and writes them to `reports/module_b_metrics.json`:

| Configuration | What it tests |
| --- | --- |
| `history_only` | How far prior margins alone get you |
| `history_plus_demographics` | Value added by census features |
| `full_swingscope` | Value added by the Module A cluster embedding |

---

## Submission checklist

- [ ] Push this repo to GitHub with the dataset links above in the README
- [ ] Run with `--mode real` and record final metrics
- [ ] Export `reports/metrics.json` numbers into the written report
- [ ] Include confusion matrix, reliability diagram, PCA scatter, and volatility map as figures
- [ ] Record a 3-minute demo of the Streamlit app
- [ ] State limitations: ecological fallacy, redistricting, ACS margins of error

---

## Ethics

This is a research and forecasting artifact built on public aggregate data. It operates at county level only, contains no individual voter records, and should not be used for voter targeting or suppression.
