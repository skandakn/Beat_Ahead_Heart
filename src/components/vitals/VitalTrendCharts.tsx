"use client";

import { useFitRest } from "@/lib/fit-rest/FitRestContext";
import { useSimulation } from "@/lib/simulation/SimulationContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from "recharts";

export function VitalTrendCharts() {
  const { googleFitVitals } = useFitRest();
  const { baseline } = useSimulation();

  // 1. Prepare Heart Rate data
  const hrSamples = (googleFitVitals?.recentHeartRate ?? []).map((sample, idx) => ({
    time: new Date(sample.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    bpm: sample.bpm,
    restingBaseline: baseline.restingHR ?? 68,
  }));

  // Fallback HR trend points if array is empty
  const displayHR = hrSamples.length > 0
    ? hrSamples
    : Array.from({ length: 12 }, (_, i) => ({
        time: `${String(i * 2).padStart(2, "0")}:00`,
        bpm: Math.round(68 + Math.sin(i * 0.7) * 7),
        restingBaseline: 68,
      }));

  // 2. Prepare Blood Pressure data
  const bpSamples = (googleFitVitals?.recentBloodPressure ?? []).map((b) => ({
    date: new Date(b.timestamp).toLocaleDateString([], { month: "short", day: "numeric" }),
    systolic: b.systolic,
    diastolic: b.diastolic,
  }));

  const displayBP = bpSamples.length > 0
    ? bpSamples
    : [
        { date: "Day 1", systolic: 118, diastolic: 76 },
        { date: "Day 2", systolic: 120, diastolic: 78 },
        { date: "Day 3", systolic: 116, diastolic: 74 },
        { date: "Day 4", systolic: 118, diastolic: 76 },
      ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Heart Rate Timeline Chart */}
      <Card className="border border-navy-100 bg-white shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-bold text-navy-900">
            Heart Rate Trend (Google Fit)
          </CardTitle>
          <CardDescription className="text-xs text-navy-500">
            Continuous BPM vs. calibrated resting baseline ({baseline.restingHR} BPM)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={displayHR} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="hrGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#64748B" }} tickLine={false} axisLine={false} />
                <YAxis domain={[50, 120]} tick={{ fontSize: 10, fill: "#64748B" }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "white",
                    border: "1px solid #E2E8F0",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <ReferenceLine
                  y={baseline.restingHR ?? 68}
                  stroke="#3B82F6"
                  strokeDasharray="4 4"
                  label={{ value: "Resting Baseline", fontSize: 10, fill: "#3B82F6" }}
                />
                <Area
                  type="monotone"
                  dataKey="bpm"
                  name="Heart Rate (BPM)"
                  stroke="#EF4444"
                  strokeWidth={2}
                  fill="url(#hrGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Blood Pressure History Chart */}
      <Card className="border border-navy-100 bg-white shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-bold text-navy-900">
            Blood Pressure History (mmHg)
          </CardTitle>
          <CardDescription className="text-xs text-navy-500">
            Systolic and diastolic measurements with AHA normal guidelines (120/80)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={displayBP} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748B" }} tickLine={false} axisLine={false} />
                <YAxis domain={[60, 160]} tick={{ fontSize: 10, fill: "#64748B" }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "white",
                    border: "1px solid #E2E8F0",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                <ReferenceLine y={120} stroke="#F59E0B" strokeDasharray="3 3" label={{ value: "Sys 120", fontSize: 9, fill: "#F59E0B" }} />
                <ReferenceLine y={80} stroke="#10B981" strokeDasharray="3 3" label={{ value: "Dia 80", fontSize: 9, fill: "#10B981" }} />
                <Line
                  type="monotone"
                  dataKey="systolic"
                  name="Systolic BP"
                  stroke="#E11D48"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "#E11D48" }}
                />
                <Line
                  type="monotone"
                  dataKey="diastolic"
                  name="Diastolic BP"
                  stroke="#2563EB"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "#2563EB" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
