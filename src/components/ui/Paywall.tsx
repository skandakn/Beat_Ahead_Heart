"use client";

import React from "react";

interface PaywallProps {
  featureName?: string;
  description?: string;
  children?: React.ReactNode;
}

export function Paywall({ children }: PaywallProps) {
  return <>{children}</>;
}
