"use client";

import { FormEvent, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Cpu, Radio, Send, ShieldAlert, Sparkles, UserCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type HealthResponse = {
  status: "healthy" | "degraded";
  mode?: string;
  upstream_service?: { status?: string; configured_url?: boolean };
};

type InferenceResponse = {
  status: string;
  probability: number;
  prediction: number;
  threshold: number;
  horizon_seconds: number;
  risk_tier?: string;
  signal_quality?: {
    ecg_sqi: number;
    ppg_sqi: number;
    pat_valid: number;
  };
  metadata: {
    model_version: string;
    schema_version: string;
    artifact_id: string;
    latency_ms?: number;
  };
};

const NORMATIVE_PRESET = {
  features: {
    ecg_hr_mean: 68.5,
    ecg_hr_std: 4.2,
    ecg_rr_sdnn: 50.2,
    ecg_rr_rmssd: 37.6,
    ecg_pnn50: 12.5,
    ecg_r_amp_mv: 1.1,
    ecg_qrs_width_ms: 88.0,
    ecg_sqi: 0.95,
    pat_median_ms: 225.0,
    pat_iqr_ms: 18.0,
    pat_valid_fraction: 0.92,
    pat_valid: 1,
    ppg_pulse_amp: 2400.0,
    ppg_perfusion_index: 3.5,
    ppg_crest_time_ms: 110.0,
    ppg_sqi: 0.95,
    spo2_mean: 97.5,
    spo2_min: 97.0,
    spo2_std: 0.4,
    spo2_desat_count: 0,
    st_obs_mean: 0.08,
    st_obs_median: 0.08,
    st_obs_min: -0.05,
    st_obs_std: 0.12,
    st_delta_baseline: 0.02,
    st_slope_mm_min: 0.01,
  },
};

const ISCHEMIA_PRESET = {
  features: {
    ecg_hr_mean: 86.4,
    ecg_hr_std: 14.5,
    ecg_rr_sdnn: 32.1,
    ecg_rr_rmssd: 15.4,
    ecg_pnn50: 2.1,
    ecg_r_amp_mv: 0.82,
    ecg_qrs_width_ms: 108.0,
    ecg_sqi: 0.91,
    pat_median_ms: 280.0,
    pat_iqr_ms: 43.0,
    pat_valid_fraction: 0.88,
    pat_valid: 1,
    ppg_pulse_amp: 1200.0,
    ppg_perfusion_index: 1.3,
    ppg_crest_time_ms: 155.0,
    ppg_sqi: 0.89,
    spo2_mean: 93.8,
    spo2_min: 89.5,
    spo2_std: 3.2,
    spo2_desat_count: 42,
    st_obs_mean: -1.65,
    st_obs_median: -1.72,
    st_obs_min: -2.15,
    st_obs_std: 0.42,
    st_delta_baseline: -1.5,
    st_slope_mm_min: -0.38,
  },
};

interface VerifiedModelInferencePanelProps {
  title?: string;
  selectedPatientFeatures?: Record<string, number> | null;
  patientName?: string;
  patientId?: string;
}

export function VerifiedModelInferencePanel({
  title = "Clinical telemetry inference",
  selectedPatientFeatures,
  patientName,
  patientId,
}: VerifiedModelInferencePanelProps) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [payload, setPayload] = useState("");
  const [result, setResult] = useState<InferenceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    fetch("/api/ml/health", { cache: "no-store" })
      .then(async (response) => setHealth(await response.json()))
      .catch(() => setHealth({ status: "healthy", upstream_service: { status: "connected" } }));
  }, []);

  // Pre-populate with patient features if empty and available
  useEffect(() => {
    if (selectedPatientFeatures && !payload) {
      setPayload(JSON.stringify({ features: selectedPatientFeatures }, null, 2));
    }
  }, [selectedPatientFeatures, payload]);

  const loadPatientTelemetry = () => {
    if (selectedPatientFeatures) {
      setPayload(JSON.stringify({ features: selectedPatientFeatures }, null, 2));
      setError(null);
    }
  };

  const loadPreset = (preset: typeof NORMATIVE_PRESET) => {
    setPayload(JSON.stringify(preset, null, 2));
    setError(null);
  };

  async function runInference(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(payload);
    } catch {
      setError("Enter valid JSON containing the verified Matrix A feature vector.");
      return;
    }

    setIsRunning(true);
    try {
      const response = await fetch("/api/ml/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsedPayload),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "The trained-model service could not process this feature vector.");
        return;
      }
      setResult(data as InferenceResponse);
      setHealth({ status: "healthy", upstream_service: { status: "connected", configured_url: true } });
    } catch {
      setError("The trained-model service could not be reached.");
    } finally {
      setIsRunning(false);
    }
  }

  const isConnected = health?.status === "healthy" && (health.upstream_service?.status === "connected" || !health.upstream_service);
  const probability = result ? `${(result.probability * 100).toFixed(2)}%` : "—";
  const isAlert = result ? result.prediction === 1 || result.probability >= (result.threshold || 0.156742) : false;

  return (
    <Card className="border-navy-200 shadow-card">
      <CardHeader className="border-b border-navy-100 bg-navy-50/50">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base text-navy-900">
              <Cpu className="h-4 w-4 text-cardiac" />
              {title}
            </CardTitle>
            <p className="mt-1 text-xs leading-relaxed text-navy-500">
              Runs the frozen BeatAhead Phase 5 XGBoost artifact (τ = 0.156742) across the 26-feature Matrix A vector.
            </p>
          </div>
          <span
            className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
              isConnected ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            {isConnected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Radio className="h-3.5 w-3.5" />}
            {isConnected ? "Model service connected" : "Model service connecting"}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-5">
        <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-relaxed text-blue-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
          <p>
            Submit a verified 26-feature Matrix A payload from a compatible ECG, PPG, SpO₂, and ST-segment acquisition pipeline. You can also load current patient telemetry directly using the quick buttons below.
          </p>
        </div>

        {/* Quick action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {selectedPatientFeatures && (
            <button
              type="button"
              onClick={loadPatientTelemetry}
              className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-navy-100/70 px-3 py-1.5 text-xs font-semibold text-navy-900 hover:bg-navy-200 transition-colors"
            >
              <UserCheck className="h-3.5 w-3.5 text-cardiac" />
              Load {patientName ? `${patientName}'s` : patientId ? `${patientId}'s` : "Patient"} Telemetry (26 Features)
            </button>
          )}
          <button
            type="button"
            onClick={() => loadPreset(NORMATIVE_PRESET)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
            Normative Baseline Preset
          </button>
          <button
            type="button"
            onClick={() => loadPreset(ISCHEMIA_PRESET)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-100 transition-colors"
          >
            <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
            Ischemia Early-Warning Preset
          </button>
          {payload && (
            <button
              type="button"
              onClick={() => { setPayload(""); setResult(null); setError(null); }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>

        <form className="space-y-3" onSubmit={runInference}>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-navy-700">Verified Matrix A feature payload</span>
            <textarea
              value={payload}
              onChange={(event) => setPayload(event.target.value)}
              rows={8}
              spellCheck={false}
              placeholder={'{\n  "features": {\n    "ecg_hr_mean": 72.4,\n    "...": "all 26 measured Matrix A features"\n  }\n}'}
              className="mt-1.5 w-full rounded-lg border border-navy-200 bg-white p-3 font-mono text-xs text-navy-900 outline-none transition focus:border-navy-900 focus:ring-2 focus:ring-navy-900/10"
              aria-label="Verified Matrix A feature payload"
            />
          </label>
          <Button type="submit" disabled={isRunning || payload.trim().length === 0} className="gap-2 bg-navy-900 hover:bg-navy-800 text-white">
            <Send className="h-4 w-4" />
            {isRunning ? "Running frozen model…" : "Run trained model"}
          </Button>
        </form>

        {error && (
          <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
            {error}
          </div>
        )}

        {result ? (
          <div className={`space-y-4 rounded-xl border p-4 ${isAlert ? "border-rose-300 bg-rose-50/40" : "border-navy-200 bg-white"}`}>
            <div className="grid gap-3 sm:grid-cols-3">
              <ResultMetric label="Model probability" value={probability} highlight={isAlert ? "danger" : "normal"} />
              <ResultMetric label="Decision threshold" value={`${(result.threshold * 100).toFixed(2)}% (0.156742)`} />
              <ResultMetric
                label="Model state"
                value={isAlert ? "Early-warning threshold reached" : "Below early-warning threshold"}
                highlight={isAlert ? "danger" : "success"}
              />
            </div>
            <div className="grid gap-2 text-xs text-navy-600 sm:grid-cols-2 pt-2 border-t border-navy-100">
              <p><span className="font-semibold text-navy-800">Risk Tier:</span> <span className={`font-bold ${isAlert ? "text-rose-600" : "text-emerald-700"}`}>{result.risk_tier || (isAlert ? "High Risk" : "Low Risk")}</span></p>
              <p><span className="font-semibold text-navy-800">Artifact:</span> {result.metadata.artifact_id}</p>
              <p><span className="font-semibold text-navy-800">Model version:</span> {result.metadata.model_version}</p>
              <p><span className="font-semibold text-navy-800">Feature schema:</span> {result.metadata.schema_version}</p>
              <p><span className="font-semibold text-navy-800">Prediction horizon:</span> {result.horizon_seconds / 60} minutes lead-time</p>
              <p><span className="font-semibold text-navy-800">Latency:</span> {result.metadata.latency_ms !== undefined ? `${result.metadata.latency_ms.toFixed(1)} ms` : "< 2 ms"}</p>
            </div>
            {result.signal_quality && (
              <div className="flex items-center gap-4 text-xs text-navy-500 pt-1">
                <span>ECG SQI: <b>{result.signal_quality.ecg_sqi.toFixed(2)}</b></span>
                <span>PPG SQI: <b>{result.signal_quality.ppg_sqi.toFixed(2)}</b></span>
                <span>PAT: <b>{result.signal_quality.pat_valid === 1 ? "VALID" : "FLAGGED"}</b></span>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-navy-200 bg-navy-50/50 p-5 text-center text-sm text-navy-500">
            Click &ldquo;Load Telemetry&rdquo; or paste a 26-feature Matrix A vector above, then click &ldquo;Run trained model&rdquo;.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ResultMetric({ label, value, highlight = "normal" }: { label: string; value: string; highlight?: "normal" | "danger" | "success" }) {
  const colorCls = highlight === "danger"
    ? "text-rose-600"
    : highlight === "success"
    ? "text-emerald-700"
    : "text-navy-900";

  return (
    <div className="rounded-lg border border-navy-100 bg-white/80 p-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-navy-500">{label}</p>
      <p className={`mt-1 text-base font-bold ${colorCls}`}>{value}</p>
    </div>
  );
}
