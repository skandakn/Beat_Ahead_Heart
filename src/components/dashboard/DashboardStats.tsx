"use client";

import { useSimulation } from "@/lib/simulation/SimulationContext";
import { cn, getTrendLabel } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, TrendingUp, Target } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { useHardwareSerial } from "@/lib/hardware/HardwareSerialContext";

export function DashboardStats() {
  const { currentScore, baseline } = useSimulation();
  const { t } = useI18n();
  const { isConnected, isiScore } = useHardwareSerial();

  const stats = [
    {
      label: t("stats.currentISI"),
      value: isConnected ? isiScore : (currentScore?.score ?? "--"),
      suffix: "/ 100",
      icon: Activity,
      accent: true,
    },
    {
      label: t("stats.trend"),
      value: currentScore ? getTrendLabel(currentScore.trend, t) : "--",
      prefix: currentScore?.trend === "increasing" ? "↑" : currentScore?.trend === "decreasing" ? "↓" : "→",
      icon: TrendingUp,
    },
    {
      label: t("stats.baseline"),
      value: currentScore?.baseline ?? baseline.isi,
      icon: Target,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.label} className={cn("overflow-hidden", stat.accent ? "border-rose-300 bg-rose-50/30" : "")}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-navy-500">{stat.label}</p>
                  <p className={cn("mt-1 text-2xl font-bold", stat.accent ? "text-cardiac" : "text-navy-900")}>
                    {stat.prefix && <span className="mr-1">{stat.prefix}</span>}
                    {stat.value}
                    {stat.suffix && <span className="text-xs font-normal text-navy-400 ml-1">{stat.suffix}</span>}
                  </p>
                </div>
                <div className={cn("p-2 rounded-lg", stat.accent ? "bg-red-50" : "bg-navy-50")}>
                  <Icon className={cn("w-4 h-4", stat.accent ? "text-cardiac" : "text-navy-600")} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
