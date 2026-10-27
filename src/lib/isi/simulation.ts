import type {
  DemoScenario,
  PatientRecord,
  PersonalBaseline,
  PhysiologicalSample,
  TimelineEvent,
  TrendDirection,
} from "./types";
import { DEFAULT_BASELINE } from "./baseline";
import { extractFeatures } from "./features";
import { calculateISI } from "./scoring";

let tickCounter = 0;

const SCENARIO_SEEDS: Record<DemoScenario, number> = {
  normal: 11,
  stress_event: 23,
  recovering: 37,
  persistent_rising: 53,
  motion_artifact: 71,
  elevated_risk: 89,
  severe_risk: 97,
};

function seededNoise(base: number, channel: number, range: number = 0.08): number {
  const raw = Math.sin((base + 1) * 12.9898 + channel * 78.233) * 43758.5453;
  return (raw - Math.floor(raw) - 0.5) * range;
}

export function resetSimulation(): void {
  tickCounter = 0;
}

export function generateHistoricalData(
  scenario: DemoScenario,
  count: number = 60,
  customBaseline?: PersonalBaseline
): { samples: PhysiologicalSample[]; baseTime: number } {
  const baseTime = Date.now() - count * 60000;
  const samples: PhysiologicalSample[] = [];

  for (let i = 0; i < count; i++) {
    tickCounter = i;
    samples.push(generateSample(scenario, baseTime + i * 60000, customBaseline));
  }

  return { samples, baseTime };
}

export function generateSample(
  scenario: DemoScenario,
  timestamp?: number,
  customBaseline?: PersonalBaseline
): PhysiologicalSample {
  tickCounter++;
  const t = tickCounter / 100;
  const ts = timestamp ?? Date.now();

  const params = getScenarioParams(scenario, t, customBaseline);

  return {
    timestamp: ts,
    ppg: params.ppg,
    ecg: params.ecg,
    spo2: params.spo2,
    imu: params.imu,
    heartRate: params.heartRate,
    hrv: params.hrv,
    signalQuality: params.signalQuality,
  };
}

