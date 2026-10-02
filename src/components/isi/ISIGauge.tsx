"use client";

import { useSimulation } from "@/lib/simulation/SimulationContext";
import { cn, getISILabel } from "@/lib/utils";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MEDICAL_DISCLAIMER } from "@/lib/isi/types";
import { useI18n } from "@/lib/i18n/I18nProvider";

interface ISIGaugeProps {
  score?: number;
  baseline?: number;
  trend?: string;
  confidence?: number;
  size?: "sm" | "lg";
}

export function ISIGauge({
  score: propScore,
  baseline: propBaseline,
  trend: propTrend,
  confidence: propConfidence,
  size = "lg",
}: ISIGaugeProps) {
  const { currentScore } = useSimulation();
  const { t } = useI18n();
  
  const score = propScore ?? currentScore?.score ?? 0;
  const baseline = propBaseline ?? currentScore?.baseline ?? 40;
  const trend = propTrend ?? currentScore?.trend ?? "stable";
  const confidence = propConfidence ?? currentScore?.confidence ?? 0;
  const deviation = score - baseline;

  const productState = currentScore?.state ?? "Normal / Stable";

  const circumference = 2 * Math.PI * 88;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const getScoreColor = (s: number) => {
    if (s <= 30) return "#10B981";
    if (s <= 60) return "#F59E0B";
    return "#DC2626";
  };

  const trendIcon = trend === "increasing" ? "↑" : trend === "decreasing" ? "↓" : "→";

  return (
    <div className="flex flex-col items-center">
      <div className={cn("relative", size === "lg" ? "w-52 h-52" : "w-36 h-36")}>
        <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="88" fill="none" stroke="#E2E8F0" strokeWidth="12" />
          <circle
            cx="100"
            cy="100"
            r="88"
            fill="none"
            stroke={getScoreColor(score)}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("font-bold text-navy-900 font-mono", size === "lg" ? "text-5xl" : "text-3xl")}>
            {score}
          </span>
          <span className="text-xs font-semibold tracking-wider text-navy-500 uppercase mt-0.5">
            ISI: {score} / 100
          </span>
        </div>
      </div>

      <p className="mt-2 text-sm font-semibold text-navy-800">{getISILabel(score)}</p>
      
      <span className="mt-1 text-[11px] font-medium text-navy-500 bg-navy-50 px-2 py-0.5 rounded-full border border-navy-100">
        {t("isi.gauge.status")}: {productState}
      </span>

      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-xs w-full">
        <div>
          <span className="text-navy-400">{t("isi.gauge.personalBaseline")}</span>
          <p className="font-semibold text-navy-900">{baseline}</p>
        </div>
        <div>
          <span className="text-navy-400">{t("isi.gauge.currentDeviation")}</span>
          <p className={cn("font-semibold", deviation > 0 ? "text-cardiac" : "text-emerald-600")}>
            {deviation > 0 ? "+" : ""}{deviation}
          </p>
        </div>
        <div>
          <span className="text-navy-400">{t("isi.gauge.trend")}</span>
          <p className="font-semibold text-navy-900 capitalize">{trendIcon} {trend}</p>
        </div>
        <div>
          <span className="text-navy-400">{t("isi.gauge.confidence")}</span>
          <p className="font-semibold text-navy-900">{confidence}%</p>
        </div>
      </div>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger className="mt-2.5 flex items-center gap-1 text-[11px] text-navy-400 hover:text-navy-600">
            <Info className="w-3 h-3" />
            {t("isi.gauge.aboutArchitecture")}
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-xs">{MEDICAL_DISCLAIMER}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <p className="mt-1 text-[10px] text-navy-400 text-center max-w-xs">
        {t("isi.gauge.prototypeDisclaimer")}
      </p>
    </div>
  );
}
