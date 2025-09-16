from fastapi import FastAPI, HTTPException, Body
from pydantic import BaseModel
import joblib
import json
from pathlib import Path
import numpy as np

app = FastAPI(title="Logs Anomaly Scoring Service")

MODEL_PATH = Path(__file__).with_name('model.joblib')
INFO_PATH = Path(__file__).with_name('model_info.json')

class ScoreResponse(BaseModel):
    score: float
    anomaly: bool


def load_artifacts():
    if not MODEL_PATH.exists() or not INFO_PATH.exists():
        raise RuntimeError("Model artifacts missing. Run train.py first.")
    model = joblib.load(MODEL_PATH)
    with open(INFO_PATH, 'r', encoding='utf-8') as f:
        info = json.load(f)
    return model, info


MODEL, INFO = None, None

@app.on_event("startup")
def startup_event():
    global MODEL, INFO
    MODEL, INFO = load_artifacts()


@app.get('/model-info')
def model_info():
    global MODEL, INFO
    if INFO is None:
        try:
            MODEL, INFO = load_artifacts()
        except Exception:
            return { 'version': None, 'trained_at': None }
    return { 'version': INFO.get('version'), 'trained_at': INFO.get('trained_at') }


@app.post('/score', response_model=ScoreResponse)
def score(payload: dict = Body(...)):
    try:
        global MODEL, INFO
        if MODEL is None:
            MODEL, INFO = load_artifacts()
        data = payload.get('features') if isinstance(payload, dict) else None
        if isinstance(data, dict):
            failed_logins = int(data.get('failed_logins', 0))
            error_rate = float(data.get('error_rate', 0.0))
        else:
            failed_logins = int(payload.get('failed_logins', 0))
            error_rate = float(payload.get('error_rate', 0.0))

        X = np.array([[failed_logins, error_rate]], dtype=float)
        # IsolationForest decision_function: higher is normal, lower is anomalous. We map to [0,1] anomaly score.
        # score_samples returns higher for normal, lower for anomalies.
        raw = MODEL.score_samples(X)[0]
        # Convert raw score to 0..1 anomaly score via min-max over a plausible window
        # Here we use a heuristic: map raw in [-1, 0.5] to [1, 0]
        min_raw, max_raw = -1.0, 0.5
        norm = (raw - min_raw) / (max_raw - min_raw)
        anomaly_score = float(max(0.0, min(1.0, 1.0 - norm)))
        return { 'score': anomaly_score, 'anomaly': anomaly_score > 0.8 }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
