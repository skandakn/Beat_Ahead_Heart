import type { Metadata } from "next";
import { Ambulance } from "lucide-react";
import { EmergencyAssistance } from "@/components/emergency/EmergencyAssistance";

export const metadata: Metadata = {
  title: "RapidCare — BeatAhead",
  description:
    "Immediate nearby healthcare options, emergency services direct call (112), and location sharing. Research/wellness prototype.",
};

export default function RapidCarePage() {
  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* ── Page Header matching BeatAhead feature design system ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-navy-900">RapidCare</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-navy-200 bg-navy-50 px-2.5 py-0.5 text-xs font-semibold text-navy-700">
              <Ambulance className="h-3.5 w-3.5 text-navy-700" />
              Healthcare & Rapid Response
            </span>
          </div>
          <p className="text-sm text-navy-500">
            Immediate nearby healthcare directory, emergency services direct dial (112), and real-time location sharing.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-navy-100 shadow-card p-4 sm:p-6">
        <EmergencyAssistance />
      </div>
    </div>
  );
}
