"use client";

import { useEffect } from "react";

import { useSimulation } from "@/lib/simulation/SimulationContext";
import { cn, getISILabel, getTrendLabel, getQualityColor, getQualityLabel } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSafeFitRest } from "@/lib/fit-rest/FitRestContext";
import {
  Heart,
  Activity,
  Droplets,
  Signal,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  Utensils,
} from "lucide-react";
import type { NutriISIContext } from "@/lib/nutri/types";

// ─── Props ────────────────────────────────────────────────────────────────────

interface WellnessSnapshotProps {
  /** Called whenever the ISI context changes — lets siblings pass it to sendMessage */
  onContext?: (ctx: NutriISIContext) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function WellnessSnapshot({ onContext }: WellnessSnapshotProps) {
  // Read-only — zero computation, zero side-effects
  const { currentScore, currentSample, scenario } = useSimulation();
  const { googleFitConnected, googleFitNutrition, googleFitAuthExpired } = useSafeFitRest();

  const score = currentScore?.score ?? 0;
  const trend = currentScore?.trend ?? "stable";
  const heartRate = Math.round(currentSample?.heartRate ?? 0);
  const hrv = Math.round(currentSample?.hrv ?? 0);
  const spo2Raw = currentSample?.spo2 ?? 97;
  const spo2Display = spo2Raw.toFixed(1);
  const signalQuality = currentSample?.signalQuality?.overall ?? 0;
  const isiLabel = getISILabel(score);
  const trendLabel = getTrendLabel(trend);
  const scenarioLabel = scenario.replace(/_/g, " ");

  // Persistent-rising safety trigger
  const isPersistentRising = scenario === "persistent_rising";

  // Notify parent when actual values change — must be in useEffect, never in render
  // body, because calling the parent's setState during render causes an infinite loop.
  // Primitive deps (numbers + strings) allow React to bail out when values are unchanged.
  useEffect(() => {
    if (onContext) {
      onContext({
        score,
        trend,
        baseline: currentScore?.baseline ?? 48,
        label: isiLabel,
        heartRate,
        hrv,
        spo2: spo2Raw,
        scenario: scenarioLabel,
        signalQuality,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score, trend, heartRate, hrv, spo2Raw, signalQuality, scenarioLabel, onContext]);

  // Score colour coding
  const scoreBg =
    score >= 70 ? "bg-red-50" : score >= 40 ? "bg-amber-50" : "bg-emerald-50";
  const scoreText =
    score >= 70 ? "text-cardiac" : score >= 40 ? "text-amber-600" : "text-emerald-600";
  const trendColor =
    trend === "increasing"
      ? "text-cardiac"
      : trend === "decreasing"
      ? "text-emerald-600"
      : "text-navy-400";

  const TrendIcon =
    trend === "increasing" ? TrendingUp : trend === "decreasing" ? TrendingDown : Minus;

  const vitals = [
    { icon: Heart, label: "Heart Rate", value: `${heartRate}`, unit: "bpm" },
    { icon: Activity, label: "HRV", value: `${hrv}`, unit: "ms" },
    { icon: Droplets, label: "SpO₂", value: spo2Display, unit: "%" },
  ] as const;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Personal Wellness Snapshot</CardTitle>
          <div className="flex items-center gap-1.5">
            {googleFitConnected && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                Google Fit Synced
              </span>
            )}
            {googleFitAuthExpired && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
                Fit Session Expired
              </span>
            )}
            <span className="text-[10px] text-navy-500 capitalize rounded-full bg-navy-50 border border-navy-100 px-2 py-0.5">
              {scenarioLabel}
            </span>
          </div>
        </div>
        <p className="text-[11px] text-navy-400">
          Research prototype data — not clinically validated
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ISI Score — prominent tile */}
        <div className={cn("rounded-xl p-4 flex items-center justify-between", scoreBg)}>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-navy-500">
              Wellness Indicator
            </p>
            <p className={cn("text-4xl font-extrabold mt-0.5 leading-none", scoreText)}>
              {score}
            </p>
            <p className="text-xs text-navy-500 mt-1">{isiLabel}</p>
          </div>
          <div className="text-right">
            <div className={cn("flex items-center justify-end gap-1", trendColor)}>
              <TrendIcon className="h-4 w-4" />
              <span className="text-sm font-semibold">{trendLabel}</span>
            </div>
            <p className="text-[10px] text-navy-400 mt-1">out of 100</p>
          </div>
        </div>

        {/* Synced Google Fit dietary intake banner */}
        {googleFitConnected && (googleFitNutrition?.today?.calories ?? 0) > 0 && (
          <div className="flex items-center justify-between rounded-lg bg-emerald-50/70 border border-emerald-200 px-3 py-2 text-xs">
            <div className="flex items-center gap-2 text-emerald-800">
              <Utensils className="h-3.5 w-3.5 text-emerald-600" />
              <span className="font-semibold">Synced Dietary Intake</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-navy-900">
                {Math.round(googleFitNutrition?.today?.calories ?? 0).toLocaleString()} kcal
              </span>
              <span className="text-[10px] font-medium text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded">
                Live Fit
              </span>
            </div>
          </div>
        )}

        {/* Vitals row */}
        <div className="grid grid-cols-3 gap-2">
          {vitals.map(({ icon: Icon, label, value, unit }) => (
            <div
              key={label}
              className="rounded-lg border border-navy-100 bg-white p-2.5 text-center"
            >
              <Icon className="h-3.5 w-3.5 text-navy-400 mx-auto mb-1" />
              <p className="text-base font-bold text-navy-900 leading-tight">
                {value}
                <span className="text-[10px] font-normal text-navy-400">{unit}</span>
              </p>
              <p className="text-[10px] text-navy-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Signal quality */}
        <div className="flex items-center gap-1.5">
          <Signal className="h-3 w-3 text-navy-400 shrink-0" />
          <span className="text-[11px] text-navy-500">Signal quality:</span>
          <span className={cn("text-[11px] font-medium", getQualityColor(signalQuality))}>
            {getQualityLabel(signalQuality)} ({Math.round(signalQuality)}%)
          </span>
        </div>

        {/* ── Safety banner — persistent rising trend ───────────────────── */}
        {isPersistentRising && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-cardiac shrink-0 mt-0.5" />
            <p className="text-xs text-red-900 leading-relaxed">
              Your wellness dashboard has detected a concerning physiological trend. Nutrition
              guidance cannot replace clinical assessment. Please follow the clinical follow-up
              guidance provided by BeatAhead.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
