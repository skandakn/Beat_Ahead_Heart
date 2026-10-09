"use client";

import { useSimulation } from "@/lib/simulation/SimulationContext";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Info, CheckCircle2, ShieldAlert } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";

export function RiskTrendBanner() {
  const { currentScore, baseline } = useSimulation();
  const { t } = useI18n();

  if (!currentScore) return null;

  const state = currentScore.state || "Normal / Stable";
  const modelAlert = currentScore.modelAlert || false;
  const isElevatedTrend = currentScore.score > baseline.isi + 10 || state === "Elevated ISI Trend";

  let bannerStyle = "border-emerald-200 bg-emerald-50 text-emerald-900";
  let icon = <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />;
  let title = t("risk.banner.withinBaseline.title");
  let subtitle = t("risk.banner.withinBaseline.subtitle");

  if (state === "Insufficient Signal Quality") {
    bannerStyle = "border-slate-300 bg-slate-100 text-slate-900";
    icon = <Info className="w-5 h-5 text-slate-600 shrink-0 mt-0.5" />;
    title = t("risk.banner.insufficientSignal.title");
    subtitle = t("risk.banner.insufficientSignal.subtitle");
  } else if (state === "Baseline Establishing") {
    bannerStyle = "border-blue-200 bg-blue-50 text-blue-900";
    icon = <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />;
    title = t("risk.banner.establishing.title");
    subtitle = t("risk.banner.establishing.subtitle");
  } else if (state === "Elevated Model Evidence" || modelAlert) {
    bannerStyle = "border-rose-200 bg-rose-50 text-rose-900";
    icon = <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />;
    title = t("risk.banner.elevatedEvidence.title");
    subtitle = t("risk.banner.elevatedEvidence.subtitle");
  } else if (isElevatedTrend) {
    bannerStyle = "border-amber-200 bg-amber-50 text-amber-900";
    icon = <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />;
    title = t("risk.banner.elevatedTrend.title");
    subtitle = t("risk.banner.elevatedTrend.subtitle");
  }

  return (
    <Card className={bannerStyle}>
      <CardContent className="p-4 flex items-start gap-3">
        {icon}
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs opacity-90 mt-0.5">{subtitle}</p>
        </div>
      </CardContent>
    </Card>
  );
}