function getScenarioParams(scenario: DemoScenario, t: number, customBaseline?: PersonalBaseline) {
  const progress = Math.min(t, 1);
  const seed = SCENARIO_SEEDS[scenario];
  const noise = (channel: number, range: number = 0.08) =>
    seededNoise(tickCounter + seed, channel, range);

  const baseHR = customBaseline?.restingHR ?? 68;
  const baseHrv = customBaseline?.hrv ?? 50;
  const baseSpo2 = customBaseline?.spo2 ?? 97;
  const basePpg = customBaseline?.pulseMorphology ?? 0.85;
  const baseEcg = customBaseline?.ecgAmplitude ?? 0.80;

  switch (scenario) {
    case "normal":
      return {
        ppg: Math.max(0.1, (basePpg * 0.6) + Math.sin(t * 8) * 0.12 + noise(1)),
        ecg: Math.max(0.1, (baseEcg * 0.6) + Math.sin(t * 6) * 0.15 + noise(2)),
        spo2: Math.min(100, Math.max(70, baseSpo2 + Math.sin(t * 2) * 0.3 + noise(3, 0.08))),
        imu: 0.1 + Math.abs(Math.sin(t * 3)) * 0.15 + noise(4, 0.008),
        heartRate: Math.max(35, baseHR + Math.sin(t * 4) * 3 + noise(5, 0.2)),
        hrv: Math.max(10, baseHrv + Math.sin(t * 3) * 4 + noise(6, 0.25)),
        signalQuality: { ppg: 95, ecg: 90, spo2: 97, imu: 94, overall: 95 },
      };

    case "stress_event": {
      const stressFactor =
        progress < 0.2
          ? 0
          : progress < 0.6
            ? (progress - 0.2) / 0.4
            : Math.max(0, 1 - (progress - 0.6) / 0.4);
      return {
        ppg: Math.max(0.08, (basePpg * 0.5) + stressFactor * 0.2 + Math.sin(t * 10) * 0.12 + noise(1)),
        ecg: Math.max(0.1, (baseEcg * 0.6) + stressFactor * 0.3 + Math.sin(t * 8) * 0.15 + noise(2)),
        spo2: Math.max(70, baseSpo2 - stressFactor * 2.5 + noise(3)),
        imu: 0.2 + stressFactor * 0.3 + noise(4, 0.016),
        heartRate: Math.max(35, baseHR + stressFactor * 22 + Math.sin(t * 6) * 3 + noise(5, 0.16)),
        hrv: Math.max(8, baseHrv - stressFactor * 14 + noise(6, 0.24)),
        signalQuality: {
          ppg: 92 - stressFactor * 5,
          ecg: 85 - stressFactor * 8,
          spo2: 94 - stressFactor * 3,
          imu: 85 - stressFactor * 10,
          overall: 90 - stressFactor * 6,
        },
      };
    }

    case "recovering": {
      const recoveryFactor = Math.max(0, 1 - progress * 1.5);
      return {
        ppg: Math.max(0.1, (basePpg * 0.55) + recoveryFactor * 0.1 + Math.sin(t * 8) * 0.1 + noise(1)),
        ecg: Math.max(0.1, (baseEcg * 0.55) + recoveryFactor * 0.12 + Math.sin(t * 6) * 0.12 + noise(2)),
        spo2: Math.min(100, Math.max(70, (baseSpo2 - 1.5) + (1 - recoveryFactor) * 1.2 + noise(3))),
        imu: 0.15 + recoveryFactor * 0.2 + noise(4, 0.008),
        heartRate: Math.max(35, baseHR + recoveryFactor * 12 + noise(5, 0.16)),
        hrv: Math.max(10, baseHrv - 6 + recoveryFactor * 8 + noise(6, 0.24)),
        signalQuality: {
          ppg: 90 + (1 - recoveryFactor) * 4,
          ecg: 82 + (1 - recoveryFactor) * 6,
          spo2: 93 + (1 - recoveryFactor) * 3,
          imu: 88 - recoveryFactor * 5,
          overall: 88 + (1 - recoveryFactor) * 5,
        },
      };
    }

    case "persistent_rising": {
      const riseFactor = progress * 0.8;
      return {
        ppg: Math.max(0.08, (basePpg * 0.5) + riseFactor * 0.15 + Math.sin(t * 8) * 0.1 + noise(1)),
        ecg: Math.max(0.1, (baseEcg * 0.6) + riseFactor * 0.22 + Math.sin(t * 6) * 0.12 + noise(2)),
        spo2: Math.max(70, baseSpo2 - riseFactor * 3 + noise(3)),
        imu: 0.12 + riseFactor * 0.1 + noise(4, 0.0064),
        heartRate: Math.max(35, baseHR + riseFactor * 18 + noise(5, 0.16)),
        hrv: Math.max(8, baseHrv - riseFactor * 12 + noise(6, 0.16)),
        signalQuality: {
          ppg: 93 - riseFactor * 3,
          ecg: 87 - riseFactor * 5,
          spo2: 95 - riseFactor * 2,
          imu: 90 - riseFactor * 4,
          overall: 92 - riseFactor * 3,
        },
      };
    }

    case "motion_artifact": {
      const motionBurst = progress > 0.35 && progress < 0.75 ? 0.6 : 0.16;
      return {
        ppg: 0.5 + motionBurst * 0.3 + noise(1, 0.024),
        ecg: 0.5 + motionBurst * 0.25 + noise(2, 0.02),
        spo2: baseSpo2 + noise(3, 0.16),
        imu: motionBurst + noise(4, 0.024),
        heartRate: baseHR + motionBurst * 12 + noise(5, 0.4),
        hrv: Math.max(8, baseHrv - motionBurst * 8 + noise(6, 0.4)),
        signalQuality: {
          ppg: 95 - motionBurst * 40,
          ecg: 90 - motionBurst * 35,
          spo2: 94 - motionBurst * 10,
          imu: 90 - motionBurst * 30,
          overall: 93 - motionBurst * 35,
        },
      };
    }

    case "elevated_risk": {
      // Moderate autonomic and perfusion abnormalities
      const hrElevation = 20.0 + Math.sin(t * 5) * 4;
      const hrvDepression = 22.0 + Math.sin(t * 3) * 3;
      return {
        ppg: Math.max(0.1, basePpg * 0.55 + noise(1, 0.04)),
        ecg: Math.max(0.1, baseEcg * 0.65 + noise(2, 0.05)),
        spo2: Math.max(70, Math.min(95, baseSpo2 - 4.5 + noise(3, 0.06))),
        imu: 0.12 + noise(4, 0.008),
        heartRate: Math.max(35, baseHR + hrElevation + noise(5, 0.15)),
        hrv: Math.max(12, baseHrv - hrvDepression + noise(6, 0.2)),
        signalQuality: {
          ppg: 91,
          ecg: 89,
          spo2: 92,
          imu: 90,
          overall: 90,
        },
      };
    }

    case "severe_risk": {
      // Acute cardiac risk: severe tachycardia, collapsed HRV, profound desaturation
      const hrElevation = 45.0 + Math.sin(t * 4) * 6;
      const hrvDepression = 36.0;
      return {
        ppg: Math.max(0.06, basePpg * 0.28 + noise(1, 0.03)),
        ecg: Math.max(0.08, baseEcg * 0.45 + noise(2, 0.04)),
        spo2: Math.max(70, Math.min(90, baseSpo2 - 8.5 + noise(3, 0.05))),
        imu: 0.15 + noise(4, 0.008),
        heartRate: Math.max(35, baseHR + hrElevation + noise(5, 0.15)),
        hrv: Math.max(8, baseHrv - hrvDepression + noise(6, 0.15)),
        signalQuality: {
          ppg: 88,
          ecg: 86,
          spo2: 89,
          imu: 88,
          overall: 88,
        },
      };
    }

    default:
      return getScenarioParams("normal", t, customBaseline);
  }
}

