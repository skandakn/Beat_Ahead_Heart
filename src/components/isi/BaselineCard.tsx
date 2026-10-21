"use client";

import { useSimulation } from "@/lib/simulation/SimulationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/I18nProvider";

import type { FeatureSet, PersonalBaseline, PhysiologicalSample } from "@/lib/isi/types";
import { cn, formatDeviation } from "@/lib/utils";

interface BaselineCardProps {
  sample?: PhysiologicalSample;
  baseline?: PersonalBaseline;
  features?: FeatureSet;
  title?: string;
}

export function BaselineCard({
  sample: sampleProp,
  baseline: baselineProp,
  features: featuresProp,
  title = "Your Baseline",
}: BaselineCardProps = {}) {
  const sim = useSimulation();
  const { t } = useI18n();

  const currentSample = sampleProp ?? sim.currentSample;
  const baseline = baselineProp ?? sim.baseline;
  const features = featuresProp ?? sim.features;

  const metrics = [
    {
      label: t("baseline.restingHR"),
      current: Math.round(currentSample.heartRate),
      baseline: baseline.restingHR,
      unit: "bpm",
    },
    {
      label: t("baseline.hrv"),
      current: Math.round(currentSample.hrv),
      baseline: baseline.hrv,
      unit: "ms",
    },
    {
      label: t("baseline.spo2"),
      current: currentSample.spo2.toFixed(1),
      baseline: baseline.spo2,
      unit: "%",
    },
    {
      label: t("baseline.pulseMorphology"),
      current: features.pulseMorphology.amplitude.toFixed(2),
      baseline: baseline.pulseMorphology,
      unit: "",
    },
  ];

  return (
    <Card className="relative overflow-hidden">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        <p className="text-xs text-navy-500 mt-1">
          {t("baseline.normalized")}
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {metrics.map((m) => {
            const deviation = formatDeviation(Number(m.current), m.baseline);
            const isNegative = deviation.startsWith("-");
            return (
              <div key={m.label} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-navy-900">{m.label}</p>
                  <p className="text-xs text-navy-400">
                    {t("baseline.baseline")}: {m.baseline}{m.unit}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-navy-900">
                    {m.current}
                    <span className="text-xs text-navy-400 font-normal ml-0.5">{m.unit}</span>
                  </p>
                  <p
                    className={cn(
                      "text-xs font-medium flex items-center gap-0.5 justify-end",
                      isNegative ? "text-blue-600" : deviation === "0%" ? "text-navy-400" : "text-amber-600"
                    )}
                  >
                    {isNegative ? <TrendingDown className="w-3 h-3" /> : deviation === "0%" ? <Minus className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                    {deviation}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
