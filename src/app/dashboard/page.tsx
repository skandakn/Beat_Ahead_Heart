"use client";

import { useEffect } from "react";
import { DashboardStats } from "@/components/dashboard/DashboardStats";
import { ISITrendChart } from "@/components/charts/ISITrendChart";
import { ISIGauge } from "@/components/isi/ISIGauge";
import { BaselineCard } from "@/components/isi/BaselineCard";
import { RiskTrendBanner } from "@/components/isi/RiskTrendBanner";
import { ContributionBars } from "@/components/isi/ContributionBars";
import { useSimulation } from "@/lib/simulation/SimulationContext";
import { useTour } from "@/lib/tour/TourContext";
import Link from "next/link";
import { Heart, PhoneCall, FileText, BookOpen, Info, Compass, Activity, ChevronRight, Usb } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";

export default function DashboardPage() {
  const { settings, pauseMonitoring } = useSimulation();
  const { startTour } = useTour();
  const { t } = useI18n();

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

      {/* Live ECG Hardware Telemetry Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-cardiac/20 bg-gradient-to-r from-cardiac/5 via-rose-50/40 to-white shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-cardiac text-white flex items-center justify-center shadow-xs shrink-0">
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-navy-900">Arduino UNO & AD8232 Live ECG Hardware</h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-ping" />
                Hardware Telemetry Ready
              </span>
            </div>
            <p className="text-xs text-navy-500 mt-0.5">
              Connect your physical Arduino Uno via USB serial (COM port) to observe real-time QRS waveforms and detect ischemic ST depression.
            </p>
          </div>
        </div>
        <Link
          href="/monitor"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-cardiac hover:bg-red-700 text-white text-xs font-semibold shadow-xs transition-colors shrink-0"
        >
          <Usb className="w-3.5 h-3.5 mr-0.5" />
          Launch Live ECG Monitor
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

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

      <div className="grid lg:grid-cols-2 gap-6">
        <BaselineCard />
        <ContributionBars />
      </div>

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
