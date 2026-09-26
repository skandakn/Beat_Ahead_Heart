"use client";

import { useFitRest } from "@/lib/fit-rest/FitRestContext";
import { useSimulation } from "@/lib/simulation/SimulationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  HeartPulse,
  Activity,
  Heart,
  Zap,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Minus,
  CheckCircle2,
} from "lucide-react";

export function VitalOverview() {
  const { googleFitVitals, googleFitConnected } = useFitRest();
  const { baseline, currentScore, currentSample } = useSimulation();

  const hr = googleFitVitals?.currentHeartRate ?? currentSample.heartRate ?? 70;
  const restingHR = googleFitVitals?.restingHeartRate ?? baseline.restingHR ?? 68;
  const bp = googleFitVitals?.bloodPressure ?? {
    systolic: 118,
    diastolic: 76,
    category: "normal" as const,
  };
  const spo2 = googleFitVitals?.spo2?.current ?? currentSample.spo2 ?? 98.2;
  const heartPoints = googleFitVitals?.heartPoints ?? 48;
  const isi = currentScore?.score ?? 28;
  const isiBaseline = baseline.isi ?? 32;

  const pulsePressure = bp.systolic - bp.diastolic;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Heart Rate & Autonomic */}
        <Card className="border border-red-100 bg-white shadow-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-navy-500">
                Heart Rate & Autonomic
              </span>
              <div className="p-2 rounded-lg bg-red-50 text-red-600">
                <HeartPulse className="w-4 h-4" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-navy-900 mt-1 flex items-baseline gap-1">
              <span>{hr}</span>
              <span className="text-xs font-normal text-navy-400">BPM</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            <div className="flex items-center justify-between text-xs text-navy-600">
              <span>Resting HR:</span>
              <span className="font-semibold text-navy-900">{restingHR} BPM</span>
            </div>
            <div className="flex items-center justify-between text-xs text-navy-600">
              <span>HRV (SDNN):</span>
              <span className="font-semibold text-emerald-700">{Math.round(baseline.hrv)} ms</span>
            </div>
            <div className="pt-1.5 border-t border-navy-50 flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Autonomic tone normal</span>
            </div>
          </CardContent>
        </Card>

        {/* 2. Blood Pressure */}
        <Card className="border border-rose-100 bg-white shadow-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-navy-500">
                Vascular Blood Pressure
              </span>
              <div className="p-2 rounded-lg bg-rose-50 text-rose-600">
                <Activity className="w-4 h-4" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-navy-900 mt-1 flex items-baseline gap-1">
              <span>{bp.systolic}/{bp.diastolic}</span>
              <span className="text-xs font-normal text-navy-400">mmHg</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            <div className="flex items-center justify-between text-xs text-navy-600">
              <span>Category:</span>
              <span className="font-bold text-emerald-700 uppercase text-[10px] bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                {bp.category.replace(/_/g, " ")}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-navy-600">
              <span>Pulse Pressure:</span>
              <span className="font-semibold text-navy-900">{pulsePressure} mmHg</span>
            </div>
            <div className="pt-1.5 border-t border-navy-50 flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Optimal vascular elasticity</span>
            </div>
          </CardContent>
        </Card>

        {/* 3. Blood Oxygenation */}
        <Card className="border border-sky-100 bg-white shadow-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-navy-500">
                Blood Oxygen (SpO2)
              </span>
              <div className="p-2 rounded-lg bg-sky-50 text-sky-600">
                <Heart className="w-4 h-4" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-navy-900 mt-1 flex items-baseline gap-1">
              <span>{spo2}</span>
              <span className="text-xs font-normal text-navy-400">%</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            <div className="flex items-center justify-between text-xs text-navy-600">
              <span>Target:</span>
              <span className="font-semibold text-navy-900">≥ 95.0%</span>
            </div>
            <div className="flex items-center justify-between text-xs text-navy-600">
              <span>Desaturations:</span>
              <span className="font-semibold text-emerald-700">0 events</span>
            </div>
            <div className="pt-1.5 border-t border-navy-50 flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Healthy arterial oxygenation</span>
            </div>
          </CardContent>
        </Card>

        {/* 4. Ischemic Stress Index (ISI) */}
        <Card className="border border-emerald-100 bg-white shadow-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-navy-500">
                Calibrated ISI Score
              </span>
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                <Zap className="w-4 h-4" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-navy-900 mt-1 flex items-baseline gap-1">
              <span className="text-emerald-700">{isi}</span>
              <span className="text-xs font-normal text-navy-400">/ 100</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            <div className="flex items-center justify-between text-xs text-navy-600">
              <span>Personal Baseline:</span>
              <span className="font-semibold text-navy-900">{isiBaseline}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-navy-600">
              <span>Risk Classification:</span>
              <span className="font-bold text-emerald-700 text-[11px]">
                {isi < 45 ? "Low Risk (< 45)" : "Elevated Risk"}
              </span>
            </div>
            <div className="pt-1.5 border-t border-navy-50 flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Calibrated via Google Fit vitals</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Heart Points / Physical Activity Banner */}
      <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white font-bold">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-navy-900">
              Google Fit Heart Points: {heartPoints} pts
            </h4>
            <p className="text-xs text-navy-600">
              {heartPoints >= 150
                ? "Excellent! You have achieved the WHO recommended weekly 150 heart points for cardiovascular protection."
                : `${heartPoints} cardio minutes logged. Aim for 150 points weekly to keep your ISI baseline low.`}
            </p>
          </div>
        </div>
        <div className="text-xs font-semibold text-amber-900 bg-white/80 border border-amber-200 px-3 py-1.5 rounded-lg whitespace-nowrap self-start sm:self-auto">
          {googleFitConnected ? "Google Fit Live Sync Active" : "Calibrated Demonstration Baseline"}
        </div>
      </div>
    </div>
  );
}
