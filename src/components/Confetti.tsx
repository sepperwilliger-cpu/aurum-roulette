'use client';
import { useEffect, useRef } from 'react';

const COLORS = ['#f3d77a', '#d4af37', '#fff3c4', '#ffffff', '#c42a33', '#17a35a', '#60a5fa', '#f472b6'];

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vr: number;
  flip: number;
  vf: number;
  color: string;
  round: boolean;
}

/**
 * Vollbild-Konfetti. Jede Änderung von `burst` feuert eine neue Salve ab.
 * `size`: 'small' (normaler Gewinn) oder 'big' (grosser Gewinn → mehr + Regen von oben).
 */
export function Confetti({ burst, size, reduced }: { burst: number | null; size: 'small' | 'big'; reduced: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pieces = useRef<Piece[]>([]);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (burst === null) return;
    const cv = canvas.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth;
    const H = window.innerHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const scale = (reduced ? 0.4 : 1) * (W < 640 ? 0.6 : 1);
    const perSide = Math.round((size === 'big' ? 170 : 110) * scale);
    const make = (x: number, y: number, angle: number, speed: number): Piece => ({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w: 6 + Math.random() * 7,
      h: 4 + Math.random() * 5,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      flip: Math.random() * Math.PI,
      vf: 0.08 + Math.random() * 0.15,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      round: Math.random() < 0.18,
    });
    const shot = (H: number) => 14 + Math.random() * 9 * Math.min(1.4, H / 700);
    for (let i = 0; i < perSide; i++) {
      // links unten nach rechts oben, rechts unten nach links oben
      pieces.current.push(make(-10, H + 10, -Math.PI / 2 + 0.25 + Math.random() * 0.55, shot(H)));
      pieces.current.push(make(W + 10, H + 10, -Math.PI / 2 - 0.25 - Math.random() * 0.55, shot(H)));
    }
    if (size === 'big') {
      for (let i = 0; i < 160 * scale; i++) {
        pieces.current.push(make(Math.random() * W, -20 - Math.random() * H * 0.6, Math.PI / 2, 1 + Math.random() * 2));
      }
    }

    const startedAt = performance.now();
    let last = startedAt;
    const step = (now: number) => {
      // Zeitbasiert (k = Anzahl 60-fps-Frames seit dem letzten Bild) → gleich schnell auf langsamen Geräten
      const k = Math.min(4, Math.max(0.25, (now - last) / 16.67));
      last = now;
      ctx.clearRect(0, 0, W, H);
      const list = pieces.current;
      if (now - startedAt > 8000) list.length = 0; // Sicherheitsnetz: nach 8 s ist Schluss
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        const drag = Math.pow(0.985, k);
        p.vx *= drag;
        p.vy = p.vy * drag + 0.32 * k;
        if (p.vy > 4.5) p.vy = 4.5 + (p.vy - 4.5) * Math.pow(0.9, k); // Luftwiderstand → flattert herunter
        p.x += (p.vx + Math.sin(p.flip) * 0.6) * k;
        p.y += p.vy * k;
        p.rot += p.vr * k;
        p.flip += p.vf * k;
        if (p.y > H + 40) {
          list.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(p.flip));
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.h * 0.6, 0, Math.PI * 2);
          ctx.fill();
        } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      raf.current = list.length ? requestAnimationFrame(step) : null;
    };
    if (raf.current === null) raf.current = requestAnimationFrame(step);
  }, [burst, size, reduced]);

  useEffect(
    () => () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    },
    [],
  );

  return <canvas ref={canvas} className="pointer-events-none fixed inset-0 z-[90] h-full w-full" aria-hidden="true" />;
}
