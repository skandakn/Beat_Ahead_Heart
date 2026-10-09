"use client";

import { useEffect, useState } from "react";
import { useSimulation } from "@/lib/simulation/SimulationContext";
import { cn } from "@/lib/utils";

interface SystemStatusPanelProps {
  compact?: boolean;
}

export function SystemStatusPanel({ compact }: SystemStatusPanelProps) {
  const { systemStatus } = useSimulation();
  const [gfitStatus, setGfitStatus] = useState<"synced" | "expired" | "none">("none");

  useEffect(() => {
    try {
      const hasToken = !!localStorage.getItem("beatahead-gfit-token");
      const isExpired = localStorage.getItem("beatahead-gfit-auth-expired") === "true";
      if (hasToken && isExpired) {
        setGfitStatus("expired");
      } else if (hasToken) {
        setGfitStatus("synced");
      } else {
        setGfitStatus("none");
      }
    } catch {}
  }, []);

  const dataSyncLabel =
    gfitStatus === "expired"
      ? "Google Fit (expired)"
      : gfitStatus === "synced"
      ? "Google Fit (synced)"
      : systemStatus.dataSync;

  const items = [
    { label: "AI Engine", status: systemStatus.aiEngine },
    { label: "ISI Engine", status: systemStatus.isiEngine },
    {
      label: "Data Sync",
      status: dataSyncLabel,
    },
  ];

  const isOnline = (status: string) =>
    status === "online" ||
    status === "simulated" ||
    status === "active" ||
    status === "connected" ||
    status === "standby" ||
    (status.includes("synced") && !status.includes("expired"));

  const isWarning = (status: string) => status.includes("expired");

  const getStatusColor = (status: string) => {
    if (isWarning(status)) return "text-amber-600";
    if (isOnline(status)) return "text-emerald-600";
    return "text-navy-400";
  };

  const getDotColor = (status: string) => {
    if (isWarning(status)) return "bg-amber-500";
    if (isOnline(status)) return "bg-emerald-500";
    return "bg-navy-300";
  };

  if (compact) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-navy-500">System Status</p>
        {items.slice(0, 3).map((item) => (
          <div key={item.label} className="flex items-center justify-between text-[10px]">
            <span className="text-navy-500">{item.label}</span>
            <span className={cn("flex items-center gap-1", getStatusColor(item.status))}>
              <span className={cn("w-1.5 h-1.5 rounded-full", getDotColor(item.status))} />
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
          <span className={cn("flex items-center gap-1.5 capitalize", getStatusColor(item.status))}>
            <span className={cn("w-1.5 h-1.5 rounded-full", getDotColor(item.status))} />
            {item.status}
          </span>
        </div>
      ))}
    </div>
  );
}
