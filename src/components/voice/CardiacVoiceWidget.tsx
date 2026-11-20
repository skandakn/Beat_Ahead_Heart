'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useI18n } from "@/lib/i18n/I18nProvider";
import {
  PhoneCall,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  AlertTriangle,
  HeartPulse,
  Activity,
  CheckCircle2,
  Sparkles,
  X,
  Send,
  ShieldAlert,
  Clock,
  Radio,
  ExternalLink,
  Pause,
  Play,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { filterAcousticEcho } from '@/core/utils/echo-filter';
import { extractCardiacFindings } from '@/core/extraction/deterministic-extractor';
import { cn } from '@/lib/utils';
import { unlockAudioContext, playVoiceAudio } from '@/lib/voice/audio-player';
import { SpeechRecorder } from '@/lib/voice/speech-recorder';

interface SymptomState {
  value: any;
  status?: string;
  confidence?: number;
}

const DEFAULT_CARDIAC_GREETING =
  "Hello, this is the BeatAhead Cardiac Care Helpline. I'm here with you. Are you or someone near you experiencing chest discomfort, breathlessness, or unusual heart symptoms?";

export function CardiacVoiceWidget() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isAudioPaused, setIsAudioPaused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [micAudioLevel, setMicAudioLevel] = useState(0);
  const [callId, setCallId] = useState<string>('');
  const callIdRef = useRef<string>('');
  const [callDuration, setCallDuration] = useState(0);
  const [textInput, setTextInput] = useState('');
  const [transcripts, setTranscripts] = useState<
    { speaker: 'patient' | 'assistant' | 'system'; text: string; time: string }[]
  >([]);
  const [extractedData, setExtractedData] = useState<Record<string, SymptomState>>({});
  const [statusMessage, setStatusMessage] = useState('24/7 AI Cardiac Emergency Triage');
  const [urgencyBadge, setUrgencyBadge] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  // Audio & Speech References
  const speechRecorderRef = useRef<SpeechRecorder | null>(null);
  const cancelAudioRef = useRef<(() => void) | null>(null);
  const isPlayingRef = useRef(false);
  const isAudioPausedRef = useRef(false);
  const lastAssistantTextRef = useRef<string>(DEFAULT_CARDIAC_GREETING);
  const lastAudioEndTimeRef = useRef<number>(0);
  const recentAssistantTextsRef = useRef<string[]>([
    'Hello, this is the BeatAhead Cardiac Care Helpline. I am here with you. Are you or someone near you experiencing chest discomfort, breathlessness, or unusual heart symptoms?',
    'BeatAhead Cardiac Care Helpline',
  ]);
  const isConnectedRef = useRef(false);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  // Duration timer
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isConnected) {
      timer = setInterval(() => setCallDuration((prev) => prev + 1), 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(timer);
  }, [isConnected]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const unlockAudio = useCallback(() => {
    unlockAudioContext();
  }, []);

  const stopCurrentAudio = useCallback(() => {
    if (cancelAudioRef.current) {
      cancelAudioRef.current();
      cancelAudioRef.current = null;
    }
    isPlayingRef.current = false;
    isAudioPausedRef.current = false;
    setIsSpeaking(false);
    setIsAudioPaused(false);
  }, []);

  const toggleAudioPause = useCallback(() => {
    stopCurrentAudio();
    if (isConnectedRef.current) {
      setTimeout(() => {
        speechRecorderRef.current?.start();
      }, 200);
    }
  }, [stopCurrentAudio]);

  const playAssistantAudio = useCallback(
    (audioBase64: string | null | undefined, text: string) => {
      stopCurrentAudio();
      unlockAudioContext();

      isPlayingRef.current = true;
      setIsSpeaking(true);
      // Temporarily pause speech recorder so it doesn't transcribe assistant's speaker output
      speechRecorderRef.current?.stop();

      const cancel = playVoiceAudio(audioBase64 || '', {
        fallbackText: text,
        onStarted: () => {
          isPlayingRef.current = true;
          setIsSpeaking(true);
        },
        onEnded: () => {
          isPlayingRef.current = false;
          setIsSpeaking(false);
          lastAudioEndTimeRef.current = Date.now();
          if (isConnectedRef.current) {
            setTimeout(() => {
              if (isConnectedRef.current && !isPlayingRef.current) {
                speechRecorderRef.current?.start();
              }
            }, 400);
          }
        },
        onError: (err) => {
          console.warn('[Widget] Audio playback error:', err);
          isPlayingRef.current = false;
          setIsSpeaking(false);
          if (isConnectedRef.current) {
            speechRecorderRef.current?.start();
          }
        },
      });

      cancelAudioRef.current = cancel;
    },
    [stopCurrentAudio]
  );

  // Send turn to Voice Agent backend
  const sendPatientUtterance = useCallback(
    async (message: string, currentCallId?: string) => {
      const activeCallId = currentCallId || callIdRef.current || callId || `cardiac_browser_${Date.now()}`;
      callIdRef.current = activeCallId;
      if (!message || message.trim().length === 0) return;

      const trimmed = message.trim();

      // Acoustic echo validation
      const echoCheck = filterAcousticEcho(trimmed, recentAssistantTextsRef.current);
      if (echoCheck.isFullEcho) {
        console.log('[Widget Echo Filter] Dropped assistant speaker echo:', trimmed);
        return;
      }

      const cleanText = echoCheck.isPartialEcho ? echoCheck.cleanedText : trimmed;
      if (!cleanText || cleanText.length < 2) return;

      // Stop any lingering audio immediately upon user speaking
      unlockAudioContext();
      stopCurrentAudio();

      // 0ms instant client-side deterministic symptom extraction
      const instant = extractCardiacFindings(cleanText, extractedData);
      if (Object.keys(instant).length > 0) {
        setExtractedData((prev) => ({ ...prev, ...instant }));
        const urg = instant.urgency_level?.value;
        if (urg === 'CRITICAL_EMERGENCY' || String(urg).toLowerCase().includes('critical')) {
          setUrgencyBadge('CRITICAL EMERGENCY');
        } else if (urg === 'HIGH_RISK_URGENT' || String(urg).toLowerCase().includes('high')) {
          setUrgencyBadge('HIGH RISK');
        }
      }

      setTranscripts((prev) => [
        ...prev,
        {
          speaker: 'patient',
          text: cleanText,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);

      setIsThinking(true);
      setStatusMessage('Analyzing cardiac indicators & protocol...');

      try {
        const res = await fetch('/api/voice/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'utterance',
            callId: activeCallId,
            message: cleanText,
          }),
        });

        const data = await res.json();
        setIsThinking(false);

        if (data.success) {
          setStatusMessage('Triage Line Connected • Active');

          if (data.responseText) {
            recentAssistantTextsRef.current.push(data.responseText);
            lastAssistantTextRef.current = data.responseText;
          }

          setTranscripts((prev) => [
            ...prev,
            {
              speaker: 'assistant',
              text: data.responseText,
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ]);

          playAssistantAudio(data.audioBase64, data.responseText);

          if (data.structuredData) {
            setExtractedData((prev) => ({
              ...prev,
              ...data.structuredData,
            }));

            const urgency = data.structuredData.urgency_level?.value;
            if (urgency === 'CRITICAL_EMERGENCY' || String(urgency).toLowerCase().includes('critical')) {
              setUrgencyBadge('CRITICAL EMERGENCY');
            } else if (urgency === 'HIGH_RISK_URGENT' || String(urgency).toLowerCase().includes('high')) {
              setUrgencyBadge('HIGH RISK');
            }
          }
        }
      } catch (err: any) {
        setIsThinking(false);
        console.error('Turn processing error:', err);
        setStatusMessage('Error processing turn: ' + err.message);
      }
    },
    [callId, extractedData, playAssistantAudio, stopCurrentAudio]
  );

  // Start call session
  const startCall = useCallback(async () => {
    try {
      unlockAudioContext();
      stopCurrentAudio();
      const newCallId = `cardiac_browser_${Date.now()}`;
      callIdRef.current = newCallId;
      setCallId(newCallId);
      setIsConnected(true);
      isConnectedRef.current = true;
      setStatusMessage('Triage Line Connected • Listening');

      setTranscripts((prev) => {
        if (prev.length > 0) return prev;
        return [
          {
            speaker: 'assistant',
            text: DEFAULT_CARDIAC_GREETING,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ];
      });

      lastAssistantTextRef.current = DEFAULT_CARDIAC_GREETING;
      playAssistantAudio(null, DEFAULT_CARDIAC_GREETING);

      if (!speechRecorderRef.current) {
        speechRecorderRef.current = new SpeechRecorder({
          onTranscript: (userText) => {
            sendPatientUtterance(userText, newCallId);
          },
          onListeningChange: (listening) => {
            setIsListening(listening);
          },
          onTranscribingChange: (transcribing) => {
            setIsTranscribing(transcribing);
            if (transcribing) {
              setStatusMessage('Transcribing speech with Groq Whisper...');
            }
          },
          onError: (err) => {
            setMicError(err);
          },
          onAudioLevel: (lvl) => {
            setMicAudioLevel(lvl);
          },
        });
      }

      fetch('/api/voice/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          callId: newCallId,
          callerId: 'Patient (Browser Session)',
        }),
      }).catch(() => {});

      return newCallId;
    } catch (err: any) {
      console.error('Failed to start call:', err);
      setStatusMessage('Connection failed: ' + err.message);
    }
  }, [playAssistantAudio, sendPatientUtterance, stopCurrentAudio]);

  // End call session
  const endCall = useCallback(async () => {
    stopCurrentAudio();
    if (speechRecorderRef.current) {
      speechRecorderRef.current.stop();
    }
    if (callId) {
      try {
        await fetch('/api/voice/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'end', callId }),
        });
      } catch (err) {
        console.error('Error ending call:', err);
      }
    }
    setIsConnected(false);
    isConnectedRef.current = false;
    setIsListening(false);
    setIsSpeaking(false);
    setStatusMessage('Call finalized • Summary archived');
  }, [callId, stopCurrentAudio]);

  // Manual toggle to start/pause microphone
  const toggleMicrophone = useCallback(async () => {
    setMicError(null);
    unlockAudioContext();

    if (!isConnectedRef.current) {
      await startCall();
      return;
    }

    if (isListening) {
      if (speechRecorderRef.current) {
        speechRecorderRef.current.submitRecording();
      }
      setIsListening(false);
    } else {
      stopCurrentAudio();
      if (!speechRecorderRef.current) {
        speechRecorderRef.current = new SpeechRecorder({
          onTranscript: (userText) => {
            sendPatientUtterance(userText);
          },
          onListeningChange: (listening) => {
            setIsListening(listening);
          },
          onTranscribingChange: (transcribing) => {
            setIsTranscribing(transcribing);
          },
          onError: (err) => {
            setMicError(err);
          },
          onAudioLevel: (lvl) => {
            setMicAudioLevel(lvl);
          },
        });
      }
      speechRecorderRef.current.start();
    }
  }, [isListening, sendPatientUtterance, startCall, stopCurrentAudio]);

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    const msg = textInput.trim();
    setTextInput('');

    if (!isConnectedRef.current) {
      startCall().then((newId) => {
        setTimeout(() => sendPatientUtterance(msg, newId), 300);
      });
    } else {
      sendPatientUtterance(msg, callIdRef.current);
    }
  };

  // Determine if any structured clinical findings exist
  const hasAnyFindings = Object.values(extractedData).some(
    (field) => field && field.value !== null && field.value !== undefined && field.value !== ''
  );

  // Hide on sign-in and sign-up pages — helpline is only available after login
  if (pathname?.startsWith('/sign-in') || pathname?.startsWith('/sign-up')) {
    return null;
  }

  return (
    <>
      {/* Floating Trigger Button */}
      {!isOpen && (
        <div className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-40 flex items-center gap-3">
          <button
            onClick={() => {
              unlockAudio();
              setIsOpen(true);
              if (!isConnectedRef.current) {
                startCall();
              }
            }}
            aria-label="Open 24/7 Beat Ahead Assistant"
            className="group relative flex items-center gap-2.5 sm:gap-3 rounded-full bg-gradient-to-r from-red-600 via-rose-600 to-red-700 px-3.5 py-2.5 sm:px-5 sm:py-3.5 text-white shadow-2xl shadow-red-600/40 transition-all duration-300 hover:scale-105 hover:shadow-red-600/60 focus:outline-none focus:ring-4 focus:ring-red-500/30"
          >
            <span className="absolute -inset-1 rounded-full bg-red-500/30 opacity-75 blur-sm animate-pulse group-hover:opacity-100" />
            <div className="relative flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-white/20">
              <HeartPulse className="h-4 w-4 sm:h-5 sm:w-5 text-white animate-pulse" />
            </div>
            <div className="relative text-left hidden sm:block">
              <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-red-100">
                24/7 Beat Ahead
              </p>
              <p className="text-xs sm:text-sm font-extrabold tracking-tight">Assistant</p>
            </div>
            <div className="relative text-left sm:hidden">
              <p className="text-xs font-extrabold tracking-tight">AI Triage</p>
            </div>
            <div className="relative ml-0.5 sm:ml-1 flex h-2.5 w-2.5 sm:h-3 sm:w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 sm:h-3 sm:w-3 bg-emerald-500"></span>
            </div>
          </button>
        </div>
      )}

      {/* Floating Modal / Widget Window */}
      {isOpen && (
        <div className="fixed inset-x-2 bottom-20 top-16 sm:top-auto sm:inset-x-auto sm:bottom-6 sm:right-6 z-50 flex sm:h-[620px] sm:w-[420px] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-2xl border border-red-500/30 bg-slate-950/95 text-slate-100 shadow-2xl shadow-red-950/50 backdrop-blur-xl transition-all">
          {/* Header */}
          <div className="relative border-b border-slate-800 bg-gradient-to-r from-slate-900 via-red-950/40 to-slate-900 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-600/20 border border-red-500/30 text-red-400">
                  <HeartPulse className="h-5 w-5 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-white">24/7 Beat Ahead Assistant</h2>
                    {isConnected && (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                        {formatTime(callDuration)}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">Groq Whisper • Gemini • ElevenLabs</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {/* Pause / Resume audio button — only visible while assistant is speaking */}
                {isSpeaking && (
                  <button
                    onClick={toggleAudioPause}
                    title={isAudioPaused ? 'Resume audio' : 'Pause audio'}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-amber-400 transition-colors"
                  >
                    {isAudioPaused
                      ? <Play className="h-4 w-4" />
                      : <Pause className="h-4 w-4" />}
                  </button>
                )}
                <Link
                  href="/helpline"
                  title="Open Full Screen Helpline"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                </Link>
                <button
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Urgency Alert Bar if triggered */}
            {urgencyBadge && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-600/20 border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-300 animate-pulse">
                <ShieldAlert className="h-4 w-4 text-red-400 shrink-0" />
                <span>TRIAGE ALERT: {urgencyBadge} — EMS Protocol Active</span>
              </div>
            )}
          </div>

          {/* Extracted Symptom Ticker */}
          <div className="border-b border-slate-800 bg-slate-900/80 px-3.5 py-2.5">
            <div className="flex items-center justify-between text-[11px] text-slate-300 mb-1.5 font-semibold">
              <span className="flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-red-500 animate-pulse" /> Extracted Clinical Findings:
              </span>
              {extractedData.urgency_level?.value && (
                <span className="rounded bg-red-600/30 border border-red-500/40 px-2 py-0.5 text-[10px] font-extrabold text-red-300 tracking-wide uppercase">
                  {String(extractedData.urgency_level.value).replace(/_/g, ' ')}
                </span>
              )}
            </div>
            {hasAnyFindings ? (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {extractedData.primary_symptom?.value && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-red-600/25 px-2.5 py-1 text-[11px] font-bold text-red-200 border border-red-500/40 shadow-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                    Symptom: {String(extractedData.primary_symptom.value).replace(/_/g, ' ')}
                  </span>
                )}
                {extractedData.pain_severity_scale?.value && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/20 px-2.5 py-1 text-[11px] font-bold text-amber-300 border border-amber-500/40 shadow-sm">
                    Pain: {extractedData.pain_severity_scale.value}/10
                  </span>
                )}
                {extractedData.symptom_onset_minutes?.value && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-500/20 px-2.5 py-1 text-[11px] font-semibold text-blue-300 border border-blue-500/40 shadow-sm">
                    <Clock className="h-3 w-3" /> Onset: {extractedData.symptom_onset_minutes.value}m
                  </span>
                )}
                {extractedData.patient_age?.value && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-200 border border-slate-700">
                    Age: {extractedData.patient_age.value}y
                  </span>
                )}
                {extractedData.prior_cardiac_history?.value && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-purple-500/20 px-2.5 py-1 text-[11px] font-semibold text-purple-300 border border-purple-500/40">
                    History: {String(extractedData.prior_cardiac_history.value)}
                  </span>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 font-medium italic flex items-center gap-1.5 mt-1">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400/80 animate-ping" />
                {isConnected
                  ? 'Listening for acute chest pain, pain scale (1-10), and duration...'
                  : 'Start call to begin clinical symptom extraction.'}
              </p>
            )}
          </div>

          {/* Transcript Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {transcripts.length === 0 && !isConnected && (
              <div className="flex h-full flex-col items-center justify-center text-center px-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-600/10 border border-red-500/20 text-red-400 mb-3 shadow-inner">
                  <PhoneCall className="h-8 w-8 animate-pulse" />
                </div>
                <h3 className="text-sm font-semibold text-white">{t("agent.emergencyCardiacAIHelpline")}</h3>
                <p className="mt-1 text-xs text-slate-400 leading-relaxed max-w-[260px]">
                  Immediate vocal triage for acute chest discomfort, radiating pain, breathlessness, or elevated Ischemic Stress Index (ISI).
                </p>
                <div className="mt-4 flex flex-col gap-2 w-full max-w-[240px]">
                  <button
                    onClick={startCall}
                    className="flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-500 py-2.5 px-4 text-xs font-bold text-white shadow-lg shadow-red-600/30 transition-all hover:scale-102"
                  >
                    <PhoneCall className="h-4 w-4" /> Start Live Voice Call
                  </button>
                  <Link
                    href="/helpline"
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 py-2 px-3 text-[11px] font-medium text-slate-300 hover:bg-slate-800 transition-colors"
                  >
                    Open Full Screen Helpline →
                  </Link>
                </div>
              </div>
            )}

            {transcripts.map((msg, i) => (
              <div
                key={i}
                className={`flex flex-col ${
                  msg.speaker === 'patient' ? 'items-end' : 'items-start'
                }`}
              >
                <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-1 px-1">
                  <span>{msg.speaker === 'patient' ? 'You' : 'BeatAhead Triage AI'}</span>
                  <span>•</span>
                  <span>{msg.time}</span>
                </div>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm ${
                    msg.speaker === 'patient'
                      ? 'bg-red-600 text-white rounded-tr-none'
                      : 'bg-slate-800/95 border border-slate-700/60 text-slate-200 rounded-tl-none'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}

            {isThinking && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded-xl px-3 py-2 w-fit">
                <Sparkles className="h-3.5 w-3.5 animate-spin" />
                <span>Evaluating cardiac protocols...</span>
              </div>
            )}
            <div ref={transcriptEndRef} />
          </div>

          {/* Waveform / Voice Activity Bar */}
          {isConnected && (
            <div className="flex items-center justify-between border-t border-slate-800 bg-slate-900/80 px-4 py-2 text-xs">
              <div className="flex items-center gap-2">
                {isSpeaking ? (
                  <span className="flex items-center gap-1.5 text-emerald-400 font-semibold animate-pulse">
                    <Volume2 className="h-3.5 w-3.5" /> Speaking (Voice Output Active)
                  </span>
                ) : isTranscribing ? (
                  <span className="flex items-center gap-1.5 text-sky-400 font-semibold animate-pulse">
                    <Sparkles className="h-3.5 w-3.5 animate-spin" /> Transcribing with Groq Whisper...
                  </span>
                ) : isListening ? (
                  <span className="flex items-center gap-1.5 text-amber-400 font-semibold">
                    <Mic className="h-3.5 w-3.5 animate-pulse text-red-400" />
                    <span>Listening... {micAudioLevel > 0.05 ? '(Voice detected)' : '(Speak now)'}</span>
                  </span>
                ) : isThinking ? (
                  <span className="flex items-center gap-1.5 text-blue-400 font-semibold animate-pulse">
                    <HeartPulse className="h-3.5 w-3.5 animate-bounce" /> Clinical Triage Brain thinking...
                  </span>
                ) : (
                  <span className="text-slate-400 flex items-center gap-1">
                    <Radio className="h-3 w-3" /> Standby
                  </span>
                )}
              </div>
              <button
                onClick={endCall}
                className="flex items-center gap-1 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 px-2.5 py-1 text-[11px] font-bold text-red-300 transition-colors"
              >
                <PhoneOff className="h-3 w-3" /> End Call
              </button>
            </div>
          )}

          {/* Mic Error Banner if any */}
          {micError && (
            <div className="bg-amber-950/80 border-t border-amber-600/40 px-3 py-1.5 text-[11px] text-amber-300 flex items-center justify-between gap-2">
              <span className="truncate">{micError}</span>
              <button
                type="button"
                onClick={() => setMicError(null)}
                className="text-amber-400 hover:text-white shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Text Input / Mic / Send Footer */}
          <form
            onSubmit={handleTextSubmit}
            className="border-t border-slate-800 bg-slate-950 p-3 flex items-center gap-2"
          >
            {/* Direct Microphone Button */}
            <button
              type="button"
              onClick={toggleMicrophone}
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all shadow-xs border",
                isListening
                  ? "bg-red-600 text-white border-red-500 animate-pulse ring-2 ring-red-400"
                  : isTranscribing
                  ? "bg-sky-600 text-white border-sky-500 animate-pulse"
                  : isConnected
                  ? "bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700 hover:text-white"
                  : "bg-red-600/20 text-red-400 border-red-500/30 hover:bg-red-600 hover:text-white"
              )}
              title={
                isListening
                  ? "Microphone is recording (click to send speech now)"
                  : isConnected
                  ? "Click to speak into microphone"
                  : "Click to start live voice triage"
              }
            >
              {isListening ? (
                <Mic className="h-4 w-4 text-white animate-pulse" />
              ) : isTranscribing ? (
                <Sparkles className="h-4 w-4 text-white animate-spin" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </button>
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder={
                isTranscribing
                  ? 'Transcribing your speech with Groq Whisper...'
                  : isListening
                  ? '🎙️ Listening... speak now or click 🎙️ to send'
                  : 'Speak into microphone or type symptoms...'
              }
              className="flex-1 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
            <button
              type="submit"
              disabled={!textInput.trim() || isThinking}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-600 text-white hover:bg-red-500 disabled:opacity-40 disabled:hover:bg-red-600 transition-all"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
