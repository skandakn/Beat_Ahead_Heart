"use client";

import { useEffect, useState } from "react";
import { useSimulation } from "@/lib/simulation/SimulationContext";
import { cn } from "@/lib/utils";

interface SystemStatusPanelProps {
  compact?: boolean;
}

export function SystemStatusPanel({ compact }: SystemStatusPanelProps) {
  const { systemStatus } = useSimulation();
  const [gfitSynced, setGfitSynced] = useState(false);

  useEffect(() => {
    try {
      const hasToken = !!localStorage.getItem("beatahead-gfit-token");
      setGfitSynced(hasToken);
    } catch {}
  }, []);

  const items = [
    { label: "AI Engine", status: systemStatus.aiEngine },
    { label: "ISI Engine", status: systemStatus.isiEngine },
    {
      label: "Data Sync",
      status: gfitSynced ? "Google Fit (synced)" : systemStatus.dataSync,
    },
  ];

  const isOnline = (status: string) =>
    status === "online" ||
    status === "simulated" ||
    status === "active" ||
    status === "connected" ||
    status === "standby" ||
    status.includes("synced");

  if (compact) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-navy-500">System Status</p>
        {items.slice(0, 3).map((item) => (
          <div key={item.label} className="flex items-center justify-between text-[10px]">
            <span className="text-navy-500">{item.label}</span>
            <span className={cn("flex items-center gap-1", isOnline(item.status) ? "text-emerald-600" : "text-navy-400")}>
              <span className={cn("w-1.5 h-1.5 rounded-full", isOnline(item.status) ? "bg-emerald-500" : "bg-navy-300")} />
              {item.status}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-navy-100 bg-white p-4 space-y-2">
      <p className="text-sm font-semibold text-navy-900">System Status</p>
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between text-xs">
          <span className="text-navy-500">{item.label}</span>
          <span className={cn("flex items-center gap-1.5 capitalize", isOnline(item.status) ? "text-emerald-600" : "text-navy-400")}>
            <span className={cn("w-1.5 h-1.5 rounded-full", isOnline(item.status) ? "bg-emerald-500" : "bg-navy-300")} />
            {item.status}
          </span>
        </div>
      ))}
    </div>
  );
}
