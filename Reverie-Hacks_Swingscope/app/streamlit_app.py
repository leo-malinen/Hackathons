import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import joblib
import numpy as np
import pandas as pd
import streamlit as st
import torch

from src.config import CLUSTER_PATH, MODEL_DIR, RACE_PATH, SWING_PRED_PATH
from src.io_utils import load_table, table_exists
from src.module_c_winprob import WinProbNet

st.set_page_config(page_title="SwingScope", page_icon="US", layout="wide")
st.title("SwingScope")
st.caption("County clustering, swing detection, and calibrated win probability")


@st.cache_data
def load_frames():
    swing = load_table(SWING_PRED_PATH) if table_exists(SWING_PRED_PATH) else None
    races = load_table(RACE_PATH) if table_exists(RACE_PATH) else None
    clusters = load_table(CLUSTER_PATH) if table_exists(CLUSTER_PATH) else None
    return swing, races, clusters


@st.cache_resource
def load_winprob():
    ckpt_path = MODEL_DIR / "winprobnet.pt"
    if not ckpt_path.exists():
        return None, None, None, None
    ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=False)
    features = ckpt["features"]
    model = WinProbNet(len(features))
    model.load_state_dict(ckpt["state_dict"])
    model.eval()
    scaler = joblib.load(MODEL_DIR / "winprob_scaler.joblib")
    calib_path = MODEL_DIR / "winprob_calibrator.joblib"
    calibrator = joblib.load(calib_path) if calib_path.exists() else None
    return model, scaler, calibrator, features


swing, races, clusters = load_frames()
model, scaler, calibrator, features = load_winprob()

if swing is None:
    st.warning("No predictions found. Run: python -m src.run_all --mode synthetic")
    st.stop()

tab1, tab2, tab3 = st.tabs(["Clusters", "Swing counties", "Win probability"])

with tab1:
    if clusters is not None:
        st.subheader("County archetypes")
        profile = (
            clusters.groupby("cluster_name")
            .agg(counties=("fips", "nunique"), mean_margin=("margin", "mean"))
            .sort_values("counties", ascending=False)
        )
        st.dataframe(profile.round(3))
        st.scatter_chart(clusters.dropna(subset=["pc1", "pc2"]), x="pc1", y="pc2", color="cluster_name")

with tab2:
    st.subheader("Most volatile counties")
    threshold = st.slider("Minimum P(Swing)", 0.0, 1.0, 0.5, 0.05)
    filtered = swing[swing.p_swing >= threshold].sort_values("p_swing", ascending=False)
    st.metric("Counties above threshold", len(filtered))
    st.dataframe(
        filtered[["fips", "cluster_name", "margin_lag1", "margin", "swing_label", "pred_label", "p_swing"]]
        .head(200)
        .round(4)
    )

with tab3:
    st.subheader("Candidate win probability")
    if model is None or races is None:
        st.info("Run module C first: python -m src.module_c_winprob")
    else:
        col1, col2 = st.columns(2)
        with col1:
            incumbent = st.checkbox("Incumbent", value=True)
            prev_margin = st.slider("Previous margin", -0.60, 0.60, 0.04, 0.01)
            prev_margin_2 = st.slider("Margin two cycles ago", -0.60, 0.60, 0.02, 0.01)
            p_swing = st.slider("P(Swing) from Module B", 0.0, 1.0, 0.7, 0.05)
        with col2:
            spend_ratio = st.slider("Log spending ratio vs opponent", -2.5, 2.5, 0.0, 0.1)
            log_spend = st.slider("Log total spend", 10.0, 18.0, 14.0, 0.1)
            national_env = st.slider("National environment", -0.08, 0.08, 0.02, 0.005)
            cluster_choice = st.selectbox("County archetype", sorted(races.cluster_name.dropna().unique()))

        row = {f: 0.0 for f in features}
        row.update(
            {
                "is_incumbent": float(incumbent),
                "log_spend": log_spend,
                "log_spend_ratio": spend_ratio,
                "prev_margin": prev_margin,
                "prev_margin_2": prev_margin_2,
                "partisan_lean": prev_margin - float(races.prev_margin.mean()),
                "national_env": national_env,
                "p_swing": p_swing,
            }
        )
        key = f"cluster_mix_{cluster_choice}"
        if key in row:
            row[key] = 1.0

        X = scaler.transform(pd.DataFrame([row])[features].astype(float))
        with torch.no_grad():
            raw = float(torch.sigmoid(model(torch.tensor(X, dtype=torch.float32)))[0])
        prob = float(calibrator.predict([raw])[0]) if calibrator is not None else raw

        st.metric("Calibrated win probability", f"{prob * 100:.1f}%")
        st.progress(min(max(prob, 0.0), 1.0))
        st.caption(f"Uncalibrated model output: {raw * 100:.1f}%")
