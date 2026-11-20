"use client";

/**
 * Robust Cross-Browser Audio Player
 * 
 * Solves autoplay restrictions across Chrome, Brave, Safari, Edge and Firefox:
 * 1. Web Audio API with pre-unlocked AudioContext (bypasses transient activation timeouts).
 * 2. HTML5 Audio fallback with Blob URLs.
 * 3. Browser SpeechSynthesis fallback when audio decoding/playback fails.
 */

let sharedAudioCtx: AudioContext | null = null;
let unlockedAudioEl: HTMLAudioElement | null = null;

/**
 * Must be called inside a user gesture (click, tap, keypress).
 * Unlocks both the Web Audio AudioContext and HTML5 Audio element.
 */
export function unlockAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  try {
    if (!sharedAudioCtx) {
      const AudioCtxClass =
        window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        sharedAudioCtx = new AudioCtxClass();
      }
    }

    if (sharedAudioCtx && sharedAudioCtx.state === "suspended") {
      sharedAudioCtx.resume().catch(() => {});
    }

    // Warm up an HTMLAudioElement with an inaudible 10ms WAV
    if (!unlockedAudioEl) {
      unlockedAudioEl = new Audio(
        "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA=="
      );
    }
    unlockedAudioEl.play().catch(() => {});

    // Resume SpeechSynthesis
    if (window.speechSynthesis && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  } catch (err) {
    console.warn("[AudioPlayer] unlockAudioContext warning:", err);
  }

  return sharedAudioCtx;
}

/**
 * Converts a Base64 string to an ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  // Strip any data URI prefix if present
  const clean = base64.replace(/^data:audio\/[^;]+;base64,/, "");
  const binaryString = atob(clean);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export interface PlayAudioOptions {
  onEnded?: () => void;
  onError?: (error: any) => void;
  onStarted?: () => void;
  fallbackText?: string;
}

/**
 * Plays Base64 MP3/WAV audio using Web Audio API first, then HTMLAudioElement,
 * and finally falls back to SpeechSynthesis if playback fails.
 * Returns a cancel/stop function.
 */
