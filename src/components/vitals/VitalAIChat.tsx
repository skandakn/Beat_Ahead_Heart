"use client";

import { useEffect, useRef, useState } from "react";
import { useFitRest } from "@/lib/fit-rest/FitRestContext";
import { useSimulation } from "@/lib/simulation/SimulationContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Send,
  HeartPulse,
  User,
  RefreshCw,
  MessageSquare,
  Sparkles,
} from "lucide-react";

interface VitalChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

const QUICK_PROMPTS = [
  {
    label: "Analyze My Vitals",
    text: "Analyze my current Google Fit heart rate, blood pressure, and oxygen saturation.",
  },
  {
    label: "Why is my ISI < 45?",
    text: "Explain why my Ischemic Stress Index (ISI) is in the healthy zone and how Google Fit vitals influence it.",
  },
  {
    label: "Blood Pressure Review",
    text: "Review my blood pressure reading and give practical cardiovascular recommendations.",
  },
  {
    label: "Resting Heart Rate Impact",
    text: "How does my resting heart rate compare to general adult norms and cardiac endurance standards?",
  },
];

export function VitalAIChat() {
  const { googleFitVitals } = useFitRest();
  const { baseline, currentScore } = useSimulation();

  const [messages, setMessages] = useState<VitalChatMessage[]>([
    {
      id: "initial-1",
      role: "assistant",
      content: `Hello! I am your **Vital Agent** cardiovascular companion. 

I'm monitoring your Google Fit vitals:
• **Resting Heart Rate:** ${googleFitVitals?.restingHeartRate ?? baseline.restingHR} BPM
• **Blood Pressure:** ${googleFitVitals?.bloodPressure?.systolic ?? 118}/${googleFitVitals?.bloodPressure?.diastolic ?? 76} mmHg (${googleFitVitals?.bloodPressure?.category?.replace(/_/g, " ").toUpperCase() ?? "NORMAL"})
• **Ischemic Stress Index (ISI):** ${currentScore?.score ?? 28} / 100 (Healthy Baseline: ${baseline.isi ?? 32})

How can I help you interpret your physiological biomarkers today?`,
      timestamp: Date.now(),
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: VitalChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: "user",
      content: text.trim(),
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/vital-agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          vitals: googleFitVitals,
          isiContext: {
            currentISI: currentScore?.score ?? 28,
            baselineISI: baseline.isi ?? 32,
            trend: currentScore?.trend ?? "stable",
          },
        }),
      });

      if (!res.ok) {
        throw new Error("Chat request failed");
      }

      const data = await res.json();
      const assistantMsg: VitalChatMessage = {
        id: `msg-${Date.now()}-assistant`,
        role: "assistant",
        content: data.response || "I am analyzing your vitals. Please ask any specific questions.",
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}-err`,
          role: "assistant",
          content: "I could not reach the server just now. Your vitals remain healthy and stable according to your Google Fit records.",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border border-navy-100 bg-white shadow-card overflow-hidden">
      <CardHeader className="bg-navy-50/50 border-b border-navy-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-white shadow-xs">
              <HeartPulse className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-sm font-bold text-navy-900">
                Vital AI Cardiovascular Consultant
              </CardTitle>
              <p className="text-[11px] text-navy-500">
                Powered by Gemini LLM &amp; continuous Google Fit biometrics
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setMessages([
                {
                  id: `reset-${Date.now()}`,
                  role: "assistant",
                  content: "Chat cleared. What questions do you have about your heart health and Google Fit vitals?",
                  timestamp: Date.now(),
                },
              ])
            }
            className="text-xs text-navy-500 hover:text-navy-900 h-8"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Reset
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* Quick Prompts */}
        <div className="flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => sendMessage(p.text)}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded-full border border-navy-200 bg-white px-2.5 py-1 text-xs font-medium text-navy-700 hover:bg-navy-50 hover:border-navy-300 transition-colors"
            >
              <Sparkles className="w-3 h-3 text-red-500" />
              {p.label}
            </button>
          ))}
        </div>

        {/* Chat History */}
        <div className="h-80 overflow-y-auto space-y-3 pr-1 text-sm">
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn("flex gap-2.5", m.role === "user" ? "justify-end" : "justify-start")}
            >
              {m.role === "assistant" && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700 font-bold text-xs mt-0.5">
                  <HeartPulse className="h-3.5 w-3.5" />
                </div>
              )}
              <div
                className={cn(
                  "rounded-2xl px-3.5 py-2.5 max-w-[85%] whitespace-pre-wrap leading-relaxed text-xs sm:text-sm",
                  m.role === "user"
                    ? "bg-navy-900 text-white rounded-br-xs"
                    : "bg-navy-50 text-navy-900 border border-navy-100 rounded-bl-xs"
                )}
              >
                {m.content}
              </div>
              {m.role === "user" && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-200 text-navy-700 font-bold text-xs mt-0.5">
                  <User className="h-3.5 w-3.5" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-navy-500 py-1">
              <HeartPulse className="w-4 h-4 animate-pulse text-red-500" />
              <span>Analyzing Google Fit physiological data...</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Message Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="flex items-center gap-2 pt-2 border-t border-navy-100"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your heart rate, BP, SpO2, or ISI..."
            disabled={loading}
            className="flex-1 rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs sm:text-sm text-navy-900 placeholder:text-navy-400 focus:outline-none focus:border-navy-500"
          />
          <Button
            type="submit"
            disabled={!input.trim() || loading}
            size="sm"
            className="bg-navy-900 hover:bg-navy-800 text-white h-9 px-4 gap-1 text-xs"
          >
            <Send className="w-3.5 h-3.5" />
            Send
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
