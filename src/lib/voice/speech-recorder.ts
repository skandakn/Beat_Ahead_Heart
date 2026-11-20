"use client";

/**
 * Robust Cross-Browser Speech Recorder
 * 
 * Works across all browsers (including Brave where Web Speech API is blocked):
 * 1. Web Speech API (Chrome/Edge fast live transcript).
 * 2. MediaRecorder + Web Audio VAD (Voice Activity Detection) + Groq Whisper STT.
 * 3. Manual Tap-to-Talk / Click-to-Send.
 */

export interface SpeechRecorderCallbacks {
  onTranscript: (text: string) => void;
  onListeningChange?: (isListening: boolean) => void;
  onTranscribingChange?: (isTranscribing: boolean) => void;
  onError?: (error: string) => void;
  onAudioLevel?: (level: number) => void; // 0.0 to 1.0
}

export class SpeechRecorder {
  private callbacks: SpeechRecorderCallbacks;
  private recognition: any = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioStream: MediaStream | null = null;
  private audioChunks: Blob[] = [];
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animFrameId: number | null = null;

  private isRunning = false;
  private isMediaRecorderMode = false;
  private hasSpoken = false;
  private silenceTimer: NodeJS.Timeout | null = null;
  private speechStartTime = 0;

  constructor(callbacks: SpeechRecorderCallbacks) {
    this.callbacks = callbacks;
  }

  public async start(): Promise<boolean> {
    this.stop();
    this.isRunning = true;
    this.callbacks.onListeningChange?.(true);

    // Try Web Speech API first (if supported and not in Brave)
    const isBrave =
      typeof window !== "undefined" &&
      ((navigator as any).brave && typeof (navigator as any).brave.isBrave === "function");

    const SpeechRecognitionClass =
      typeof window !== "undefined"
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;

    if (SpeechRecognitionClass && !isBrave) {
      try {
        const recognition = new SpeechRecognitionClass();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = "en-US";

        recognition.onstart = () => {
          this.callbacks.onListeningChange?.(true);
        };

        recognition.onresult = (event: any) => {
          const lastResult = event.results[event.results.length - 1];
          if (lastResult.isFinal) {
            const text = lastResult[0].transcript.trim();
            if (text.length > 0) {
              this.callbacks.onTranscript(text);
            }
          }
        };

        recognition.onerror = (e: any) => {
          console.warn("[SpeechRecorder] Web Speech API error:", e.error);
          // If Web Speech API fails (e.g. Brave shields, network, not-allowed), switch seamlessly to MediaRecorder
          if (this.isRunning) {
            this.startMediaRecorderFallback();
          }
        };

        recognition.onend = () => {
          if (this.isRunning && !this.isMediaRecorderMode) {
            try {
              recognition.start();
            } catch {}
          }
        };

        recognition.start();
        this.recognition = recognition;
        return true;
      } catch (err) {
        console.warn("[SpeechRecorder] Web Speech start failed, falling back to MediaRecorder:", err);
      }
    }

    // Direct MediaRecorder + Whisper
    return this.startMediaRecorderFallback();
  }

