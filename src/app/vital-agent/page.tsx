"use client";

import { FitRestProvider, useFitRest } from "@/lib/fit-rest/FitRestContext";
import { GoogleFitSync } from "@/components/fitness/GoogleFitSync";
import { VitalOverview } from "@/components/vitals/VitalOverview";
import { VitalTrendCharts } from "@/components/vitals/VitalTrendCharts";
import { VitalReport } from "@/components/vitals/VitalReport";
import { VitalAIChat } from "@/components/vitals/VitalAIChat";
import { SimulatedBadge } from "@/components/layout/Toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { HeartPulse, Activity, TrendingUp, FileText, ShieldCheck, CheckCircle2 } from "lucide-react";

function VitalAgentPageInner() {
  const { googleFitConnected } = useFitRest();

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* ── Page Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-navy-900">Vital Agent</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
              <HeartPulse className="h-3 w-3" />
              Biometrics &amp; Vitals Agent
            </span>
          </div>
          <p className="text-sm text-navy-500">
            Continuous cardiovascular biometrics &amp; autonomic vitals synced with Google Fit to calibrate your ISI baseline.
          </p>
        </div>
        <SimulatedBadge className="self-start sm:self-auto shrink-0" />
      </div>

      {/* ── Google Fit Biometrics Sync ───────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {googleFitConnected ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <Activity className="h-5 w-5 text-red-600" />
            )}
            <h2 className="text-lg font-semibold text-navy-900">
              {googleFitConnected ? "Google Fit Synced" : "Google Fit Vitals Integration"}
            </h2>
          </div>
          {googleFitConnected && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Synced &bull; Vitals Tracking Active
            </span>
          )}
        </div>
        <GoogleFitSync variant="vitals" />
      </div>

      {/* ── Vitals Navigation Tabs ──────────────────────────────────── */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1 bg-navy-50 border border-navy-100">
          <TabsTrigger value="overview" className="flex items-center gap-1.5 data-[state=active]:bg-white data-[state=active]:text-red-700 data-[state=active]:shadow-sm">
            <Activity className="h-3.5 w-3.5" />
            Vitals Overview
          </TabsTrigger>
          <TabsTrigger value="charts" className="flex items-center gap-1.5 data-[state=active]:bg-white data-[state=active]:text-red-700 data-[state=active]:shadow-sm">
            <TrendingUp className="h-3.5 w-3.5" />
            Dynamic Trends &amp; Charts
          </TabsTrigger>
          <TabsTrigger value="report" className="flex items-center gap-1.5 data-[state=active]:bg-white data-[state=active]:text-red-700 data-[state=active]:shadow-sm">
            <FileText className="h-3.5 w-3.5" />
            Clinical Vitals Report
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Overview */}
        <TabsContent value="overview" className="space-y-4 pt-2">
          <VitalOverview />
        </TabsContent>

        {/* Tab 2: Dynamic Trends */}
        <TabsContent value="charts" className="space-y-4 pt-2">
          <VitalTrendCharts />
        </TabsContent>

        {/* Tab 3: Clinical Report */}
        <TabsContent value="report" className="space-y-4 pt-2">
          <div className="max-w-4xl mx-auto">
            <VitalReport />
          </div>
        </TabsContent>
      </Tabs>

      {/* ── AI Vital Consultant ─────────────────────────────────────── */}
      <div className="space-y-4 pt-4 border-t border-navy-100">
        <div className="flex items-center gap-2">
          <HeartPulse className="h-5 w-5 text-red-600" />
          <div>
            <h2 className="text-lg font-semibold text-navy-900">AI Vital Consultant</h2>
            <p className="text-xs text-navy-500">
              Interactive clinical intelligence reasoning over your Google Fit biometrics and personal ISI risk baseline.
            </p>
          </div>
        </div>

        <div className="max-w-4xl">
          <VitalAIChat />
        </div>
      </div>

      {/* ── Clinical Disclaimer ──────────────────────────────────────── */}
      <div className="rounded-xl border border-navy-100 bg-navy-50/50 px-4 py-3">
        <p className="text-[10px] text-navy-500 leading-relaxed text-center">
          BeatAhead Vital Agent processes wellness biometrics from Google Fit and connected wearable sensors
          for informational and screening purposes only, and does not provide formal medical diagnosis.
          Consult a qualified cardiologist or physician for clinical evaluation.
        </p>
      </div>
    </div>
  );
}

export default function VitalAgentPage() {
  return (
    <FitRestProvider>
      <VitalAgentPageInner />
    </FitRestProvider>
  );
}
