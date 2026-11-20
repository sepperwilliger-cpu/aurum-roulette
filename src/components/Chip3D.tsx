'use client';
import { useRef } from 'react';
import { animate, motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { CHIP_STYLE } from '@/lib/constants';
import { Chip } from './Chip';
import { sfx, unlockAudio } from '@/client/sound';

const REST_TILT = 14; // leicht schräg, damit man die Randstärke immer sieht
const MAX_TILT = 32;
const LAYERS = 7; // Schichten für den Chip-Rand

/**
 * Chip als 3D-Objekt: Randstärke aus mehreren Schichten (mit den typischen Randstreifen),
 * kippt zum Mauszeiger, hebt sich an, Glanzlicht folgt dem Zeiger; Klick = eine Umdrehung.
 */
export function Chip3D({ value, size, reduced = false }: { value: number; size: string; reduced?: boolean }) {
  const st = CHIP_STYLE[value];
  const px = useMotionValue(0); // −0.5 … 0.5
  const py = useMotionValue(0);
  const spring = { stiffness: 260, damping: 18, mass: 0.6 };
  const rotateX = useSpring(REST_TILT, spring);
  const rotateY = useSpring(0, spring);
  const lift = useSpring(0, spring);
  const spin = useMotionValue(0);
  const totalY = useTransform([rotateY, spin], ([a, b]: number[]) => a + b);
  const sheenX = useTransform(px, (v) => `${50 + v * 90}%`);
  const sheenY = useTransform(py, (v) => `${50 + v * 90}%`);
  const sheen = useMotionTemplate`radial-gradient(circle at ${sheenX} ${sheenY}, rgba(255,255,255,.55), rgba(255,255,255,0) 52%)`;
  const shadowScale = useTransform(lift, [0, 26], [1, 0.72]);
  const shadowOpacity = useTransform(lift, [0, 26], [0.75, 0.35]);
  const hovering = useRef(false);

  const onMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (reduced) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    px.set(x);
    py.set(y);
    rotateY.set(x * MAX_TILT * 2);
    rotateX.set(REST_TILT - y * MAX_TILT * 2);
    if (!hovering.current) {
      hovering.current = true;
      lift.set(26);
    }
  };
  const onLeave = () => {
    hovering.current = false;
    px.set(0);
    py.set(0);
    rotateX.set(REST_TILT);
    rotateY.set(0);
    lift.set(0);
  };
  const onClick = () => {
    unlockAudio();
    sfx.chip();
    if (reduced) return;
    spin.set(0);
    void animate(spin, 360, { duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }).then(() => spin.set(0));
  };

  // Rand: Grundfarbe mit 8 Akzentstreifen, rundherum
  const edge = `repeating-conic-gradient(from 11deg, ${st.base} 0 34deg, ${st.accent} 34deg 45deg)`;

  return (
    <button
      type="button"
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      onBlur={onLeave}
      onClick={onClick}
      aria-label={`Chip ${value.toLocaleString('de-CH')} Credits`}
      className="focus-ring group relative shrink-0 rounded-full"
      style={{ width: size, height: size, perspective: 700 }}
    >
      {/* Schatten auf dem Tisch */}
      <motion.span
        aria-hidden="true"
        className="absolute left-[8%] top-[78%] h-[34%] w-[84%] rounded-[50%] bg-black blur-[6px]"
        style={{ scale: shadowScale, opacity: shadowOpacity }}
      />
      <motion.span
        aria-hidden="true"
        className="absolute inset-0"
        style={{ rotateX, rotateY: totalY, z: lift, transformStyle: 'preserve-3d' }}
      >
        {Array.from({ length: LAYERS }, (_, i) => (
          <span
            key={i}
            className="absolute inset-0 rounded-full"
            style={{
              transform: `translateZ(${-(i + 1) * 1.5}px)`,
              background: edge,
              filter: `brightness(${0.78 - i * 0.06})`,
            }}
          />
        ))}
        {/* Rückseite, damit der Chip beim Drehen nicht durchsichtig wirkt */}
        <span
          className="absolute inset-0"
          style={{ transform: `translateZ(${-(LAYERS + 1) * 1.5}px) rotateY(180deg)`, backfaceVisibility: 'hidden' }}
        >
          <Chip value={value} size="100%" flat />
        </span>
        <span className="absolute inset-0" style={{ transform: 'translateZ(0.5px)' }}>
          <Chip value={value} size="100%" flat />
        </span>
        <motion.span
          className="pointer-events-none absolute inset-0 rounded-full opacity-0 mix-blend-screen transition-opacity duration-300 group-hover:opacity-100"
          style={{ transform: 'translateZ(1px)', background: sheen }}
        />
      </motion.span>
    </button>
  );
}
