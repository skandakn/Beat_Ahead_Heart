"use client";

import { useState, useMemo } from "react";
import { useSimulation } from "@/lib/simulation/SimulationContext";
import { useSubscription } from "@/lib/subscription/SubscriptionContext";
import { useFitRest, FitRestProvider } from "@/lib/fit-rest/FitRestContext";
import { Paywall } from "@/components/ui/Paywall";
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

const timeFilters = [
  { id: "24h", label: "24 Hours", hours: 24 },
  { id: "7d", label: "7 Days", hours: 168 },
  { id: "30d", label: "30 Days", hours: 720 },
];

/**
 * Generate trend data from real Google Fit vitals when available.
 * Groups heart rate and SpO2 samples into time buckets for the specified hours window.
 */
function generateRealTrendData(
  googleFitVitals: any,
  hours: number
): { time: string; isi: number; hrv: number; spo2: number; heartRate: number; motion: number }[] | null {
  if (!googleFitVitals || !googleFitVitals.recentHeartRate || googleFitVitals.recentHeartRate.length === 0) {
    return null;
  }

  const now = Date.now();
  const startTime = now - hours * 60 * 60 * 1000;
  const points = hours === 24 ? 24 : hours === 168 ? 42 : 30;
  const bucketDuration = (hours * 60 * 60 * 1000) / points;

  // Filter samples within time range
  const hrSamples = googleFitVitals.recentHeartRate.filter(
    (s: any) => s.timestamp >= startTime && s.timestamp <= now
  );
  const spo2Samples = (googleFitVitals.recentSpO2 || []).filter(
    (s: any) => s.timestamp >= startTime && s.timestamp <= now
  );

  // Create buckets
  const buckets: Array<{
    time: string;
    hrValues: number[];
    spo2Values: number[];
    timestamp: number;
  }> = [];

  for (let i = 0; i < points; i++) {
    const bucketStart = startTime + i * bucketDuration;
    const bucketEnd = bucketStart + bucketDuration;
    const bucketMid = (bucketStart + bucketEnd) / 2;

    const hour = Math.floor(((i * bucketDuration) / (1000 * 60 * 60)) % 24);
    const minute = Math.floor(((i * bucketDuration) / (1000 * 60)) % 60);

    buckets.push({
      time: `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`,
      hrValues: hrSamples
        .filter((s: any) => s.timestamp >= bucketStart && s.timestamp < bucketEnd)
        .map((s: any) => s.bpm),
      spo2Values: spo2Samples
        .filter((s: any) => s.timestamp >= bucketStart && s.timestamp < bucketEnd)
        .map((s: any) => s.percentage),
      timestamp: bucketMid,
    });
  }

  // Calculate averages and derive ISI/HRV
  const baselineHR = googleFitVitals.restingHeartRate || 68;
  const data = buckets.map((bucket, idx) => {
    const avgHR = bucket.hrValues.length > 0
      ? Math.round(bucket.hrValues.reduce((a, b) => a + b, 0) / bucket.hrValues.length)
      : null;
    
    const avgSpO2 = bucket.spo2Values.length > 0
      ? Math.round((bucket.spo2Values.reduce((a, b) => a + b, 0) / bucket.spo2Values.length) * 10) / 10
      : null;

    // Interpolate missing values from nearby buckets
    const finalHR = avgHR ?? interpolateValue(buckets, idx, 'hrValues', baselineHR);
    const finalSpO2 = avgSpO2 ?? interpolateValue(buckets, idx, 'spo2Values', 97.5);

    // Derive HRV approximation from HR variability (simplified)
    const hrv = bucket.hrValues.length > 1
      ? Math.round(calculateHRV(bucket.hrValues))
      : Math.round(50 + (baselineHR - finalHR) * 0.5);

    // Derive ISI from HR and HRV (matching existing formula)
    const isi = Math.round(45 + (finalHR - 68) * 0.8 + (50 - hrv) * 0.3);

    return {
      time: bucket.time,
      isi: Math.max(0, Math.min(100, isi)),
      hrv: Math.max(30, Math.min(80, hrv)),
      spo2: finalSpO2,
      heartRate: finalHR,
      motion: 0, // Motion data not available from Google Fit vitals
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
  const squaredDiffs = hrValues.map(val => Math.pow(val - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / hrValues.length;
  const stdDev = Math.sqrt(variance);
  
  // Convert HR std dev to approximate HRV in ms
  return Math.min(80, Math.max(30, stdDev * 15));
}

/**
 * Interpolate missing values from nearby buckets
 */
function interpolateValue(
  buckets: Array<{ hrValues: number[]; spo2Values: number[] }>,
  currentIdx: number,
  field: 'hrValues' | 'spo2Values',
  defaultValue: number
): number {
  // Look back up to 5 buckets for a valid value
  for (let offset = 1; offset <= 5; offset++) {
    const prevIdx = currentIdx - offset;
    if (prevIdx >= 0 && buckets[prevIdx][field].length > 0) {
      const values = buckets[prevIdx][field];
      return Math.round(values.reduce((a: number, b: number) => a + b, 0) / values.length);
    }
  }
  
  // Look forward up to 5 buckets
  for (let offset = 1; offset <= 5; offset++) {
    const nextIdx = currentIdx + offset;
    if (nextIdx < buckets.length && buckets[nextIdx][field].length > 0) {
      const values = buckets[nextIdx][field];
      return Math.round(values.reduce((a: number, b: number) => a + b, 0) / values.length);
    }
  }
  
  return defaultValue;
}

function TrendsPageInner() {
  const { scenario, timeline } = useSimulation();
  const { canAccessFeature } = useSubscription();
  const { googleFitVitals, googleFitConnected } = useFitRest();
  const { t } = useI18n();
  const [filter, setFilter] = useState("24h");

  const hasAccess = canAccessFeature("LONG_TERM_TRENDS");

  const hours = timeFilters.find((f) => f.id === filter)?.hours ?? 24;
  
  // Use real Google Fit data when available, fallback to simulation
  const trendData = useMemo(() => {
    const realData = generateRealTrendData(googleFitVitals, hours);
    if (realData && realData.length > 0) {
      return realData;
    }
    // Fallback to simulation data when no Google Fit data
    return generateTrendData(scenario, hours);
  }, [googleFitVitals, hours, scenario]);

  const charts = [
    { key: "isi", label: t("chart.isiTrend"), color: "#DC2626", domain: [0, 100] as [number, number] },
    { key: "hrv", label: t("chart.hrvTrend"), color: "#0F172A", domain: [30, 60] as [number, number] },
    { key: "spo2", label: t("chart.spo2Trend"), color: "#3B82F6", domain: [94, 99] as [number, number] },
    { key: "heartRate", label: "Heart Rate", color: "#DC2626", domain: [60, 90] as [number, number] },
    { key: "motion", label: "Activity / Motion", color: "#8B5CF6", domain: [0, 100] as [number, number] },
  ];

  const eventColors: Record<string, string> = {
    normal: "bg-emerald-100 text-emerald-700",
    activity: "bg-blue-100 text-blue-700",
    isi_change: "bg-amber-100 text-amber-700",
    recovery: "bg-emerald-100 text-emerald-700",
    artifact: "bg-red-100 text-red-700",
  };

  const content = (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-navy-900">Long-term Trends</h1>
        <p className="text-sm text-navy-500">Historical physiological pattern analysis</p>
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
                  <LineChart data={trendData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#94A3B8" }} tickLine={false} interval="preserveStartEnd" />
                    <YAxis domain={chart.domain} tick={{ fontSize: 9, fill: "#94A3B8" }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ fontSize: "11px", borderRadius: "8px" }} />
                    <Line type="monotone" dataKey={chart.key} stroke={chart.color} strokeWidth={2} dot={false} />
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

  if (!hasAccess) {
    return (
      <div className="p-4 lg:p-8 max-w-7xl mx-auto">
        <Paywall featureName="7-Day & 30-Day Long-Term Trends">
          {content}
        </Paywall>
      </div>
    );
  }

  return content;
}

export default function TrendsPage() {
  return (
    <FitRestProvider>
      <TrendsPageInner />
    </FitRestProvider>
  );
}
