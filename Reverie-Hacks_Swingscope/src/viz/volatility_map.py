import json
from urllib.request import urlopen

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import pandas as pd

from src.config import FIGURE_DIR, SWING_PRED_PATH
from src.io_utils import load_table

GEOJSON_URL = "https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json"


def load_geojson(url=GEOJSON_URL, timeout=25):
    with urlopen(url, timeout=timeout) as response:
        return json.load(response)


def choropleth(df, out_html=None, out_png=None):
    out_html = out_html or (FIGURE_DIR / "volatility_map.html")
    out_png = out_png or (FIGURE_DIR / "volatility_map.png")
    try:
        import plotly.express as px

        counties = load_geojson()
        fig = px.choropleth(
            df,
            geojson=counties,
            locations="fips",
            color="p_swing",
            color_continuous_scale="magma",
            range_color=(0, 1),
            scope="usa",
            labels={"p_swing": "P(Swing)"},
            hover_data=["cluster_name", "margin"],
        )
        fig.update_traces(marker_line_width=0)
        fig.update_layout(
            title="Most Volatile Counties in America - SwingScope",
            margin=dict(l=0, r=0, t=50, b=0),
        )
        fig.write_html(out_html)
        return {"html": str(out_html), "png": None, "mode": "choropleth"}
    except Exception as exc:
        path = fallback_bar(df, out_png)
        return {"html": None, "png": str(path), "mode": f"fallback ({type(exc).__name__})"}


def fallback_bar(df, out_png=None, top_n=25):
    out_png = out_png or (FIGURE_DIR / "volatility_top25.png")
    top = df.nlargest(top_n, "p_swing").sort_values("p_swing")
    fig, ax = plt.subplots(figsize=(10, 9))
    ax.barh(top.fips.astype(str) + "  " + top.cluster_name.astype(str), top.p_swing, color="#b5179e")
    ax.set_xlabel("P(Swing)")
    ax.set_title(f"Top {top_n} most volatile counties")
    ax.set_xlim(0, 1)
    fig.tight_layout()
    fig.savefig(out_png, dpi=180)
    plt.close(fig)
    return out_png


def top_volatile_table(df, top_n=25, out_csv=None):
    out_csv = out_csv or (FIGURE_DIR.parent / "top_volatile_counties.csv")
    cols = ["fips", "cluster_name", "margin", "margin_lag1", "swing_label", "pred_label", "p_swing"]
    top = df.nlargest(top_n, "p_swing")[[c for c in cols if c in df.columns]]
    top.round(4).to_csv(out_csv, index=False)
    return top


if __name__ == "__main__":
    frame = load_table(SWING_PRED_PATH)
    print(choropleth(frame))
    print(top_volatile_table(frame).to_string(index=False))
