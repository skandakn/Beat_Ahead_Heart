import sys
import json
import time
from pathlib import Path

# Add backend root to sys.path so modules like src.ml_service and src.inference can be imported
BACKEND_DIR = Path(__file__).resolve().parent.parent if "api" in Path(__file__).parts else Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from src.inference import BeatAheadInferenceEngine, FeatureValidationError

MODELS_DIR = BACKEND_DIR / "models"
MANIFEST_PATH = MODELS_DIR / "MODEL_MANIFEST.json"

try:
    INFERENCE_ENGINE = BeatAheadInferenceEngine(MODELS_DIR)
except Exception as e:
    print(f"FATAL: Failed to initialize BeatAheadInferenceEngine: {e}", file=sys.stderr)
    INFERENCE_ENGINE = None

def app(environ, start_response):
    method = environ.get("REQUEST_METHOD", "GET").upper()
    raw_path = environ.get("PATH_INFO", "/") or "/"
    path = raw_path.split("?")[0].rstrip("/") or "/"

    cors_headers = [
        ("Access-Control-Allow-Origin", "*"),
        ("Access-Control-Allow-Methods", "GET, POST, OPTIONS"),
        ("Access-Control-Allow-Headers", "Content-Type, Authorization"),
    ]

    if method == "OPTIONS":
        start_response("204 No Content", cors_headers)
        return [b""]

    headers = [("Content-Type", "application/json; charset=utf-8")] + cors_headers

    if method == "GET" and path in ["/health", "/", "/api/health", "/api", "/api/index", "/api/predict"]:
        if INFERENCE_ENGINE is None:
            start_response("503 Service Unavailable", headers)
            return [json.dumps({"status": "unhealthy", "error": "Model artifact failed to load"}).encode("utf-8")]

        manifest_sha = None
        if MANIFEST_PATH.exists():
            try:
                with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
                    manifest = json.load(f)
                    manifest_sha = manifest["artifacts"]["beatahead_phase5_model.joblib"]["sha256"]
            except Exception:
                pass

        data = {
            "status": "healthy",
            "service": "BeatAhead ML Inference Service",
            "model_loaded": True,
            "model_name": INFERENCE_ENGINE.model_name,
            "model_version": INFERENCE_ENGINE.model_version,
            "feature_schema_version": INFERENCE_ENGINE.schema_version,
            "decision_threshold": round(INFERENCE_ENGINE.decision_threshold, 6),
            "feature_count": INFERENCE_ENGINE.feature_count,
            "prediction_horizon_seconds": 300,
            "model_artifact_sha256": manifest_sha,
            "provenance": {
                "cohort": "100-case VitalDB surgical cohort",
                "validation": "80-case development / 20-case locked test",
                "target": "prospective intraoperative ST-deviation event (>=60s at ST<=-1.0mm)",
                "disclaimer": "Research prototype. Not clinically validated. Not a diagnostic system."
            }
        }
        start_response("200 OK", headers)
        return [json.dumps(data).encode("utf-8")]

    if method == "POST" and path in ["/predict", "/api/ml/predict", "/api/predict", "/"]:
        if INFERENCE_ENGINE is None:
            start_response("503 Service Unavailable", headers)
            return [json.dumps({"error": "ML inference service unavailable: Model artifact not loaded"}).encode("utf-8")]

        try:
            content_length = int(environ.get("CONTENT_LENGTH", 0))
        except (ValueError, TypeError):
            content_length = 0

        if content_length > 65536:
            start_response("413 Payload Too Large", headers)
            return [json.dumps({"error": "Payload too large. Maximum size is 64 KB."}).encode("utf-8")]

        body_stream = environ.get("wsgi.input")
        raw_body = body_stream.read(content_length) if body_stream and content_length > 0 else b""
        try:
            body = json.loads(raw_body.decode("utf-8"))
        except Exception:
            start_response("400 Bad Request", headers)
            return [json.dumps({"error": "Malformed JSON payload in request body."}).encode("utf-8")]

        schema_version = body.get("feature_schema_version")
        if schema_version and schema_version != INFERENCE_ENGINE.schema_version:
            start_response("400 Bad Request", headers)
            return [json.dumps({"error": f"Unsupported feature_schema_version '{schema_version}'."}).encode("utf-8")]

        features_dict = body.get("features", body) if isinstance(body.get("features"), dict) else body
        clean_features = {k: v for k, v in features_dict.items() if k in INFERENCE_ENGINE.feature_order}

        t0 = time.perf_counter()
        try:
            pred = INFERENCE_ENGINE.predict(clean_features)
            latency_ms = round((time.perf_counter() - t0) * 1000.0, 2)
            prob = float(pred["model_probability"])
            thresh = float(pred["decision_threshold"])
            alert = bool(pred["binary_early_warning"] == 1)
            risk_tier = "High Risk" if alert else "Low Risk"

            out = {
                "status": "success",
                "probability": prob,
                "prediction": 1 if alert else 0,
                "threshold": thresh,
                "alert": alert,
                "horizon_seconds": 300,
                "gap_seconds": 300,
                "observation_seconds": 300,
                "risk_tier": risk_tier,
                "signal_quality": {
                    "ecg_sqi": float(clean_features.get("ecg_sqi", 1.0)),
                    "ppg_sqi": float(clean_features.get("ppg_sqi", 1.0)),
                    "pat_valid": int(clean_features.get("pat_valid", 1))
                },
                "metadata": {
                    "model_version": pred["model_version"],
                    "schema_version": pred["feature_schema_version"],
                    "artifact_id": "XGBoost_Matrix_A_v1_frozen",
                    "training_cohort": "VitalDB 100-case frozen benchmark",
                    "latency_ms": latency_ms
                },
                "provenance": {
                    "pipeline": "Phase 6 deployment packaging",
                    "intended_use": "Local research and demonstration only",
                    "regulatory_status": "Non-diagnostic investigational tool. Not FDA cleared or approved for clinical diagnostic use."
                }
            }
            start_response("200 OK", headers)
            return [json.dumps(out).encode("utf-8")]
        except FeatureValidationError as e:
            start_response("400 Bad Request", headers)
            return [json.dumps({"error": str(e)}).encode("utf-8")]
        except Exception:
            start_response("500 Internal Server Error", headers)
            return [json.dumps({"error": "Internal inference error. Please verify input schema."}).encode("utf-8")]

    start_response("404 Not Found", headers)
    return [json.dumps({"error": f"Endpoint not found: {path}"}).encode("utf-8")]

handler = app