  private async startMediaRecorderFallback(): Promise<boolean> {
    this.isMediaRecorderMode = true;
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {}
      this.recognition = null;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      this.callbacks.onError?.("Microphone is not supported in this browser.");
      this.callbacks.onListeningChange?.(false);
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.audioStream = stream;
      this.audioChunks = [];
      this.hasSpoken = false;
      this.speechStartTime = Date.now();

      // Audio analysis for Voice Activity Detection (VAD)
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        try {
          const ctx = new AudioCtxClass();
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);

          this.audioCtx = ctx;
          this.analyser = analyser;
          this.startAudioMeter(analyser);
        } catch {}
      }

      // Check supported MIME types for recording
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      this.mediaRecorder = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        this.cleanupMeter();
        if (this.audioChunks.length > 0 && this.isRunning) {
          await this.transcribeAndEmit(mimeType || "audio/webm");
        }
      };

      recorder.start(250); // collect chunks every 250ms
      this.callbacks.onListeningChange?.(true);
      return true;
    } catch (err: any) {
      console.warn("[SpeechRecorder] getUserMedia error:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        this.callbacks.onError?.("Microphone permission denied. Please allow microphone in your address bar.");
      } else {
        this.callbacks.onError?.("Microphone unavailable: " + (err.message || "Unknown error"));
      }
      this.callbacks.onListeningChange?.(false);
      return false;
    }
  }

  private startAudioMeter(analyser: AnalyserNode) {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const checkVolume = () => {
      if (!this.isRunning || !this.isMediaRecorderMode) return;

      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length; // 0 to 255
      const normalized = Math.min(1.0, avg / 80); // 0.0 to 1.0

      this.callbacks.onAudioLevel?.(normalized);

      // Voice Activity Detection (VAD)
      const SPEECH_THRESHOLD = 0.12;
      const SILENCE_WAIT_MS = 1400; // wait 1.4s of silence after speech

      if (normalized > SPEECH_THRESHOLD) {
        this.hasSpoken = true;
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
        }
      } else if (this.hasSpoken) {
        // User spoke, and now it is quiet
        if (!this.silenceTimer) {
          this.silenceTimer = setTimeout(() => {
            console.log("[SpeechRecorder] Silence detected after speech, auto-submitting audio...");
            this.submitRecording();
          }, SILENCE_WAIT_MS);
        }
      }

      this.animFrameId = requestAnimationFrame(checkVolume);
    };

    this.animFrameId = requestAnimationFrame(checkVolume);
  }

  /**
   * Manually or automatically finishes recording and triggers Whisper STT
   */
  public submitRecording() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      try {
        this.mediaRecorder.stop();
      } catch {}
    }
  }

  private async transcribeAndEmit(mimeType: string) {
    if (this.audioChunks.length === 0) return;

    this.callbacks.onTranscribingChange?.(true);
    const audioBlob = new Blob(this.audioChunks, { type: mimeType });
    this.audioChunks = [];

    // Ensure we don't send empty 0-byte blobs
    if (audioBlob.size < 500) {
      this.callbacks.onTranscribingChange?.(false);
      // Restart recording for next utterance
      if (this.isRunning) {
        this.startMediaRecorderFallback();
      }
      return;
    }

    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "utterance.webm");

      const res = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.text && data.text.trim().length > 0) {
        console.log("[SpeechRecorder] Groq Whisper transcribed:", data.text);
        this.callbacks.onTranscript(data.text.trim());
      }
    } catch (err: any) {
      console.warn("[SpeechRecorder] Transcription error:", err);
    } finally {
      this.callbacks.onTranscribingChange?.(false);
      // If still connected, restart listening for the next response
      if (this.isRunning) {
        setTimeout(() => {
          if (this.isRunning) {
            this.startMediaRecorderFallback();
          }
        }, 300);
      }
    }
  }

  public stop() {
    this.isRunning = false;
    this.isMediaRecorderMode = false;
    this.hasSpoken = false;

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    this.cleanupMeter();

    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {}
      this.recognition = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      try {
        this.mediaRecorder.stop();
      } catch {}
      this.mediaRecorder = null;
    }

    if (this.audioStream) {
      this.audioStream.getTracks().forEach((track) => track.stop());
      this.audioStream = null;
    }

    this.audioChunks = [];
    this.callbacks.onListeningChange?.(false);
    this.callbacks.onTranscribingChange?.(false);
    this.callbacks.onAudioLevel?.(0);
  }

  private cleanupMeter() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.audioCtx && this.audioCtx.state !== "closed") {
      try {
        this.audioCtx.close();
      } catch {}
      this.audioCtx = null;
    }
    this.analyser = null;
  }
}
