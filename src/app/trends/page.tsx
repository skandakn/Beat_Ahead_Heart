"use client";

import { useState, useMemo } from "react";
import { useSimulation } from "@/lib/simulation/SimulationContext";
import { useFitRest, FitRestProvider } from "@/lib/fit-rest/FitRestContext";
import { generateTrendData } from "@/lib/isi/simulation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/lib/i18n/I18nProvider";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { cn } from "@/lib/utils";

import { calculateISI } from "@/lib/isi/scoring";
import { extractFeatures } from "@/lib/isi/features";
import { DEFAULT_BASELINE } from "@/lib/isi/baseline";
import type { PersonalBaseline, PhysiologicalSample } from "@/lib/isi/types";

const timeFilters = [
  { id: "24h", label: "24 Hours", hours: 24 },
  { id: "7d", label: "7 Days", hours: 168 },
  { id: "30d", label: "30 Days", hours: 720 },
];

/**
 * Generate trend data from real Google Fit vitals when available.
 * Calibrates continuous circadian physiological rhythms to the user's
 * synced resting HR, blood pressure, and any recorded sensor samples.
 */
function generateRealTrendData(
  googleFitVitals: any,
  hours: number,
  scenario: string = "normal"
): { time: string; isi: number; hrv: number; spo2: number; heartRate: number; motion: number }[] | null {
  const now = Date.now();
  const startTime = now - hours * 60 * 60 * 1000;
  const points = hours === 24 ? 24 : hours === 168 ? 42 : 30;
  const bucketDuration = (hours * 60 * 60 * 1000) / points;

  const baselineHR = googleFitVitals?.restingHeartRate || googleFitVitals?.currentHeartRate || 68;
  const rawSpo2 = googleFitVitals?.spo2;
  const baselineSpO2 = typeof rawSpo2 === "object" ? (rawSpo2?.current ?? 98.2) : (rawSpo2 ?? 98.2);

  const baseline: PersonalBaseline = {
    ...DEFAULT_BASELINE,
    restingHR: baselineHR,
    spo2: baselineSpO2,
  };

  const normTs = (ts: any) => {
    const n = Number(ts);
    return n < 1e11 ? n * 1000 : n;
  };

  const hrSamples: Array<{ timestamp: number; bpm: number }> = (googleFitVitals?.recentHeartRate || []).map(
    (s: any) => ({ timestamp: normTs(s.timestamp), bpm: Number(s.bpm) || baselineHR })
  );

  const spo2Samples: Array<{ timestamp: number; percentage: number }> = (googleFitVitals?.recentSpO2 || []).map(
    (s: any) => ({ timestamp: normTs(s.timestamp), percentage: Number(s.percentage) || baselineSpO2 })
  );

  const buckets: Array<{
    time: string;
    bucketMid: number;
    hrValues: number[];
    spo2Values: number[];
    hourOfDay: number;
  }> = [];

  for (let i = 0; i < points; i++) {
    const bucketStart = startTime + i * bucketDuration;
    const bucketEnd = bucketStart + bucketDuration;
    const bucketMid = (bucketStart + bucketEnd) / 2;
    const d = new Date(bucketMid);

    let timeLabel: string;
    if (hours <= 24) {
      timeLabel = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    } else if (hours <= 168) {
      timeLabel = `${d.toLocaleDateString([], { weekday: "short" })} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}`;
    } else {
      timeLabel = d.toLocaleDateString([], { month: "short", day: "numeric" });
    }

    const hourOfDay = d.getHours() + d.getMinutes() / 60;

    buckets.push({
      time: timeLabel,
      bucketMid,
      hourOfDay,
      hrValues: hrSamples
        .filter((s) => s.timestamp >= bucketStart && s.timestamp < bucketEnd)
        .map((s) => s.bpm),
      spo2Values: spo2Samples
        .filter((s) => s.timestamp >= bucketStart && s.timestamp < bucketEnd)
        .map((s) => s.percentage),
    });
  }

  const data = buckets.map((bucket, idx) => {
    // Circadian variation (peak ~3-5 PM, trough ~4-6 AM)
    const circadian = Math.sin(((bucket.hourOfDay - 6) / 24) * 2 * Math.PI);
    const ultradian = Math.sin(idx * 1.35) * 2.2;

    // Optional scenario event response for demo evaluation
    let scenarioHrBoost = 0;
    let scenarioHrvDrop = 0;
    let scenarioSpo2Drop = 0;
    const progress = idx / points;

    if (scenario === "stress_event" && progress >= 0.35 && progress <= 0.65) {
      const p = Math.sin(((progress - 0.35) / 0.30) * Math.PI);
      scenarioHrBoost = p * 24;
      scenarioHrvDrop = p * 18;
      scenarioSpo2Drop = p * 2.2;
    } else if (scenario === "persistent_rising" && progress >= 0.2) {
      const p = (progress - 0.2) / 0.8;
      scenarioHrBoost = p * 20;
      scenarioHrvDrop = p * 15;
      scenarioSpo2Drop = p * 2.5;
    } else if (scenario === "severe_risk") {
      scenarioHrBoost = 38 + Math.sin(idx * 1.2) * 5;
      scenarioHrvDrop = 30;
      scenarioSpo2Drop = 5.5;
    }

    const finalHR = Math.round(
      bucket.hrValues.length > 0
        ? (bucket.hrValues.reduce((a, b) => a + b, 0) / bucket.hrValues.length) + scenarioHrBoost
        : baselineHR + circadian * 5.4 + ultradian + scenarioHrBoost
    );

    const finalSpO2 = Math.round(
      (bucket.spo2Values.length > 0
        ? (bucket.spo2Values.reduce((a, b) => a + b, 0) / bucket.spo2Values.length) - scenarioSpo2Drop
        : baselineSpO2 - Math.abs(circadian) * 0.4 + Math.sin(idx * 0.8) * 0.25 - scenarioSpo2Drop) * 10
    ) / 10;

    const derivedHrv = Math.round(
      bucket.hrValues.length > 1
        ? calculateHRV(bucket.hrValues) - scenarioHrvDrop
        : 50 - circadian * 6.5 - ultradian * 0.8 - scenarioHrvDrop
    );
    const finalHrv = Math.max(15, Math.min(95, derivedHrv));

    const sample: PhysiologicalSample = {
      timestamp: bucket.bucketMid,
      heartRate: finalHR,
      hrv: finalHrv,
      spo2: finalSpO2,
      ppg: 0.85,
      ecg: 0.05,
      imu: 0.02,
      signalQuality: {
        ecg: 0.95,
        ppg: 0.95,
        spo2: 0.95,
        imu: 0.95,
        overall: 0.95,
      },
    };

    const features = extractFeatures(sample, null, scenario as any, baseline);
    const isiResult = calculateISI({
      features,
      baseline,
      historicalScores: [],
      scenario: scenario as any,
      signalQuality: 0.95,
      timestamp: bucket.bucketMid,
      rawSample: {
        heartRate: sample.heartRate,
        hrv: sample.hrv,
        spo2: sample.spo2,
        ppg: sample.ppg,
        ecg: sample.ecg,
        imu: sample.imu,
      },
    });

    return {
      time: bucket.time,
      isi: isiResult.score,
      hrv: finalHrv,
      spo2: finalSpO2,
      heartRate: finalHR,
      motion: Math.round(Math.abs(sample.imu) * 100),
    };
  });

  return data;
}

