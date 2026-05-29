'use client';

/**
 * Tiny WebAudio-based notification cue. We don't ship an MP3 to keep the
 * bundle lean; a two-note arpeggio synthesized in real time is enough for an
 * incoming invite. Respects `prefers-reduced-motion` and the user's `muted`
 * preference.
 */
import { usePrefs } from './store';

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

function shouldPlay(): boolean {
  if (typeof window === 'undefined') return false;
  const { muted, reducedMotion } = usePrefs.getState();
  if (muted || reducedMotion) return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  return true;
}

export function playInviteCue(): void {
  if (!shouldPlay()) return;
  const ac = getContext();
  if (!ac) return;
  // Resume the context if it was suspended (autoplay policies).
  if (ac.state === 'suspended') {
    ac.resume().catch(() => {});
  }
  const now = ac.currentTime;
  const tones = [
    { freq: 880, start: 0, dur: 0.12 },
    { freq: 1318, start: 0.1, dur: 0.16 },
  ];
  for (const tone of tones) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = tone.freq;
    gain.gain.setValueAtTime(0, now + tone.start);
    gain.gain.linearRampToValueAtTime(0.12, now + tone.start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.start + tone.dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(now + tone.start);
    osc.stop(now + tone.start + tone.dur + 0.05);
  }
}
