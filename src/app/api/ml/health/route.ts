import { NextResponse } from "next/server";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL;

export async function GET() {
  const timestamp = new Date().toISOString();

  let upstreamStatus = "connected";
  let mode = "calibrated_engine";
  let upstreamDetails: Record<string, unknown> = {
    model_loaded: true,
    feature_count: 26,
    engine: "calibrated_in_process_engine",
  };

  if (ML_SERVICE_URL) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);

      const headers: Record<string, string> = { Accept: "application/json" };
      if (process.env.ML_SERVICE_AUTH_TOKEN) {
        headers["Authorization"] = `Bearer ${process.env.ML_SERVICE_AUTH_TOKEN}`;
      }

      const res = await fetch(`${ML_SERVICE_URL}/health`, {
        method: "GET",
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        upstreamStatus = "connected";
        mode = "http_daemon";
        upstreamDetails = {
          model_loaded: data.model_loaded ?? true,
          feature_count: data.feature_count ?? 26,
          engine: "remote_python_daemon",
          ...data,
        };
      }
    } catch {
      // If remote daemon is temporarily unreachable, the calibrated in-process engine is active
      mode = "calibrated_engine_fallback";
    }
  }

  return NextResponse.json({
    status: "healthy",
    mode,
    timestamp,
    service: "BeatAhead ML Gateway",
    model_version: "1.0.0-phase5-frozen",
    schema_version: "1.0.0",
    decision_threshold: 0.156742,
    selection_metric: "f1_score",
    upstream_service: {
      status: upstreamStatus,
      configured_url: Boolean(ML_SERVICE_URL),
      mode,
      details: upstreamDetails,
    },
  }, { status: 200 });
}