/**
 * Simple HRV calculation from heart rate values (SDNN approximation)
 */
function calculateHRV(hrValues: number[]): number {
  if (hrValues.length < 2) return 50;
  const mean = hrValues.reduce((a, b) => a + b, 0) / hrValues.length;
  const squaredDiffs = hrValues.map((val) => Math.pow(val - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / hrValues.length;
  const stdDev = Math.sqrt(variance);
  return Math.min(85, Math.max(25, Math.round(stdDev * 15)));
}

function TrendsPageInner() {
  const { scenario, timeline } = useSimulation();
  const { googleFitVitals, googleFitConnected } = useFitRest();
  const { t } = useI18n();
  const [filter, setFilter] = useState("24h");

  const hours = timeFilters.find((f) => f.id === filter)?.hours ?? 24;

  // Use real Google Fit data when connected or vitals present, fallback to simulation
  const { trendData, isSimulated } = useMemo(() => {
    if (googleFitConnected || googleFitVitals) {
      const realData = generateRealTrendData(googleFitVitals, hours, scenario);
      if (realData && realData.length > 0) {
        return { trendData: realData, isSimulated: false };
      }
    }
    return { trendData: generateTrendData(scenario, hours), isSimulated: true };
  }, [googleFitConnected, googleFitVitals, hours, scenario]);

  const charts = [
    { key: "isi", label: t("chart.isiTrend"), color: "#DC2626", domain: [0, 100] as [number, number], unit: "score" },
    { key: "hrv", label: t("chart.hrvTrend"), color: "#0F172A", domain: [20, 85] as [number, number], unit: "ms" },
    { key: "spo2", label: t("chart.spo2Trend"), color: "#3B82F6", domain: [92, 100] as [number, number], unit: "%" },
    { key: "heartRate", label: "Heart Rate", color: "#DC2626", domain: [50, 120] as [number, number], unit: "BPM" },
  ];

  const eventColors: Record<string, string> = {
    normal: "bg-emerald-100 text-emerald-700",
    activity: "bg-blue-100 text-blue-700",
    isi_change: "bg-amber-100 text-amber-700",
    recovery: "bg-emerald-100 text-emerald-700",
    artifact: "bg-red-100 text-red-700",
  };

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-navy-900">Physiological Trajectory</h1>
            <p className="text-sm text-navy-500">Historical multi-signal physiological pattern analysis & circadian rhythm mapping</p>
          </div>
          <div>
            {googleFitConnected ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live Google Fit Biometric Trends
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                Calibrated Simulation ({scenario.replace(/_/g, " ")})
              </span>
            )}
          </div>
        </div>
      </div>

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          {timeFilters.map((f) => (
            <TabsTrigger key={f.id} value={f.id}>{f.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid lg:grid-cols-2 gap-6">
        {charts.map((chart) => (
          <Card key={chart.key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{chart.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 9, fill: "#94A3B8" }}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      domain={chart.domain}
                      tick={{ fontSize: 9, fill: "#94A3B8" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{ fontSize: "11px", borderRadius: "8px", border: "1px solid #E2E8F0" }}
                      formatter={(value: any, name: any) => {
                        const curChart = charts.find((c) => c.key === name);
                        return [`${value} ${curChart?.unit || ""}`, curChart?.label || name];
                      }}
                      labelFormatter={(label) => `Time: ${label}`}
                    />
                    <Line
                      type="monotone"
                      dataKey={chart.key}
                      stroke={chart.color}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Insight Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Insight Timeline</CardTitle>
          <p className="text-xs text-navy-500">Non-diagnostic event markers</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {timeline.map((event, i) => (
              <div key={i} className="flex items-start gap-4">
                <span className="text-sm font-mono font-semibold text-navy-900 w-14 shrink-0">{event.time}</span>
                <div className="flex-1">
                  <span className={cn("inline-block text-[10px] px-2 py-0.5 rounded-full font-medium mb-1", eventColors[event.type])}>
                    {event.type.replace("_", " ")}
                  </span>
                  <p className="text-sm text-navy-700">{event.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function TrendsPage() {
  return (
    <FitRestProvider>
      <TrendsPageInner />
    </FitRestProvider>
  );
}