export function playVoiceAudio(
  base64Audio: string,
  options: PlayAudioOptions = {}
): () => void {
  if (typeof window === "undefined") return () => {};

  let isCancelled = false;
  let currentSourceNode: AudioBufferSourceNode | null = null;
  let currentAudioEl: HTMLAudioElement | null = null;
  let cancelSpeech: (() => void) | null = null;

  const stopAll = () => {
    isCancelled = true;
    if (currentSourceNode) {
      try {
        currentSourceNode.stop();
        currentSourceNode.disconnect();
      } catch {}
      currentSourceNode = null;
    }
    if (currentAudioEl) {
      try {
        currentAudioEl.pause();
        currentAudioEl.currentTime = 0;
      } catch {}
      currentAudioEl = null;
    }
    if (cancelSpeech) {
      cancelSpeech();
      cancelSpeech = null;
    }
  };

  const handleFallback = () => {
    if (isCancelled) return;
    if (options.fallbackText && typeof window !== "undefined" && window.speechSynthesis) {
      console.log("[AudioPlayer] Falling back to SpeechSynthesis");
      cancelSpeech = speakTextFallback(options.fallbackText, {
        onEnded: options.onEnded,
        onError: options.onError,
        onStarted: options.onStarted,
      });
    } else {
      options.onError?.(new Error("Audio playback failed and no fallback text provided"));
    }
  };

  // Attempt 1: Web Audio API (Immune to transient gesture expiry if unlocked)
  try {
    const ctx = unlockAudioContext();
    if (ctx && ctx.state !== "closed") {
      const buffer = base64ToArrayBuffer(base64Audio);

      ctx.decodeAudioData(
        buffer.slice(0),
        (audioBuffer) => {
          if (isCancelled) return;
          try {
            if (ctx.state === "suspended") {
              ctx.resume().catch(() => {});
            }
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ctx.destination);

            source.onended = () => {
              if (!isCancelled) {
                options.onEnded?.();
              }
            };

            currentSourceNode = source;
            source.start(0);
            options.onStarted?.();
          } catch (playErr) {
            console.warn("[AudioPlayer] Web Audio start error:", playErr);
            playWithHtmlAudio();
          }
        },
        (decodeErr) => {
          console.warn("[AudioPlayer] Web Audio decode error:", decodeErr);
          playWithHtmlAudio();
        }
      );
      return stopAll;
    }
  } catch (err) {
    console.warn("[AudioPlayer] Web Audio context error:", err);
  }

  // Attempt 2: HTML5 Audio with Blob URL
  function playWithHtmlAudio() {
    if (isCancelled) return;
    try {
      const buffer = base64ToArrayBuffer(base64Audio);
      const blob = new Blob([buffer], { type: "audio/mpeg" });
      const blobUrl = URL.createObjectURL(blob);
      const audio = new Audio(blobUrl);
      currentAudioEl = audio;

      audio.onended = () => {
        URL.revokeObjectURL(blobUrl);
        if (!isCancelled) {
          options.onEnded?.();
        }
      };

      audio.onerror = (e) => {
        URL.revokeObjectURL(blobUrl);
        console.warn("[AudioPlayer] HTML5 Audio error:", e);
        handleFallback();
      };

      audio
        .play()
        .then(() => {
          if (!isCancelled) {
            options.onStarted?.();
          }
        })
        .catch((playErr) => {
          URL.revokeObjectURL(blobUrl);
          console.warn("[AudioPlayer] HTML5 Audio play() rejected:", playErr);
          handleFallback();
        });
    } catch (blobErr) {
      console.warn("[AudioPlayer] Blob creation error:", blobErr);
      handleFallback();
    }
  }

  playWithHtmlAudio();
  return stopAll;
}

/**
 * Robust SpeechSynthesis utterance speaker
 */
export function speakTextFallback(
  text: string,
  options: PlayAudioOptions = {}
): () => void {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    options.onError?.(new Error("SpeechSynthesis not supported"));
    return () => {};
  }

  let isCancelled = false;

  try {
    window.speechSynthesis.resume();
  } catch {}

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  const voices = window.speechSynthesis.getVoices();
  const preferredVoice =
    voices.find(
      (v) =>
        v.lang.startsWith("en") &&
        (v.name.includes("Google") ||
          v.name.includes("Natural") ||
          v.name.includes("Samantha") ||
          v.name.includes("Female"))
    ) || voices.find((v) => v.lang.startsWith("en"));

  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  const watchdogTimeout = setTimeout(() => {
    if (!isCancelled && window.speechSynthesis.speaking) {
      console.log("[AudioPlayer] SpeechSynthesis watchdog trigger");
      try {
        window.speechSynthesis.cancel();
      } catch {}
      options.onEnded?.();
    }
  }, Math.max(4000, text.length * 80));

  utterance.onstart = () => {
    if (!isCancelled) {
      options.onStarted?.();
    }
  };

  utterance.onend = () => {
    clearTimeout(watchdogTimeout);
    if (!isCancelled) {
      options.onEnded?.();
    }
  };

  utterance.onerror = (err) => {
    clearTimeout(watchdogTimeout);
    console.warn("[AudioPlayer] SpeechSynthesis utterance error:", err);
    if (!isCancelled) {
      options.onEnded?.(); // Treat error as ended so UI never freezes
    }
  };

  try {
    window.speechSynthesis.speak(utterance);
  } catch (speakErr) {
    console.warn("[AudioPlayer] window.speechSynthesis.speak error:", speakErr);
    options.onError?.(speakErr);
  }

  return () => {
    isCancelled = true;
    clearTimeout(watchdogTimeout);
    try {
      window.speechSynthesis.cancel();
    } catch {}
  };
}
