"use client";

import { LiveEcgMonitor } from "@/components/ecg/LiveEcgMonitor";

export default function MonitorPage() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-navy-100 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-navy-900">
            Real-Time ECG Hardware Monitor
          </h1>
          <p className="text-xs text-navy-500 mt-0.5">
            Arduino UNO & AD8232 physical bio-potential front-end telemetry & ischemic ST deviation tracking.
          </p>
        </div>
      </div>

      <LiveEcgMonitor />
    </div>
  );
}
