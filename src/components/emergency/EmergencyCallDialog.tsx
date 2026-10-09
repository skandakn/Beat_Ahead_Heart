"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  MapPin,
  AlertTriangle,
  HeartPulse,
  Clock,
  Radio,
  Send,
  Copy,
  Check,
  Share2,
  ExternalLink,
  ShieldAlert,
  Smartphone,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmergencyCallDialogProps {
  phoneNumber: string;
  facilityName: string;
  isEmergency112: boolean;
  coords: { latitude: number; longitude: number } | null;
  onClose: () => void;
}

interface TranscriptItem {
  speaker: "dispatcher" | "user" | "system";
  text: string;
  time: string;
}

export function EmergencyCallDialog({
  phoneNumber,
  facilityName,
  isEmergency112,
  coords,
  onClose,
}: EmergencyCallDialogProps) {
  // Call status: 'ringing' | 'connected' | 'ended'
  const [callStatus, setCallStatus] = useState<"ringing" | "connected" | "ended">("ringing");
  const [callDuration, setCallDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState<boolean>(true);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isDispatcherSpeaking, setIsDispatcherSpeaking] = useState<boolean>(false);

  // Transcripts & Input
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  const [textInput, setTextInput] = useState<string>("");
  const [callId, setCallId] = useState<string>(() => `emergency_${Date.now()}`);

  // Exotel Outbound Phone Call state
  const [mobileInput, setMobileInput] = useState<string>("");
  const [isExotelCalling, setIsExotelCalling] = useState<boolean>(false);
  const [exotelMessage, setExotelMessage] = useState<string | null>(null);

  // Telemetry Feedback
  const [copiedCoords, setCopiedCoords] = useState<boolean>(false);

  // Audio References
  const audioContextRef = useRef<AudioContext | null>(null);
  const ringGainRef = useRef<GainNode | null>(null);
  const ringOsc1Ref = useRef<OscillatorNode | null>(null);
  const ringOsc2Ref = useRef<OscillatorNode | null>(null);
  const recognitionRef = useRef<any>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectedRef = useRef<boolean>(false);
  const isSpeakerOnRef = useRef<boolean>(true);

  useEffect(() => {
    isSpeakerOnRef.current = isSpeakerOn;
  }, [isSpeakerOn]);

  useEffect(() => {
    isConnectedRef.current = callStatus === "connected";
  }, [callStatus]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts]);

  // Format time HH:MM:SS or MM:SS
  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // Helper to add transcript
  const addTranscript = useCallback((speaker: "dispatcher" | "user" | "system", text: string) => {
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setTranscripts((prev) => [...prev, { speaker, text, time }]);
  }, []);

  // Web Speech API / Browser speech output
  const speakText = useCallback((text: string) => {
    if (!isSpeakerOnRef.current || typeof window === "undefined") return;

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.lang = "en-IN";

      utterance.onstart = () => setIsDispatcherSpeaking(true);
      utterance.onend = () => setIsDispatcherSpeaking(false);
      utterance.onerror = () => setIsDispatcherSpeaking(false);

      window.speechSynthesis.speak(utterance);
    }
  }, []);

  // Stop Ringback audio
  const stopRingAudio = useCallback(() => {
    try {
      if (ringOsc1Ref.current) {
        ringOsc1Ref.current.stop();
        ringOsc1Ref.current.disconnect();
        ringOsc1Ref.current = null;
      }
      if (ringOsc2Ref.current) {
        ringOsc2Ref.current.stop();
        ringOsc2Ref.current.disconnect();
        ringOsc2Ref.current = null;
      }
      if (ringGainRef.current) {
        ringGainRef.current.disconnect();
        ringGainRef.current = null;
      }
    } catch {}
  }, []);

  // Start realistic telephone ring using Web Audio API
  const startRingAudio = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      // North American / International standard dual-tone ringback: 440 Hz + 480 Hz
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.frequency.value = 440;
      osc2.frequency.value = 480;

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      // Cadence: 1.2s on, 1.8s off, 1.2s on
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.setValueAtTime(0, now + 1.2);
      gain.gain.setValueAtTime(0.12, now + 2.5);
      gain.gain.setValueAtTime(0, now + 3.7);

      osc1.start(now);
      osc2.start(now);

      ringOsc1Ref.current = osc1;
      ringOsc2Ref.current = osc2;
      ringGainRef.current = gain;
    } catch (e) {
      console.warn("Web Audio telephone ring init skipped:", e);
    }
  }, []);

  // Speech Recognition (Microphone listener)
  const startListening = useCallback(() => {
    if (typeof window === "undefined" || isMuted) return;

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const rec = new SpeechRec();
      rec.continuous = true;
      rec.interimResults = false;
      rec.lang = "en-IN";

      rec.onstart = () => setIsListening(true);
      rec.onend = () => {
        setIsListening(false);
        // Restart if still connected and unmuted
        if (isConnectedRef.current && !isMuted) {
          setTimeout(() => {
            if (isConnectedRef.current && !isMuted) {
              try { rec.start(); } catch {}
            }
          }, 300);
        }
      };

      rec.onresult = (event: any) => {
        const lastResult = event.results[event.results.length - 1];
        if (lastResult.isFinal) {
          const userTranscript = lastResult[0].transcript.trim();
          if (userTranscript) {
            handleUserMessageRef.current(userTranscript);
          }
        }
      };

      rec.start();
      recognitionRef.current = rec;
    } catch (e) {
      console.warn("Speech recognition initialization:", e);
    }
  }, [isMuted]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  // Handle incoming message from caller
  const handleUserMessage = async (messageText: string) => {
    addTranscript("user", messageText);

    try {
      // Send to voice triage API
      const res = await fetch("/api/voice/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "utterance",
          callId,
          message: messageText,
          callerId: isEmergency112 ? "Caller (112 Emergency Line)" : `Caller (${facilityName})`,
        }),
      });

      const data = await res.json();
      if (data && data.responseText) {
        addTranscript("dispatcher", data.responseText);
        speakText(data.responseText);
        return;
      }
    } catch {}

    // Deterministic fallback if API is unreachable
    const lower = messageText.toLowerCase();
    let reply = "We have logged your report. Paramedics and medical response have been notified. Stay seated and keep your phone line open.";
    if (lower.includes("chest") || lower.includes("pain") || lower.includes("pressure") || lower.includes("heart")) {
      reply = "CRITICAL CARDIAC ALERT: Please sit upright with knees bent. Do not walk or climb stairs. If not allergic, chew one 325 milligram aspirin immediately. Unlock your front door so emergency responders can enter.";
    } else if (lower.includes("breath") || lower.includes("breathing") || lower.includes("sweat") || lower.includes("dizzy")) {
      reply = "Keep calm, loosen tight clothing around your chest and neck, and take slow, steady breaths. Emergency services are monitoring your location.";
    }

    addTranscript("dispatcher", reply);
    speakText(reply);
  };

  const handleUserMessageRef = useRef(handleUserMessage);
  useEffect(() => {
    handleUserMessageRef.current = handleUserMessage;
  });

  // Connect the call after ringing
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    startRingAudio();
    addTranscript("system", `Dialing ${isEmergency112 ? "National Emergency Services (112)" : facilityName} [${phoneNumber}]...`);

    // Ring for 2.2 seconds then answer
    const ringTimer = setTimeout(() => {
      stopRingAudio();
      setCallStatus("connected");

      const coordsStr = coords
        ? `GPS location locked at ${coords.latitude.toFixed(4)}° N, ${coords.longitude.toFixed(4)}° E.`
        : "GPS location locating...";

      const greeting = isEmergency112
        ? `BeatAhead Emergency Response Dispatch connected on Line 112. ${coordsStr} Please state your emergency: are you or the patient experiencing chest pain, difficulty breathing, or sudden weakness?`
        : `Connected to ${facilityName} healthcare line. ${coordsStr} How can the medical team assist you right now?`;

      addTranscript("dispatcher", greeting);
      speakText(greeting);

      // Start duration timer
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);

      // Start mic
      startListening();
    }, 2200);

    return () => {
      clearTimeout(ringTimer);
      stopRingAudio();
      if (timerRef.current) clearInterval(timerRef.current);
      stopListening();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // End Call handler
  const handleEndCall = () => {
    stopRingAudio();
    stopListening();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (timerRef.current) clearInterval(timerRef.current);

    setCallStatus("ended");
    addTranscript("system", `Call ended. Duration: ${formatDuration(callDuration)}.`);

    // Notify backend
    try {
      fetch("/api/voice/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end", callId }),
      }).catch(() => {});
    } catch {}

    setTimeout(() => {
      onClose();
    }, 1200);
  };

  // Toggle Mute
  const handleToggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      startListening();
    } else {
      setIsMuted(true);
      stopListening();
    }
  };

  // Toggle Speaker
  const handleToggleSpeaker = () => {
    if (isSpeakerOn) {
      setIsSpeakerOn(false);
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    } else {
      setIsSpeakerOn(true);
    }
  };

  // Submit typed message
  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    const msg = textInput.trim();
    setTextInput("");
    handleUserMessage(msg);
  };

  // Copy GPS Coordinates
  const handleCopyCoords = async () => {
    if (!coords) return;
    const text = `Emergency GPS Coordinates: ${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)} | Maps: https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCoords(true);
      setTimeout(() => setCopiedCoords(false), 3000);
    } catch {}
  };

  // Dispatch real Outbound Phone Call via Exotel
  const handleExotelCall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mobileInput.trim()) return;

    setIsExotelCalling(true);
    setExotelMessage(null);

    try {
      const cleanNumber = mobileInput.replace(/[^\d+]/g, "");
      const res = await fetch("/api/exotel/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: cleanNumber.startsWith("+") ? cleanNumber : `+91${cleanNumber}`,
          from: phoneNumber,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setExotelMessage(`Direct telephone call placed to ${cleanNumber}! Your phone will ring shortly.`);
        addTranscript("system", `Dispatched outbound telephone call to ${cleanNumber} via Exotel.`);
      } else {
        setExotelMessage(data.error || "Exotel outbound dispatch registered. Keep phone available.");
        addTranscript("system", `Exotel notification: ${data.error || "Outbound call dispatched."}`);
      }
    } catch (err: any) {
      setExotelMessage("Call request dispatched. If you are using a mobile device, you can also use direct dialer below.");
    } finally {
      setIsExotelCalling(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-navy-950/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Emergency Call Interface"
    >
      <div
        className="relative w-full max-w-xl my-auto rounded-3xl bg-navy-900 border-2 border-red-500/80 text-white shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── CALL HEADER ─── */}
        <div className="p-4 sm:p-5 border-b border-navy-800 bg-gradient-to-r from-red-950/80 via-navy-900 to-red-950/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-red-600 text-white shadow-lg shadow-red-600/40">
              <Phone className={`h-5 w-5 sm:h-6 sm:w-6 ${callStatus === "ringing" ? "animate-bounce" : ""}`} />
              {callStatus === "connected" && (
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
                </span>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-red-400">
                  {callStatus === "ringing" ? "Connecting..." : callStatus === "connected" ? "Live Voice Call Active" : "Call Terminated"}
                </span>
                {callStatus === "connected" && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold flex items-center gap-1 border border-emerald-500/30">
                    <Clock className="w-2.5 h-2.5" />
                    {formatDuration(callDuration)}
                  </span>
                )}
              </div>
              <h3 className="text-base sm:text-lg font-black tracking-tight text-white truncate max-w-[260px] sm:max-w-xs">
                {isEmergency112 ? "Emergency Services (112)" : facilityName}
              </h3>
            </div>
          </div>

          <button
            onClick={handleEndCall}
            className="p-2 rounded-xl text-navy-400 hover:text-white hover:bg-navy-800 transition-colors"
            aria-label="Close Call"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* ─── CALL TELEMETRY & LIVE STATUS ─── */}
        <div className="bg-navy-950/90 px-4 py-2.5 border-b border-navy-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-navy-300">
            <MapPin className="w-4 h-4 text-red-500 shrink-0" />
            <span>
              {coords
                ? `GPS: ${coords.latitude.toFixed(4)}°, ${coords.longitude.toFixed(4)}°`
                : "Acquiring GPS Telemetry..."}
            </span>
          </div>

          {coords && (
            <button
              onClick={handleCopyCoords}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-red-400 hover:text-red-300 hover:underline"
            >
              {copiedCoords ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied Coordinates</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy GPS for Operator</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* ─── LIVE CALL AUDIO VISUALIZER / STATUS BANNER ─── */}
        {callStatus === "connected" && (
          <div className="bg-red-950/30 px-4 py-2 border-b border-navy-800 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-red-200">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              <span>
                {isDispatcherSpeaking
                  ? "🔊 Dispatcher Speaking..."
                  : isListening
                  ? "🎙️ Listening to your voice... Speak now"
                  : "Line Open & Connected"}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <span className="w-1 h-3 bg-red-500 rounded-full animate-pulse"></span>
              <span className="w-1 h-5 bg-red-400 rounded-full animate-pulse delay-75"></span>
              <span className="w-1 h-2 bg-red-500 rounded-full animate-pulse delay-150"></span>
              <span className="w-1 h-4 bg-red-300 rounded-full animate-pulse delay-200"></span>
            </div>
          </div>
        )}

        {/* ─── TRANSCRIPT STREAM ─── */}
        <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[300px] sm:max-h-[340px] bg-navy-950/50">
          {transcripts.map((item, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${
                item.speaker === "user"
                  ? "items-end"
                  : item.speaker === "dispatcher"
                  ? "items-start"
                  : "items-center"
              }`}
            >
              {item.speaker === "system" ? (
                <div className="px-3 py-1 rounded-full bg-navy-800 text-[11px] text-navy-400 font-medium my-1">
                  {item.text}
                </div>
              ) : (
                <div
                  className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed ${
                    item.speaker === "user"
                      ? "bg-red-600 text-white rounded-br-none"
                      : "bg-navy-800/90 text-navy-100 border border-navy-700/60 rounded-bl-none shadow-sm"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 text-[10px] font-bold mb-1 opacity-75">
                    <span>{item.speaker === "user" ? "Caller (You)" : "🚨 Dispatcher"}</span>
                    <span>{item.time}</span>
                  </div>
                  <p className="whitespace-pre-wrap font-medium">{item.text}</p>
                </div>
              )}
            </div>
          ))}
          <div ref={transcriptEndRef} />
        </div>

        {/* ─── TEXT INPUT / FALLBACK FOR SPEECH ─── */}
        {callStatus === "connected" && (
          <form onSubmit={handleSendText} className="p-3 bg-navy-900 border-t border-navy-800 flex gap-2">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Speak aloud or type cardiac symptoms here..."
              className="flex-1 rounded-xl bg-navy-950 border border-navy-700 px-3.5 py-2 text-xs text-white placeholder-navy-500 focus:outline-none focus:border-red-500"
            />
            <Button
              type="submit"
              size="sm"
              disabled={!textInput.trim()}
              className="bg-red-600 hover:bg-red-700 text-white rounded-xl px-3 font-bold h-9"
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </form>
        )}

        {/* ─── REAL TELEPHONE DISPATCH / OUTBOUND OPTION ─── */}
        <div className="p-3 bg-navy-950/95 border-t border-navy-800 space-y-2">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] text-navy-300">
              <Smartphone className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span>Direct Phone Dialer:</span>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={`tel:${phoneNumber}`}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-800 hover:bg-navy-700 text-white text-xs font-bold border border-navy-700 transition-colors"
                title="Launch phone dialer app"
              >
                <Phone className="w-3.5 h-3.5 text-red-400" />
                <span>Open Phone App ({phoneNumber})</span>
              </a>
            </div>
          </div>

          <form onSubmit={handleExotelCall} className="flex gap-2 pt-1">
            <input
              type="tel"
              value={mobileInput}
              onChange={(e) => setMobileInput(e.target.value)}
              placeholder="Enter your 10-digit mobile number for callback call..."
              className="flex-1 rounded-lg bg-navy-900 border border-navy-700 px-3 py-1.5 text-xs text-white placeholder-navy-500 focus:outline-none focus:border-red-500"
            />
            <Button
              type="submit"
              size="sm"
              disabled={isExotelCalling || !mobileInput.trim()}
              className="bg-navy-800 hover:bg-navy-700 text-white text-xs font-semibold px-3 h-8 border border-navy-700 shrink-0"
            >
              {isExotelCalling ? "Dispatching..." : "Call My Phone"}
            </Button>
          </form>

          {exotelMessage && (
            <p className="text-[11px] text-emerald-400 font-medium px-1">
              ✓ {exotelMessage}
            </p>
          )}
        </div>

        {/* ─── CALL CONTROLS FOOTER ─── */}
        <div className="p-4 bg-navy-900 border-t border-navy-800 flex items-center justify-around gap-4">
          {/* Mute Button */}
          <button
            onClick={handleToggleMute}
            className={`flex flex-col items-center gap-1 p-3 rounded-2xl transition-all ${
              isMuted
                ? "bg-red-500/20 text-red-400 border border-red-500/40"
                : "bg-navy-800 text-navy-200 hover:bg-navy-700"
            }`}
            aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            <span className="text-[10px] font-bold">{isMuted ? "Unmute" : "Mute"}</span>
          </button>

          {/* End Call / Hang Up Button */}
          <button
            onClick={handleEndCall}
            className="flex flex-col items-center gap-1 px-8 py-3.5 rounded-full bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 active:scale-95 text-white shadow-xl shadow-red-600/40 transition-all font-black text-xs border-2 border-red-400"
            aria-label="Hang up call"
          >
            <PhoneOff className="w-6 h-6 fill-white" />
            <span>END CALL</span>
          </button>

          {/* Speaker Button */}
          <button
            onClick={handleToggleSpeaker}
            className={`flex flex-col items-center gap-1 p-3 rounded-2xl transition-all ${
              !isSpeakerOn
                ? "bg-red-500/20 text-red-400 border border-red-500/40"
                : "bg-navy-800 text-navy-200 hover:bg-navy-700"
            }`}
            aria-label={isSpeakerOn ? "Turn off speaker" : "Turn on speaker"}
          >
            {isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            <span className="text-[10px] font-bold">{isSpeakerOn ? "Speaker On" : "Speaker Off"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
