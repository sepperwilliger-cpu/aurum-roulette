'use client';
/**
 * Leise, chillige Lo-Fi-Hintergrundmusik – generativ mit Web Audio erzeugt.
 * 4-taktige Jazz-Akkordfolge (Dm9 – G13 – Cmaj9 – Am9) bei 72 BPM mit Swing,
 * weichen E-Piano-Akkorden, Bass, gedämpften Drums und einer sparsamen Melodie.
 * Keine Audiodateien → keine Ladezeit, keine Lizenzfragen.
 */
import { audioContext, noise } from './sound';

const BPM = 72;
const STEP = 60 / BPM / 2; // Achtelnote
const SWING = 0.16; // Off-Beats leicht verzögert
const LOOKAHEAD = 0.35;

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

// Akkorde (MIDI) + Bass-Grundton
const CHORDS: { notes: number[]; bass: number }[] = [
  { notes: [53, 57, 60, 64, 65], bass: 38 }, // Dm9  (F A C E + F)
  { notes: [53, 57, 59, 64], bass: 43 }, // G13  (F A B E)
  { notes: [52, 55, 59, 62], bass: 36 }, // Cmaj9 (E G B D)
  { notes: [55, 60, 64, 67], bass: 45 }, // Am9  (G C E G)
];
const MELODY_SCALE = [72, 74, 76, 79, 81, 84]; // C-Dur-Pentatonik, hoch

let master: GainNode | null = null;
let bus: GainNode | null = null;
let duckGain: GainNode | null = null;
let reverb: ConvolverNode | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let nextTime = 0;
let step = 0;
let playing = false;
let targetVolume = 0.4;

