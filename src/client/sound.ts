'use client';
/**
 * Alle Sounds werden live mit der Web-Audio-API synthetisiert –
 * keine Audiodateien, keine externen Dienste.
 */
import { useGame } from './store';

let ctx: AudioContext | null = null;
let fxOut: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let rolling: { nodes: AudioScheduledSourceNode[]; gain: GainNode } | null = null;

/** Gemeinsamer AudioContext für Effekte und Musik. */
export function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    fxOut = ctx.createGain();
    fxOut.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function audio(): { ctx: AudioContext; out: GainNode } | null {
  const { sound, volume } = useGame.getState().settings;
  if (!sound) return null;
  const c = audioContext();
  if (!c) return null;
  fxOut!.gain.value = volume;
  return { ctx: c, out: fxOut! };
}

/** Muss einmal durch eine Nutzeraktion ausgelöst werden (Browser-Autoplay-Regeln). */
export function unlockAudio() {
  audioContext();
}

export function noise(c: AudioContext) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.2) {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime + start;
  const o = a.ctx.createOscillator();
  const g = a.ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function click(start = 0, freq = 3200, vol = 0.5, dur = 0.035) {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime + start;
  const src = a.ctx.createBufferSource();
  src.buffer = noise(a.ctx);
  const bp = a.ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 2.5;
  const g = a.ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(g).connect(a.out);
  src.start(t, Math.random());
  src.stop(t + dur + 0.02);
}

/** "Braunes" Rauschen: tief und weich – klingt nach Holz statt nach Wind/Düse. */
let brownBuf: AudioBuffer | null = null;
function brown(c: AudioContext) {
  if (!brownBuf) {
    brownBuf = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
    const d = brownBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
  }
  return brownBuf;
}

/** Winziges, leises Körnchen-Geräusch: Kugel rollt über die Holzmaserung. */
function grain(c: AudioContext, out: AudioNode, t: number, vol: number, freq: number, nodes: AudioScheduledSourceNode[]) {
  const s = c.createBufferSource();
  s.buffer = noise(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 1.4;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.014);
  s.connect(bp).connect(g).connect(out);
  s.start(t, Math.random() * 1.5);
  s.stop(t + 0.025);
  nodes.push(s);
}

/** Kugel springt ins Fach: weiches, hölzernes "Tock". */
function ballHit(start: number, vol: number) {
  tone(820 + Math.random() * 260, start, 0.08, 'sine', vol * 0.25);
  click(start, 1500 + Math.random() * 600, vol * 0.55, 0.03);
}

/** Zeitpunkte (Anteil der Rollzeit), an denen die Kugel aufschlägt – passend zu ballPath.ts. */
const HITS = [0.7, 0.78, 0.86, 0.905, 0.953, 0.99];

export const sfx = {
  chip() {
    click(0, 2600, 0.55, 0.03);
    click(0.028, 3800, 0.35, 0.03);
  },
  select() {
    click(0, 4200, 0.25, 0.02);
  },
  tick() {
    tone(1100, 0, 0.07, 'sine', 0.1);
  },
  error() {
    tone(220, 0, 0.12, 'square', 0.06);
  },
  /**
   * Sanftes Rollen der Kugel auf der Holzbahn, ab dem ersten Moment der Drehung:
   *  – tiefes, weiches Grundrauschen (braunes Rauschen, Tiefpass ~500 Hz)
   *  – leichtes An- und Abschwellen einmal pro Umlauf (≈2× pro Sekunde, wird langsamer)
   *  – viele winzige leise Körnchen-Klicks, deren Dichte mit dem Tempo abnimmt
   *  – am Ende einige weiche Aufschläge, wenn die Kugel ins Fach springt
   * @param totalSec Rollzeit bis die Kugel liegt
   * @param elapsedSec bereits vergangene Zeit (bei spätem Beitritt)
   */
  spin(totalSec: number, elapsedSec = 0) {
    const a = audio();
    if (!a) return;
    sfx.stopSpin();
    const c = a.ctx;
    const t0 = c.currentTime;
    const at = (p: number) => t0 + Math.max(0, p * totalSec - elapsedSec);
    const dropT = Math.max(t0 + 0.4, at(0.7));
    const speedAt = (p: number) => Math.pow(Math.max(0, 1 - p), 1.6); // wie ballPath (Ableitung der Easing-Kurve)
    const p0 = Math.min(0.95, elapsedSec / totalSec);
    const nodes: AudioScheduledSourceNode[] = [];

    // Hülle: sanft einblenden, beim Abbremsen leiser, vor dem Einfallen ausblenden
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(0.34, t0 + 0.45);
    env.gain.setValueAtTime(0.34, Math.max(t0 + 0.46, at(0.4)));
    env.gain.exponentialRampToValueAtTime(0.12, Math.max(t0 + 0.5, at(0.66)));
    env.gain.exponentialRampToValueAtTime(0.0001, dropT + 0.3);
    env.connect(a.out);

    // 1) weiches Grundrollen
    const body = c.createBufferSource();
    body.buffer = brown(c);
    body.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.5;
    lp.frequency.setValueAtTime(560, t0);
    lp.frequency.exponentialRampToValueAtTime(240, dropT);
    const swell = c.createGain();
    swell.gain.value = 0.85;
    // einmal pro Kugelumlauf leicht lauter/leiser (kein schnelles Pulsieren!)
    const lfo = c.createOscillator();
    lfo.frequency.setValueAtTime(Math.max(0.6, 2.2 * speedAt(p0)), t0);
    lfo.frequency.exponentialRampToValueAtTime(0.5, dropT);
    const depth = c.createGain();
    depth.gain.value = 0.15;
    lfo.connect(depth).connect(swell.gain);
    body.connect(lp).connect(swell).connect(env);
    body.start(t0, Math.random() * 2);
    lfo.start(t0);
    body.stop(dropT + 0.5);
    lfo.stop(dropT + 0.5);
    nodes.push(body, lfo);

    // 2) feine Körnchen auf dem Holz – dichter am Anfang, spärlicher beim Abbremsen
    let t = t0 + 0.08;
    while (t < dropT) {
      const p = (t - t0 + elapsedSec) / totalSec;
      const sp = speedAt(p);
      const rate = 7 + 38 * sp;
      grain(c, env, t, (0.05 + 0.07 * sp) * (0.5 + Math.random() * 0.5), 900 + Math.random() * 900, nodes);
      t += (1 / rate) * (0.55 + Math.random() * 0.9);
    }

    rolling = { nodes, gain: env };

    // 3) Kugel springt über Rauten in ein Fach
    HITS.forEach((p, i) => {
      const when = p * totalSec - elapsedSec;
      if (when > 0) ballHit(when, 0.42 - i * 0.05);
    });
  },
  stopSpin() {
    if (!rolling || !ctx) return;
    const { nodes, gain } = rolling;
    rolling = null;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08);
    for (const n of nodes) {
      try {
        n.stop(ctx.currentTime + 0.4);
      } catch {
        /* bereits gestoppt */
      }
    }
  },
  win(big = false) {
    const notes = big ? [523, 659, 784, 1047, 1319, 1568] : [523, 659, 784, 1047];
    notes.forEach((f, i) => tone(f, i * 0.09, 0.45, 'triangle', 0.16));
    if (big) [0.6, 0.7, 0.8].forEach((s) => tone(2093, s, 0.3, 'sine', 0.06));
  },
  lose() {
    tone(330, 0, 0.25, 'sine', 0.06);
    tone(262, 0.18, 0.35, 'sine', 0.06);
  },
  message() {
    tone(1320, 0, 0.08, 'sine', 0.07);
  },
};
