import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface ECGProcessRequest {
  samples: number[];
  sampling_rate?: number;
  baseline_st_mm?: number;
}

export async function POST(request: Request) {
  try {
    const body: ECGProcessRequest = await request.json();
    const rawSamples = body.samples;

    if (!rawSamples || !Array.isArray(rawSamples) || rawSamples.length === 0) {
      return NextResponse.json(
        { error: "Missing or invalid 'samples' array" },
        { status: 400 }
      );
    }

    const fs = body.sampling_rate || 250.0;
    const baselineST = body.baseline_st_mm || 0.0;

    // 1. Digital Filter Pipeline: Centering & Noise Reduction
    let dcBaseline = 512.0;
    const alphaBaseline = 0.005;
    const alphaSmooth = 0.45;
    let smoothVal = 0.0;
    const filteredMv: number[] = [];

    for (let i = 0; i < rawSamples.length; i++) {
      let val = rawSamples[i];
      if (typeof val !== "number" || isNaN(val)) {
        val = 512.0;
      }
      val = Math.max(0, Math.min(1023, val));

      // Highpass / DC-tracker
      dcBaseline = (1 - alphaBaseline) * dcBaseline + alphaBaseline * val;
      const zeroMean = val - dcBaseline;

      // Lowpass / Smoothing
      smoothVal = (1 - alphaSmooth) * smoothVal + alphaSmooth * zeroMean;

      // Convert to millivolts (3.3V / 1023 * 3300 / 1100 gain * 2.5)
      const mv = (smoothVal / 1023.0) * (3300.0 / 1100.0) * 2.5;
      filteredMv.push(Number(mv.toFixed(4)));
    }

    // 2. QRS & R-Peak Detection
    const rPeaks: number[] = [];
    const refractorySamples = Math.floor(0.22 * fs); // 220ms minimum distance
    let lastPeak = -Math.floor(0.25 * fs);

    // Differentiation and integration
    const diffs: number[] = [0];
    for (let i = 1; i < filteredMv.length; i++) {
      diffs.push(Math.abs(filteredMv[i] - filteredMv[i - 1]) * fs);
    }

    const intWindow = Math.max(3, Math.floor(0.12 * fs));
    const integrated: number[] = [];
    for (let i = 0; i < diffs.length; i++) {
      const start = Math.max(0, i - intWindow + 1);
      const slice = diffs.slice(start, i + 1);
      const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
      integrated.push(avg);
    }

    const avgIntegrated = integrated.reduce((a, b) => a + b, 0) / (integrated.length || 1);
    const peakThresh = avgIntegrated * 1.8;

    for (let i = 1; i < integrated.length - 1; i++) {
      if (
        integrated[i] > peakThresh &&
        integrated[i] > integrated[i - 1] &&
        integrated[i] > integrated[i + 1]
      ) {
        if (i - lastPeak >= refractorySamples) {
          // Find local maximum in filteredMv
          const searchStart = Math.max(0, i - 15);
          const searchEnd = Math.min(filteredMv.length, i + 15);
          let localMaxIdx = searchStart;
          let maxVal = filteredMv[searchStart];
          for (let j = searchStart + 1; j < searchEnd; j++) {
            if (filteredMv[j] > maxVal) {
              maxVal = filteredMv[j];
              localMaxIdx = j;
            }
          }
          rPeaks.push(localMaxIdx);
          lastPeak = i;
        }
      }
    }

    // 3. Heart Rate (BPM) & HRV
    let bpm = 72;
    const rrIntervalsMs: number[] = [];
    if (rPeaks.length >= 2) {
      for (let i = 1; i < rPeaks.length; i++) {
        const rrSamples = rPeaks[i] - rPeaks[i - 1];
        const rrMs = (rrSamples / fs) * 1000.0;
        if (rrMs >= 300 && rrMs <= 1500) {
          rrIntervalsMs.push(Number(rrMs.toFixed(1)));
        }
      }
      if (rrIntervalsMs.length > 0) {
        const meanRr = rrIntervalsMs.reduce((a, b) => a + b, 0) / rrIntervalsMs.length;
        bpm = Math.round(60000.0 / meanRr);
      }
    }

    // RMSSD calculation
    let rmssd = 35;
    if (rrIntervalsMs.length >= 2) {
      let sumSq = 0;
      for (let i = 1; i < rrIntervalsMs.length; i++) {
        sumSq += Math.pow(rrIntervalsMs[i] - rrIntervalsMs[i - 1], 2);
      }
      rmssd = Math.round(Math.sqrt(sumSq / (rrIntervalsMs.length - 1)));
    }

    // 4. ST Segment Analysis (J-point + 60ms vs PR baseline)
    const prOffset = Math.floor(0.06 * fs);
    const stOffset = Math.floor(0.075 * fs);
    const stShiftsMv: number[] = [];

    for (const peak of rPeaks) {
      const prIdx = peak - prOffset;
      const stIdx = peak + stOffset;
      if (prIdx >= 0 && stIdx < filteredMv.length) {
        const prBase = filteredMv[prIdx];
        const stVal = filteredMv[stIdx];
        stShiftsMv.push(stVal - prBase);
      }
    }

    let medianStMv = 0;
    if (stShiftsMv.length > 0) {
      stShiftsMv.sort((a, b) => a - b);
      medianStMv = stShiftsMv[Math.floor(stShiftsMv.length / 2)];
    }

    // 1 mm = 0.1 mV standard ECG scaling
    const stMm = Number((medianStMv * 10.0).toFixed(2));
    const deltaBaselineMm = Number((stMm - baselineST).toFixed(2));

    const isIschemicAlert = stMm <= -1.0 || deltaBaselineMm <= -1.0;
    const isMildSagging = !isIschemicAlert && (stMm <= -0.5 || deltaBaselineMm <= -0.5);

    let riskTier = "Normal";
    let isiScore = 14;
    if (isIschemicAlert) {
      riskTier = "High Risk / Acute Ischemic ST Depression";
      isiScore = Math.min(95, Math.max(72, Math.round(72 + Math.abs(stMm) * 12 + Math.max(0, bpm - 70) * 0.35)));
    } else if (isMildSagging) {
      riskTier = "Elevated Stress / ST Sagging";
      isiScore = Math.min(68, Math.max(45, Math.round(48 + Math.abs(stMm) * 15 + Math.max(0, bpm - 70) * 0.4)));
    } else {
      // Dynamic physiological ISI scale (11 to 38 based on instantaneous cardiac workload and ST level)
      const hrLoad = Math.max(0, (bpm - 60)) * 0.42;
      const stLoad = Math.abs(stMm) * 14.0;
      const hrvMod = Math.max(0, (35 - rmssd) * 0.2);
      isiScore = Math.max(11, Math.min(38, Math.round(12 + hrLoad + stLoad + hrvMod)));
    }

    // Signal Quality
    const expectedBeats = (rawSamples.length / fs) * (bpm / 60);
    const ratio = expectedBeats > 0 ? Math.min(1.0, rPeaks.length / expectedBeats) : 0.8;
    const sqi = Math.min(99, Math.max(30, Math.round(ratio * 96)));

    return NextResponse.json({
      status: "success",
      sample_count: rawSamples.length,
      r_peaks: rPeaks,
      heart_rate_bpm: bpm,
      rr_intervals_ms: rrIntervalsMs,
      hrv_rmssd_ms: rmssd,
      st_deviation_mv: Number(medianStMv.toFixed(3)),
      st_deviation_mm: stMm,
      delta_baseline_mm: deltaBaselineMm,
      is_ischemic_alert: isIschemicAlert,
      risk_tier: riskTier,
      isi_score: isiScore,
      signal_quality_percent: sqi,
      filtered_samples: filteredMv
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Signal processing failed", details: error.message },
      { status: 500 }
    );
  }
}
