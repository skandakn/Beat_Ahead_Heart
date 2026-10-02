"use client";

import React, { useState } from "react";
import { AlertTriangle, PhoneCall } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmergencyModal } from "./EmergencyModal";

interface EmergencyButtonProps {
  variant?: "header" | "sidebar" | "nav" | "compact";
  className?: string;
}

export function EmergencyButton({
  variant = "header",
  className,
}: EmergencyButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {variant === "header" && (
        <button
          onClick={() => setIsOpen(true)}
          className={cn(
            "group relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-xs font-black shadow-sm transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1",
            className
          )}
          aria-label="Open Emergency Assistance"
          data-testid="header-emergency-button"
        >
          <span className="flex h-2 w-2 relative shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-300 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
          </span>
          <AlertTriangle className="w-3.5 h-3.5 fill-white text-red-600 shrink-0" />
          <span className="tracking-tight">Emergency</span>
        </button>
      )}

      {variant === "sidebar" && (
        <div className={cn("p-2", className)}>
          <button
            onClick={() => setIsOpen(true)}
            className="w-full group flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 text-white font-bold text-xs shadow-md shadow-red-600/20 hover:shadow-lg hover:shadow-red-600/30 transition-all active:scale-[0.99] border border-red-500/50"
            aria-label="Open Emergency Assistance"
            data-testid="sidebar-emergency-button"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20">
                <AlertTriangle className="w-4 h-4 text-white fill-white" />
              </div>
              <div className="text-left">
                <p className="text-[10px] uppercase tracking-wider text-red-100 font-extrabold">
                  Immediate Help
                </p>
                <p className="text-xs font-black text-white">Emergency Assistance</p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-md bg-white/25 text-[10px] font-black uppercase">
              112
            </span>
          </button>
        </div>
      )}

      {variant === "nav" && (
        <button
          onClick={() => setIsOpen(true)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-black shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-red-500",
            className
          )}
          aria-label="Open Emergency Assistance"
          data-testid="nav-emergency-button"
        >
          <PhoneCall className="w-3.5 h-3.5 fill-white text-red-600" />
          <span>Emergency (112)</span>
        </button>
      )}

      {variant === "compact" && (
        <button
          onClick={() => setIsOpen(true)}
          className={cn(
            "p-2 rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-sm transition-all",
            className
          )}
          aria-label="Open Emergency Assistance"
          title="Emergency Assistance"
        >
          <AlertTriangle className="w-4 h-4 fill-white text-red-600" />
        </button>
      )}

      {/* Modal triggered by click */}
      <EmergencyModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
