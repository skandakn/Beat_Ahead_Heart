"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export interface UseVoiceInputOptions {
  onTranscript?: (text: string) => void;
  lang?: string;
}

export function useVoiceInput(options: UseVoiceInputOptions = {}) {
  const { onTranscript, lang = "en-US" } = options;

  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isListeningRef = useRef(false);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
          mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
        } catch {}
      }
    };
  }, []);

  // MediaRecorder + Groq Whisper Fallback
  const startMediaRecorderFallback = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("Microphone is not supported in this browser.");
      setIsListening(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        if (audioChunksRef.current.length > 0) {
          setIsTranscribing(true);
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          audioChunksRef.current = [];

          try {
            const formData = new FormData();
            formData.append("file", audioBlob, "speech.webm");
            const res = await fetch("/api/voice/transcribe", {
              method: "POST",
              body: formData,
            });

            if (!res.ok) {
              throw new Error("Transcription server error");
            }

            const data = await res.json();
            if (data.text && data.text.trim().length > 0) {
              onTranscript?.(data.text.trim());
              setErrorMessage(null);
            }
          } catch (err: any) {
            console.warn("Groq Whisper transcription failed:", err);
            setErrorMessage("Could not transcribe speech. Please try again.");
          } finally {
            setIsTranscribing(false);
          }
        }
      };

      recorder.start();
      setIsListening(true);
      setErrorMessage(null);
    } catch (err: any) {
      console.warn("MediaRecorder mic access error:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setErrorMessage("Microphone access was denied. Please allow microphone in your browser.");
      } else {
        setErrorMessage("Microphone unavailable. Please check your audio input.");
      }
      setIsListening(false);
    }
  }, [onTranscript]);

  const startListening = useCallback(() => {
    setErrorMessage(null);

    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      try {
        if (recognitionRef.current) {
          try {
            recognitionRef.current.abort();
          } catch {}
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = lang;

        recognition.onstart = () => {
          setIsListening(true);
          setErrorMessage(null);
        };

        recognition.onresult = (event: any) => {
          const last = event.results[event.results.length - 1];
          if (last.isFinal) {
            const text = last[0].transcript.trim();
            if (text.length > 0) {
              onTranscript?.(text);
            }
          }
        };

        recognition.onerror = (e: any) => {
          console.warn("Web Speech API error:", e.error);
          if (e.error === "not-allowed" || e.error === "service-not-allowed") {
            setErrorMessage("Microphone access was denied. Please allow microphone in your browser.");
            setIsListening(false);
          } else if (e.error === "network") {
            // Web Speech API network error -> fallback to Groq Whisper MediaRecorder
            console.log("Falling back to MediaRecorder + Groq Whisper...");
            startMediaRecorderFallback();
          } else if (e.error !== "no-speech" && e.error !== "aborted") {
            setErrorMessage("Speech recognition encountered an issue. Try again.");
            setIsListening(false);
          } else {
            setIsListening(false);
          }
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognition.start();
        recognitionRef.current = recognition;
        return;
      } catch (err) {
        console.warn("Error starting Web Speech API, falling back:", err);
        startMediaRecorderFallback();
        return;
      }
    }

    // No SpeechRecognition support in browser -> fallback to MediaRecorder
    startMediaRecorderFallback();
  }, [lang, onTranscript, startMediaRecorderFallback]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    setIsListening(false);
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  return {
    isListening,
    isTranscribing,
    errorMessage,
    clearError: () => setErrorMessage(null),
    startListening,
    stopListening,
    toggleListening,
  };
}
