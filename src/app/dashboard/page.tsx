"use client";

import { useEffect } from "react";
import { DashboardStats } from "@/components/dashboard/DashboardStats";
import { ISITrendChart } from "@/components/charts/ISITrendChart";
import { ISIGauge } from "@/components/isi/ISIGauge";
import { BaselineCard } from "@/components/isi/BaselineCard";
import { RiskTrendBanner } from "@/components/isi/RiskTrendBanner";
import { useSimulation } from "@/lib/simulation/SimulationContext";
import { useTour } from "@/lib/tour/TourContext";
import Link from "next/link";
import { Heart, PhoneCall, FileText, BookOpen, Info, Compass } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { useHardwareSerial } from "@/lib/hardware/HardwareSerialContext";
import { cn } from "@/lib/utils";


export default function DashboardPage() {
  const { settings, pauseMonitoring } = useSimulation();
  const { startTour } = useTour();
  const { t } = useI18n();
  const { isConnected, heartRate, stDeviationMm, isiScore, portName, isIschemiaDemoActive } = useHardwareSerial();


  // Dashboard always shows a stable ISI score — stop any running simulation
  useEffect(() => {
    pauseMonitoring();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3" data-tour-id="dashboard-header">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">{t("dashboard.title")}</h1>
          <p className="text-sm text-navy-500 mt-0.5">{t("dashboard.subtitle")}</p>
        </div>
      </div>

      {/* Live Hardware Telemetry Banner (when Arduino is streaming) */}
      {(isConnected || isIschemiaDemoActive) && (
        <div className={cn("p-4 rounded-xl flex items-center justify-between flex-wrap gap-3 shadow-xs animate-in fade-in duration-200 border", isIschemiaDemoActive ? "bg-red-50 border-red-300 text-red-950 animate-pulse" : "bg-emerald-50 border-emerald-300 text-emerald-950")}>
          <div className="flex items-center gap-3">
            <span className={cn("w-3 h-3 rounded-full animate-ping shrink-0", isIschemiaDemoActive ? "bg-red-500" : "bg-emerald-500")} />
            <div>
              <div className="text-xs font-bold text-emerald-950 flex items-center gap-2">
                <span>{isIschemiaDemoActive ? "🚨 Acute Ischemia Demonstration Active" : `AD8232 Hardware Streaming Active (${portName})`}</span>
                <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold", isIschemiaDemoActive ? "bg-red-200 text-red-900 border border-red-300" : "bg-emerald-200 text-emerald-900")}>{isIschemiaDemoActive ? "CRITICAL ALERT" : "LIVE TELEMETRY"}</span>
              </div>
              <p className={cn("text-xs mt-0.5", isIschemiaDemoActive ? "text-red-800" : "text-emerald-800")}>
                Heart Rate: <strong className="font-mono text-emerald-950">{heartRate} BPM</strong> &bull; ST Deviation: <strong className="font-mono text-emerald-950">{stDeviationMm >= 0 ? `+${stDeviationMm.toFixed(2)}` : stDeviationMm.toFixed(2)} mm</strong> &bull; ISI Score: <strong className="font-mono text-emerald-950">{isiScore}/100</strong>
              </p>
            </div>
          </div>
          <Link
            href="/monitor"
            className={cn("px-3.5 py-1.5 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors", isIschemiaDemoActive ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700")}
          >
            <span>Open ECG Monitor</span>
            <span>&rarr;</span>
          </Link>
        </div>
      )}
      <DashboardStats />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div data-tour-id="isi-trend-chart">
            <ISITrendChart />
          </div>
          <RiskTrendBanner />
        </div>
        <div className="space-y-6">
          <div className="rounded-xl border border-navy-100 bg-white p-6 shadow-card" data-tour-id="isi-gauge">
            <ISIGauge />
          </div>

        </div>
      </div>

      <BaselineCard />

      {/* ── Footer Section ──────────────────────────────────────────── */}
      <footer className="mt-12 pt-8 border-t border-navy-100">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {/* BeatAhead Branding */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-navy-900">
                <Heart className="w-4 h-4 text-white" fill="white" />
              </div>
              <span className="text-lg font-bold text-navy-900">BeatAhead</span>
            </div>
            <p className="text-xs text-navy-500">
              {t("dashboard.platform")}
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-xs font-semibold text-navy-700 uppercase tracking-wide mb-3">
              {t("dashboard.quickLinks")}
            </h3>
            <div className="space-y-2">
              <button
                type="button"
                onClick={startTour}
                className="flex items-center gap-2 text-sm text-navy-600 hover:text-navy-900 transition-colors"
              >
                <Compass className="w-3.5 h-3.5" />
                {t("dashboard.startTour")}
              </button>
              <Link
                href="/helpline"
                className="flex items-center gap-2 text-sm text-navy-600 hover:text-navy-900 transition-colors"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                {t("dashboard.helpline")}
              </Link>
              <Link
                href="/calls"
                className="flex items-center gap-2 text-sm text-navy-600 hover:text-navy-900 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                {t("dashboard.callRecords")}
              </Link>
            </div>
          </div>

          {/* Information */}
          <div>
            <h3 className="text-xs font-semibold text-navy-700 uppercase tracking-wide mb-3">
              {t("dashboard.information")}
            </h3>
            <div className="space-y-2">
              <Link
                href="/methodology"
                className="flex items-center gap-2 text-sm text-navy-600 hover:text-navy-900 transition-colors"
              >
                <BookOpen className="w-3.5 h-3.5" />
                {t("nav.methodology")}
              </Link>
              <Link
                href="/about"
                className="flex items-center gap-2 text-sm text-navy-600 hover:text-navy-900 transition-colors"
              >
                <Info className="w-3.5 h-3.5" />
                {t("nav.about")}
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-8 pt-6 border-t border-navy-100 text-center">
          <p className="text-xs text-navy-400">
            © {new Date().getFullYear()} BeatAhead. {t("footer.research")}
          </p>
        </div>
      </footer>
    </div>
  );
}