function impulse(c: AudioContext, seconds: number, decay: number) {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function ensureGraph(c: AudioContext) {
  if (master) return;
  master = c.createGain();
  master.gain.value = 0;
  duckGain = c.createGain();
  duckGain.gain.value = 1;
  // Lo-Fi-Charakter: Höhen leicht abschneiden
  const tone = c.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 3800;
  bus = c.createGain();
  bus.gain.value = 1;
  reverb = c.createConvolver();
  reverb.buffer = impulse(c, 2.6, 3);
  const wet = c.createGain();
  wet.gain.value = 0.32;
  bus.connect(tone);
  bus.connect(reverb).connect(wet).connect(tone);
  tone.connect(duckGain).connect(master).connect(c.destination);
}

/** Weicher E-Piano-Ton (Sinus + leicht verstimmtes Dreieck, langsames Ausklingen). */
function keys(c: AudioContext, n: number, t: number, dur: number, vel: number) {
  const f = midi(n);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vel, t + 0.02);
  g.gain.exponentialRampToValueAtTime(vel * 0.35, t + 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(2200, t);
  lp.frequency.exponentialRampToValueAtTime(700, t + dur);
  const o1 = c.createOscillator();
  o1.type = 'sine';
  o1.frequency.value = f;
  const o2 = c.createOscillator();
  o2.type = 'triangle';
  o2.frequency.value = f;
  o2.detune.value = 6 + Math.random() * 4;
  const o2g = c.createGain();
  o2g.gain.value = 0.35;
  o1.connect(lp);
  o2.connect(o2g).connect(lp);
  lp.connect(g).connect(bus!);
  for (const o of [o1, o2]) {
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

function bass(c: AudioContext, n: number, t: number, dur: number) {
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.value = midi(n);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus!);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function kick(c: AudioContext, t: number) {
  const o = c.createOscillator();
  o.frequency.setValueAtTime(110, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
  const g = c.createGain();
  g.gain.setValueAtTime(0.32, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
  o.connect(g).connect(duckGain!); // trocken, ohne Hall
  o.start(t);
  o.stop(t + 0.35);
}

function noiseHit(c: AudioContext, t: number, freq: number, type: BiquadFilterType, vol: number, dur: number, toBus = false) {
  const s = c.createBufferSource();
  s.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = type === 'bandpass' ? 0.9 : 0.7;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(toBus ? bus! : duckGain!);
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur + 0.02);
}

function bell(c: AudioContext, n: number, t: number) {
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.value = midi(n);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
  o.connect(g).connect(bus!);
  o.start(t);
  o.stop(t + 1.5);
}

/** Plant einen Achtel-Schritt (32 Schritte = 4 Takte). */
function scheduleStep(c: AudioContext, s: number, t: number) {
  const bar = Math.floor(s / 8) % 4;
  const pos = s % 8; // Achtel im Takt
  const chord = CHORDS[bar];
  const swung = pos % 2 === 1 ? t + STEP * SWING : t;

  // E-Piano: Akkord auf 1, leiser Nachschlag auf "3 und"
  if (pos === 0) chord.notes.forEach((n, i) => keys(c, n, t + i * 0.012, STEP * 7.5, 0.05));
  if (pos === 5 && Math.random() < 0.6) chord.notes.slice(1).forEach((n) => keys(c, n, swung, STEP * 3, 0.028));

  // Bass: 1 und "2 und"
  if (pos === 0) bass(c, chord.bass, t, STEP * 3);
  if (pos === 3) bass(c, chord.bass + (Math.random() < 0.5 ? 7 : 12), swung, STEP * 2.5);

  // Drums: Kick 1 + 3-und, Snare (gedämpft) 2 + 4, Hi-Hats auf allen Achteln
  if (pos === 0 || (pos === 5 && Math.random() < 0.7)) kick(c, swung);
  if (pos === 2 || pos === 6) noiseHit(c, t, 1800, 'bandpass', 0.07, 0.16, true);
  noiseHit(c, swung, 7500, 'highpass', pos % 2 === 0 ? 0.022 : 0.014, 0.05);

  // Sparsame Melodie
  if (pos % 2 === 0 && Math.random() < 0.2) bell(c, MELODY_SCALE[Math.floor(Math.random() * MELODY_SCALE.length)], swung);
}

function tick() {
  const c = audioContext();
  if (!c || !playing) return;
  while (nextTime < c.currentTime + LOOKAHEAD) {
    scheduleStep(c, step, nextTime);
    nextTime += STEP;
    step = (step + 1) % 32;
  }
}

export const music = {
  get playing() {
    return playing;
  },
  start(volume = targetVolume) {
    const c = audioContext();
    if (!c) return;
    ensureGraph(c);
    targetVolume = volume;
    if (playing) return music.setVolume(volume);
    playing = true;
    step = 0;
    nextTime = c.currentTime + 0.1;
    master!.gain.cancelScheduledValues(c.currentTime);
    master!.gain.setValueAtTime(master!.gain.value, c.currentTime);
    master!.gain.linearRampToValueAtTime(level(volume), c.currentTime + 2.5); // sanft einblenden
    tick();
    timer = setInterval(tick, 60);
  },
  stop() {
    const c = audioContext();
    playing = false;
    if (timer) clearInterval(timer);
    timer = null;
    if (c && master) {
      master.gain.cancelScheduledValues(c.currentTime);
      master.gain.setValueAtTime(master.gain.value, c.currentTime);
      master.gain.linearRampToValueAtTime(0, c.currentTime + 0.8);
    }
  },
  setVolume(volume: number) {
    targetVolume = volume;
    const c = audioContext();
    if (c && master && playing) master.gain.setTargetAtTime(level(volume), c.currentTime, 0.2);
  },
  /** Während die Kugel rollt, Musik etwas leiser. */
  duck(on: boolean) {
    const c = audioContext();
    if (c && duckGain) duckGain.gain.setTargetAtTime(on ? 0.45 : 1, c.currentTime, on ? 0.3 : 0.8);
  },
};

/** Lautstärke-Regler 0–1 → leiser Hintergrundpegel. */
const level = (v: number) => Math.max(0, Math.min(1, v)) * 0.55;
