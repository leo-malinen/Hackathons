# SwingScope

SwingScope looks at U.S. counties and answers three questions:

1. **What kind of county is this?** (groups similar counties together)
2. **Is this county likely to flip parties next election?** (Stable Democrat / Stable Republican / Swing)
3. **If a specific candidate runs here, what's their odds of winning?** (a single win probability, like a sports betting line)

Each answer feeds the next one, so the later predictions get smarter because of the earlier ones.

---

## Fastest way to try it: Google Colab

No installation and no data downloads needed for a first look — it uses realistic made-up data so you can see the whole thing work end to end.

1. Open a new notebook at [colab.research.google.com](https://colab.research.google.com), or open `notebooks/SwingScope_Colab.ipynb` directly (File > Upload notebook).
2. Run this in a cell:

```python
!unzip -q swingscope.zip -d /content
%cd /content/swingscope
!python -m src.run_all --mode synthetic --ablation
```

That's it. It takes about 3-5 minutes, needs no GPU, and needs no account or password.

---

## Running it with real data

The demo above uses made-up numbers. To get real predictions, follow these steps.

**1. Get a free Kaggle key.** Go to [kaggle.com/settings](https://www.kaggle.com/settings), click API, then "Create New Token". This downloads a file named `kaggle.json`.

**2. Give the project your key.**

On Colab:
```python
from google.colab import files
files.upload()   # choose the kaggle.json file you downloaded
!mkdir -p ~/.kaggle && cp kaggle.json ~/.kaggle/ && chmod 600 ~/.kaggle/kaggle.json
!pip install -q kaggle kagglehub
```

On your own computer:
```bash
export KAGGLE_USERNAME=your_username
export KAGGLE_KEY=your_key
```

**3. Download the data, then check it worked.**
```bash
python scripts/download_data.py --all
python scripts/inspect_data.py
```
`inspect_data.py` prints a plain-language summary of what it found and how complete it is. Always run this before training — it's much faster than discovering a problem later.

**4. Run the full pipeline on real data.**
```bash
python -m src.run_all --mode real --ablation
```

Only one dataset is required: the county election results file. Everything else is optional extra credit that improves accuracy. The full list of datasets, with links and notes on which to pick, is in [`docs/DATASETS.md`](docs/DATASETS.md).

---

## Running it on your own computer (instead of Colab)

```bash
git clone <your-repo-url> swingscope
cd swingscope
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m src.run_all --mode synthetic --ablation
streamlit run app/streamlit_app.py
```

---

## Where to find your results

| Look here | For |
| --- | --- |
| `reports/metrics.json` | The headline numbers for all three modules |
| `reports/figures/` | Charts: confusion matrix, calibration curve, cluster map, volatility map |
| `data/processed/` | The underlying data tables, one per module |
| `models/` | The trained model files |

---

## Two things worth knowing

- **The obvious Kaggle election dataset is the wrong one.** `unanimad/us-election-2020` identifies counties by name instead of a standard ID code, and covers only one election. Name matching breaks in messy ways (there are ~30 places called "Washington County", for instance). This project deliberately uses a cleaner, ID-based source instead — see `docs/DATASETS.md` for details.
- **Don't use `--mode synthetic` numbers in a report.** That mode makes up realistic-looking data so you can test that the code runs without needing any downloads. Only `--mode real` produces numbers worth reporting.

---

## Want more detail?

- [`docs/DATASETS.md`](docs/DATASETS.md) — every dataset option, direct links, and gotchas that trip up naive loaders
- [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md) — how each module works, validation approach, baselines, ablation study, and a reference for running each step individually

---

## Ethical Notes

This project only uses public, county-level aggregate data. It contains no individual voter records and is meant for research and forecasting — not for targeting or discouraging specific voters.