export function generateWaveformPoints(
  type: "ppg" | "ecg" | "spo2" | "imu",
  scenario: DemoScenario,
  pointCount: number = 100,
  seed?: number
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const t = (seed ?? tickCounter) / 100;
  const noiseBase = (seed ?? tickCounter) + (SCENARIO_SEEDS[scenario] ?? 11);

  for (let i = 0; i < pointCount; i++) {
    const phase = (i / pointCount) * Math.PI * 4;
    let y = 0;

    switch (type) {
      case "ppg":
        y = 0.5 + Math.sin(phase) * 0.3 + Math.sin(phase * 2) * 0.1;
        if (scenario === "motion_artifact") y += seededNoise(noiseBase + i, 1, 0.4);
        break;
      case "ecg":
        y = Math.sin(phase) * 0.15;
        if (Math.sin(phase * 0.5) > 0.8) y += 0.6;
        if (Math.sin(phase * 0.5) > 0.85) y -= 0.2;
        if (scenario === "motion_artifact") y += seededNoise(noiseBase + i, 2, 0.3);
        break;
      case "spo2":
        y = 96 + Math.sin(phase * 0.3) * 0.8;
        break;
      case "imu":
        y = Math.abs(Math.sin(phase * 0.7)) * 0.5;
        if (scenario === "motion_artifact") {
          y += seededNoise(noiseBase + i, 4, 0.5) + 0.25;
        }
        break;
    }

    points.push({ x: i, y });
  }

  return points;
}

