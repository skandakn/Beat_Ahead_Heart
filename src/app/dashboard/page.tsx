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
import { Heart, PhoneCall, FileText, CreditCard, BookOpen, Info, Compass } from "lucide-react";
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
                href="/pricing"
                className="flex items-center gap-2 text-sm text-navy-600 hover:text-navy-900 transition-colors"
              >
                <CreditCard className="w-3.5 h-3.5" />
                {t("nav.pricing")}
              </Link>
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
