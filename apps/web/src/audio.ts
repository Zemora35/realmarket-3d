// WebAudio ile üretilen kısa efektler (harici ses dosyası gerektirmez).
let ctx: AudioContext | null = null;
let muted = false;

function ac() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, duration: number, type: OscillatorType = 'sine', gain = 0.08, delay = 0) {
  if (muted) return;
  try {
    const a = ac();
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.value = freq;
    const t0 = a.currentTime + delay;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    o.connect(g).connect(a.destination);
    o.start(t0);
    o.stop(t0 + duration + 0.02);
  } catch {
    /* ses desteklenmiyor */
  }
}

export const sfx = {
  pick: () => tone(520, 0.08, 'triangle', 0.05),
  drop: () => {
    tone(300, 0.07, 'triangle', 0.06);
    tone(220, 0.09, 'triangle', 0.05, 0.05);
  },
  beep: () => tone(1850, 0.11, 'square', 0.035),
  error: () => tone(160, 0.25, 'sawtooth', 0.04),
  success: () => {
    tone(660, 0.12, 'sine', 0.06);
    tone(880, 0.16, 'sine', 0.06, 0.12);
    tone(1320, 0.22, 'sine', 0.05, 0.26);
  },
  door: () => tone(140, 0.4, 'sine', 0.025),
  setMuted: (m: boolean) => {
    muted = m;
  },
};
