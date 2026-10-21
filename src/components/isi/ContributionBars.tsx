"use client";

import { useSimulation } from "@/lib/simulation/SimulationContext";
import type { ISIContributions } from "@/lib/isi/types";
import { getContributionInfluence } from "@/lib/isi/features";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Cpu } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";

interface ContributionBarsProps {
  contributions?: ISIContributions;
}

export function ContributionBars({ contributions: contributionsProp }: ContributionBarsProps = {}) {
  const { currentScore } = useSimulation();
  const { t } = useI18n();

  const contributions = contributionsProp ?? currentScore.contributions;

  const items = [
    { label: t("contribution.modelEvidence"), value: contributions.modelEvidence ?? 0.05, key: "modelEvidence" as const },
    { label: t("contribution.autonomic"), value: contributions.autonomic ?? 0.10, key: "autonomic" as const },
    { label: t("contribution.perfusion"), value: contributions.perfusion ?? 0.08, key: "perfusion" as const },
    { label: t("contribution.hrv"), value: contributions.hrv, key: "hrv" as const },
    { label: t("contribution.motionArtifact"), value: contributions.motionArtifact, key: "motionArtifact" as const },
  ];

  return (
    <Card className="relative overflow-hidden">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Cpu className="w-4 h-4 text-indigo-600" />
            {t("contribution.title")}
          </CardTitle>
        </div>
        <p className="text-xs text-navy-500">{t("contribution.subtitle")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          {items.map((c) => (
            <div key={c.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-navy-900">{c.label}</span>
                <span className="text-[11px] font-mono text-navy-600">{(c.value * 100).toFixed(1)}%</span>
              </div>
              <Progress value={Math.min(100, Math.max(0, c.value * 100))} className="h-2" />
            </div>
          ))}
          <p className="text-[10px] text-navy-400 pt-2 border-t border-navy-100">
            {t("contribution.disclaimer")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
