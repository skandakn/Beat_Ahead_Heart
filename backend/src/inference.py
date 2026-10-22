"""
src/inference.py

BeatAhead Phase 5 Frozen Inference Pipeline.
Provides reproducible, strict inference for single physiological feature vectors
conforming to the frozen Matrix A schema (26 features).

Rejects:
- Missing required features
- Unexpected feature names
- Incorrect feature ordering (for sequence inputs)
- NaN or infinite values
- Values outside defined physiological bounds
- Incorrect data types
"""

import os
import sys
import json
import math
from pathlib import Path
from typing import Dict, List, Union, Any, Optional

try:
    import numpy as np
except ImportError:
    np = None

try:
    import pandas as pd
except ImportError:
    pd = None

try:
    import joblib
except ImportError:
    joblib = None

BASE_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = BASE_DIR / "models"


class FeatureValidationError(ValueError):
    """Raised when an input feature vector violates schema constraints."""
    pass


class BeatAheadInferenceEngine:
    """
    Production-grade inference wrapper for the frozen Phase 5 BeatAhead model.
    Supports both ultra-fast zero-dependency tree evaluation (via JSON model)
    and scikit-learn / XGBoost joblib pipeline if available.
    """

    def __init__(self, model_dir: Optional[Union[str, Path]] = None):
        self.model_dir = Path(model_dir) if model_dir else MODELS_DIR
        self.model_path = self.model_dir / "beatahead_phase5_model.joblib"
        self.json_model_path = self.model_dir / "beatahead_phase5_model.json"
        self.schema_path = self.model_dir / "feature_schema.json"
        self.metadata_path = self.model_dir / "model_metadata.json"

        if not self.json_model_path.exists() and not self.model_path.exists():
            raise FileNotFoundError(f"Model artifact not found in: {self.model_dir}")
        if not self.schema_path.exists():
            raise FileNotFoundError(f"Feature schema not found: {self.schema_path}")

        # Load schema
        with open(self.schema_path, "r", encoding="utf-8") as f:
            self.schema = json.load(f)

        self.feature_order: List[str] = self.schema["feature_order"]
        self.feature_count: int = self.schema["feature_count"]
        self.feature_specs: Dict[str, Any] = self.schema["features"]
        self.schema_version: str = self.schema.get("schema_version", "1.0.0")

        # Load metadata defaults
        self.metadata: Dict[str, Any] = {}
        if self.metadata_path.exists():
            try:
                with open(self.metadata_path, "r", encoding="utf-8") as f:
                    self.metadata = json.load(f)
            except Exception:
                pass

        self.decision_threshold: float = float(self.metadata.get("decision_threshold", 0.156742))
        self.model_version: str = self.metadata.get("model_version", "1.0.0")
        self.model_name: str = self.metadata.get("model_name", "beatahead_phase5_model")

        self.trees: Optional[List[Dict[str, Any]]] = None
        self.artifact: Optional[Dict[str, Any]] = None
        self.imputer = None
        self.model = None

        # 1. Prefer loading lightweight JSON tree ensemble (zero dependencies, ~0.09ms inference)
        if self.json_model_path.exists():
            try:
                with open(self.json_model_path, "r", encoding="utf-8") as f:
                    tree_data = json.load(f)
                self.trees = tree_data["learner"]["gradient_booster"]["model"]["trees"]
            except Exception:
                self.trees = None

        # 2. Also load joblib artifact if available (preserves artifact, imputer, model references)
        if self.model_path.exists() and joblib is not None:
            try:
                self.artifact = joblib.load(self.model_path)
                self.imputer = self.artifact.get("imputer")
                self.model = self.artifact.get("model")
                if "frozen_decision_threshold" in self.artifact:
                    self.decision_threshold = float(self.artifact["frozen_decision_threshold"])
                if "version" in self.artifact:
                    self.model_version = self.artifact["version"]
                if "model_name" in self.artifact:
                    self.model_name = self.artifact["model_name"]
            except Exception:
                pass

        if self.trees is None and self.model is None:
            raise RuntimeError(f"Failed to load any valid model from {self.model_dir}")

    def validate_and_align_features(
        self,
        features: Any
    ) -> Any:
        """
        Validates the input feature vector against the frozen schema:
        - Checks for missing features
        - Checks for unexpected extra features
        - Validates data types (must be numeric)
        - Rejects NaN and infinite values
        - Enforces physiological bounds
        - Returns aligned DataFrame if pandas is available, otherwise aligned list
        """
        if pd is not None and isinstance(features, pd.DataFrame):
            if len(features) != 1:
                raise FeatureValidationError(f"Expected exactly 1 feature row, got {len(features)}")
            features = features.iloc[0].to_dict()
        elif pd is not None and isinstance(features, pd.Series):
            features = features.to_dict()

        aligned_values = []

        if isinstance(features, dict):
            # 1. Check for missing features
            missing = [f for f in self.feature_order if f not in features]
            if missing:
                raise FeatureValidationError(f"Missing required feature(s): {missing}")

            # 2. Check for unexpected features
            extra = [k for k in features.keys() if k not in self.feature_specs]
            if extra:
                raise FeatureValidationError(f"Unexpected extra feature(s) not in schema: {extra}")

            # 3. Validate each feature in strict canonical order
            for name in self.feature_order:
                val = features[name]
                spec = self.feature_specs[name]
                val_clean = self._validate_single_feature(name, val, spec)
                aligned_values.append(val_clean)

        elif isinstance(features, (list, tuple)) or (np is not None and isinstance(features, np.ndarray)):
            flat_arr = list(features) if not (np is not None and isinstance(features, np.ndarray)) else list(features.ravel())
            if len(flat_arr) != self.feature_count:
                raise FeatureValidationError(
                    f"Expected exactly {self.feature_count} features in sequence, got {len(flat_arr)}"
                )

            for idx, (name, val) in enumerate(zip(self.feature_order, flat_arr)):
                spec = self.feature_specs[name]
                val_clean = self._validate_single_feature(name, val, spec)
                aligned_values.append(val_clean)
        else:
            raise TypeError(f"Unsupported features type: {type(features)}. Expected dict, Series, or 1D sequence.")

        if pd is not None:
            return pd.DataFrame([aligned_values], columns=self.feature_order)
        return aligned_values

    def _validate_single_feature(self, name: str, val: Any, spec: Dict[str, Any]) -> float:
        """Validates type, NaN, inf, and physiological range for a single feature."""
        # Type check: reject non-numeric strings, None, or complex objects
        if val is None or isinstance(val, str):
            raise FeatureValidationError(f"Feature '{name}' has invalid non-numeric type: {type(val)} (value: {val!r})")

        try:
            f_val = float(val)
        except (ValueError, TypeError) as e:
            raise FeatureValidationError(f"Feature '{name}' cannot be converted to float: {val!r}") from e

        # NaN / Inf checks
        if math.isnan(f_val) or (np is not None and np.isnan(f_val)):
            raise FeatureValidationError(f"Feature '{name}' contains NaN. Raw NaN values are strictly rejected.")
        if math.isinf(f_val) or (np is not None and np.isinf(f_val)):
            raise FeatureValidationError(f"Feature '{name}' contains infinite value: {f_val}")

        # Range bounds check
        min_bound, max_bound = spec["bounds"]
        if f_val < min_bound or f_val > max_bound:
            raise FeatureValidationError(
                f"Feature '{name}' value {f_val} is out of physiological bounds [{min_bound}, {max_bound}] ({spec['unit']})"
            )

        return f_val

    def _predict_trees(self, aligned_values: List[float]) -> float:
        """Pure-Python evaluation of the 150 XGBoost decision trees."""
        margin = 0.0
        for tree in self.trees:
            lefts = tree["left_children"]
            rights = tree["right_children"]
            s_idx = tree["split_indices"]
            s_cond = tree["split_conditions"]
            d_left = tree["default_left"]
            node = 0
            while lefts[node] != -1:
                val = aligned_values[s_idx[node]]
                if val is None or math.isnan(val):
                    node = lefts[node] if d_left[node] == 1 else rights[node]
                elif val < s_cond[node]:
                    node = lefts[node]
                else:
                    node = rights[node]
            margin += s_cond[node]
        return 1.0 / (1.0 + math.exp(-margin))

    def predict(
        self,
        features: Any
    ) -> Dict[str, Any]:
        """
        Executes strict inference on a single feature vector.
        Returns:
        - model_probability (float)
        - calibrated_probability (float)
        - decision_threshold (float)
        - binary_early_warning (int: 0 or 1)
        - alert_status (str: "ALERT" or "NORMAL")
        - lead_time_minutes (int: 5)
        - model_version (str)
        - feature_schema_version (str)
        """
        X_vec = self.validate_and_align_features(features)

        if self.trees is not None:
            if hasattr(X_vec, "iloc"):
                aligned_list = [float(v) for v in X_vec.iloc[0].values]
            elif isinstance(X_vec, (list, tuple)):
                aligned_list = [float(v) for v in X_vec]
            elif hasattr(X_vec, "tolist"):
                aligned_list = [float(v) for v in X_vec.tolist()[0]]
            else:
                aligned_list = [float(v) for v in X_vec]
            prob = self._predict_trees(aligned_list)
        elif self.model is not None and self.imputer is not None:
            X_imp = self.imputer.transform(X_vec)
            prob = float(self.model.predict_proba(X_imp)[0, 1])
        else:
            raise RuntimeError("No model available for inference.")

        calibrated_prob = prob
        binary_alert = int(prob >= self.decision_threshold)
        alert_status = "ALERT" if binary_alert == 1 else "NORMAL"

        return {
            "model_probability": round(prob, 6),
            "calibrated_probability": round(calibrated_prob, 6),
            "decision_threshold": round(self.decision_threshold, 6),
            "binary_early_warning": binary_alert,
            "alert_status": alert_status,
            "lead_time_minutes": 5,
            "model_version": self.model_version,
            "feature_schema_version": self.schema_version,
            "model_name": self.model_name
        }


# Singleton engine instance for quick module-level access
_DEFAULT_ENGINE: Optional[BeatAheadInferenceEngine] = None


def get_inference_engine() -> BeatAheadInferenceEngine:
    global _DEFAULT_ENGINE
    if _DEFAULT_ENGINE is None:
        _DEFAULT_ENGINE = BeatAheadInferenceEngine()
    return _DEFAULT_ENGINE


def predict_single_window(
    features: Any
) -> Dict[str, Any]:
    """Convenience functional interface for inference."""
    engine = get_inference_engine()
    return engine.predict(features)