export function generateTrendData(
  scenario: DemoScenario,
  hours: number = 24,
  customBaseline: PersonalBaseline = DEFAULT_BASELINE
): { time: string; isi: number; hrv: number; spo2: number; heartRate: number; motion: number }[] {
  const data = [];
  const points = hours === 24 ? 24 : hours === 168 ? 42 : 30;
  const intervalMs = (hours * 3600 * 1000) / points;
  const now = Date.now();
  const startTime = now - hours * 3600 * 1000;

  for (let i = 0; i < points; i++) {
    const pointTime = startTime + i * intervalMs;
    const d = new Date(pointTime);

    let timeLabel: string;
    if (hours <= 24) {
      timeLabel = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    } else if (hours <= 168) {
      timeLabel = `${d.toLocaleDateString([], { weekday: 'short' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`;
    } else {
      timeLabel = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    // Circadian diurnal variation based on solar time (trough at 4-6 AM, peak at 3-5 PM)
    const hourOfDay = d.getHours() + d.getMinutes() / 60;
    const circadian = Math.sin(((hourOfDay - 6) / 24) * 2 * Math.PI);
    const ultradian = Math.sin(i * 1.4) * 2.2;
    // Multi-day biological variance for 7d and 30d trajectories
    const multiDayDrift = hours > 24 ? Math.sin((i / 7) * 2 * Math.PI) * 4.6 + Math.cos(i * 1.3) * 3.4 : 0;

    tickCounter = Math.floor((i / points) * 100);
    const sample = generateSample(scenario, pointTime, customBaseline);

    // Apply diurnal variation and multi-day biological trajectory
    const hrMod = circadian * 5.5 + ultradian + multiDayDrift;
    sample.heartRate = Math.max(45, Math.min(160, Math.round(sample.heartRate + hrMod)));

    const hrvMod = -circadian * 6.5 - ultradian * 0.8 - multiDayDrift * 0.9;
    sample.hrv = Math.max(15, Math.min(95, Math.round(sample.hrv + hrvMod)));

    const spo2Mod = -Math.abs(circadian) * 0.4 + Math.sin(i * 0.8) * 0.3 + (hours > 24 ? Math.sin(i * 0.6) * 0.35 : 0);
    sample.spo2 = Math.max(85, Math.min(100, Math.round((sample.spo2 + spo2Mod) * 10) / 10));

    const feat = extractFeatures(sample, null, scenario, customBaseline);
    const computedScore = calculateISI({
      features: feat,
      baseline: customBaseline,
      historicalScores: [],
      scenario,
      signalQuality: sample.signalQuality.overall,
      timestamp: pointTime,
      rawSample: {
        heartRate: sample.heartRate,
        hrv: sample.hrv,
        spo2: sample.spo2,
        ppg: sample.ppg,
        ecg: sample.ecg,
        imu: sample.imu,
      },
    });

    data.push({
      time: timeLabel,
      isi: computedScore.score,
      hrv: Math.round(sample.hrv),
      spo2: Math.round(sample.spo2 * 10) / 10,
      heartRate: Math.round(sample.heartRate),
      motion: Math.round(Math.abs(sample.imu) * 100),
    });
  }

  tickCounter = 0;
  return data;
}

export function generateTimeline(scenario: DemoScenario): TimelineEvent[] {
  const events: TimelineEvent[] = [
    { time: "08:30", description: "Normal baseline observed", type: "normal" },
  ];

  switch (scenario) {
    case "stress_event":
      events.push(
        { time: "11:45", description: "Increased activity detected", type: "activity" },
        { time: "12:05", description: "Transient ISI increase observed", type: "isi_change" },
        { time: "12:30", description: "Returned toward baseline", type: "recovery" }
      );
      break;
    case "persistent_rising":
      events.push(
        { time: "10:00", description: "Gradual trend elevation beginning", type: "isi_change" },
        { time: "14:30", description: "Sustained elevation above personal baseline", type: "isi_change" },
        { time: "18:00", description: "Trend remains elevated — follow-up may be warranted", type: "isi_change" }
      );
      break;
    case "motion_artifact":
      events.push(
        { time: "09:15", description: "High motion period detected", type: "activity" },
        { time: "09:20", description: "Possible motion artifact — reduced confidence", type: "artifact" },
        { time: "09:35", description: "Signal quality recovering", type: "recovery" }
      );
      break;
    case "recovering":
      events.push(
        { time: "10:30", description: "Elevated trend observed earlier", type: "isi_change" },
        { time: "13:00", description: "Gradual return toward baseline", type: "recovery" },
        { time: "16:00", description: "Approaching personal baseline range", type: "normal" }
      );
      break;
    default:
      events.push(
        { time: "12:00", description: "Stable physiological patterns", type: "normal" },
        { time: "15:30", description: "Minor fluctuation within normal range", type: "normal" }
      );
  }

  return events;
}

export function generatePatients(): PatientRecord[] {
  const scenarios: DemoScenario[] = [
    "normal",
    "stress_event",
    "persistent_rising",
    "recovering",
    "motion_artifact",
  ];

  const patientBaselines = [
    DEFAULT_BASELINE,
    { ...DEFAULT_BASELINE, restingHR: 72, hrv: 45, isi: 50 },
    { ...DEFAULT_BASELINE, restingHR: 70, hrv: 48, isi: 46 },
    { ...DEFAULT_BASELINE, restingHR: 65, hrv: 54, isi: 47 },
    { ...DEFAULT_BASELINE, restingHR: 75, hrv: 42, isi: 52 },
  ];

  return scenarios.map((scenario, i) => {
    resetSimulation();
    const baseline = patientBaselines[i];
    const { samples } = generateHistoricalData(scenario, 30);
    const historicalScores: import("./types").ISIScore[] = [];

    samples.forEach((sample, idx) => {
      const prev = idx > 0 ? samples[idx - 1] : null;
      const feat = extractFeatures(sample, prev, scenario);
      historicalScores.push(
        calculateISI({
          features: feat,
          baseline,
          historicalScores: historicalScores.map((s) => s.score),
          scenario,
          signalQuality: sample.signalQuality.overall,
          timestamp: sample.timestamp,
        })
      );
    });

    const lastSample = samples[samples.length - 1];
    const lastScore = historicalScores[historicalScores.length - 1];
    const lastFeatures = extractFeatures(
      lastSample,
      samples[samples.length - 2] ?? null,
      scenario
    );

    return {
      id: `PT-${1000 + i}`,
      currentISI: lastScore.score,
      trend: lastScore.trend,
      signalQuality: lastSample.signalQuality.overall,
      lastUpdated: new Date(lastSample.timestamp).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      baseline,
      scores: historicalScores,
      features: lastFeatures,
      lastSample,
    };
  });
}
