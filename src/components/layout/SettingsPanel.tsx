"use client";

import { useState } from "react";
import { useSimulation } from "@/lib/simulation/SimulationContext";
import { cn } from "@/lib/utils";
import { X, Settings, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageSelector } from "./LanguageSelector";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { DEMO_SCENARIOS, DemoScenario } from "@/lib/isi/types";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const { t } = useI18n();
  const { settings, updateSettings, scenario, setScenario } = useSimulation();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs" onClick={onClose}>
      <div
        className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-elevated overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-navy-100 px-4 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-navy-600" />
            <h2 className="font-semibold text-navy-900">{t("settings.title")}</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-navy-50" aria-label="Close settings">
            <X className="w-5 h-5 text-navy-500" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          <section className="rounded-xl border border-navy-200 bg-white p-4 space-y-2 shadow-xs">
            <h3 className="text-sm font-bold text-navy-900">{t("language.label")}</h3>
            <p className="text-xs text-navy-500">{t("language.description")}</p>
            <LanguageSelector className="mt-1 border border-navy-200 px-3 py-1.5" />
          </section>

          {/* Section: Physiological Simulation Scenario */}
          <section className="rounded-xl border border-navy-200 bg-white p-4 space-y-3 shadow-xs">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-navy-700" />
              <h3 className="text-sm font-bold text-navy-900">Physiological Scenario</h3>
            </div>
            <p className="text-xs text-navy-500">
              Select the active screening simulation. Default is Normal / Healthy Baseline (ISI &lt; 45).
            </p>
            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value as DemoScenario)}
              className="w-full rounded-lg border border-navy-200 bg-navy-50/50 px-3 py-2 text-xs font-semibold text-navy-900 focus:outline-none focus:border-navy-400"
            >
              {DEMO_SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} ({s.id === "normal" ? "Healthy, ISI < 45" : s.description})
                </option>
              ))}
            </select>
          </section>

          {/* Section: Display Settings */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase text-navy-400">{t("settings.display")}</h3>
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <p className="text-sm font-medium text-navy-700">Show ISI Range Guide</p>
                <p className="text-[11px] text-navy-400">Display the 0-30, 31-60, 61-100 illustrative scale</p>
              </div>
              <input
                type="checkbox"
                checked={settings.showRangeLabels}
                onChange={(e) => updateSettings({ showRangeLabels: e.target.checked })}
                className="w-4 h-4 rounded border-navy-300 text-navy-900 focus:ring-navy-500"
              />
            </label>
          </section>
        </div>
      </div>
    </div>
  );
}

export function SettingsButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn("p-2 rounded-lg hover:bg-navy-50 text-navy-500", className)}
        aria-label="Open settings"
      >
        <Settings className="w-4 h-4" />
      </button>
      <SettingsPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
