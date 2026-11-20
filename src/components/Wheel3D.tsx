'use client';
/**
 * Prozedural modelliertes europäisches Rouletterad (Three.js / React Three Fiber).
 * Keine externen Modelle oder Texturen – alles wird im Browser erzeugt.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { WHEEL_ORDER, colorOf } from '@/lib/roulette';
import {
  BALL_R,
  R_DEFLECT,
  SEG,
  TAU,
  Y_DEFLECT,
  ballAt,
  planSpin,
  pocketAngle,
  type SpinPlan,
} from '@/lib/ballPath';
import { BALL_SETTLE_MS } from '@/lib/constants';

export interface WheelSpin {
  /** Runden-ID, damit eine Drehung genau einmal geplant wird. */
  round: number;
  number: number;
  /** Startzeit der Drehung in lokaler Zeit (ms). */
  startLocal: number;
}

interface Props {
  spin: WheelSpin | null;
  restNumber: number;
  quality: 'high' | 'low';
  /** 'table' = ganzes Rad von oben (Spielraum), 'hero' = flacher Nahblick (Startseite) */
  variant?: 'table' | 'hero';
}

const COLORS = { red: '#b3202a', black: '#16181c', green: '#138a4b' } as const;

// Radien des Rotors
const RN_OUT = 3.85; // Zahlenkranz aussen
const RN_IN = 3.22; // Zahlenkranz innen = Fächer aussen
const RP_IN = 2.55; // Fächer innen
const Y_NUM = 0.3;
const Y_POCKET_FLOOR = 0.08;

function ringTexture(outer: number, inner: number, draw: (ctx: CanvasRenderingContext2D, k: number, c: number) => void) {
  const size = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  const k = c / outer; // Pixel pro Einheit
  draw(ctx, k, c);
  // Innenbereich transparent (wird von der Ring-Geometrie ohnehin nicht gezeigt)
  void inner;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function segmentPath(ctx: CanvasRenderingContext2D, c: number, r0: number, r1: number, a0: number, a1: number) {
  ctx.beginPath();
  ctx.arc(c, c, r1, a0, a1);
  ctx.arc(c, c, r0, a1, a0, true);
  ctx.closePath();
}

function useWheelTextures() {
  return useMemo(() => {
    const numbers = ringTexture(RN_OUT, RN_IN, (ctx, k, c) => {
      WHEEL_ORDER.forEach((n, i) => {
        const a = i * SEG;
        segmentPath(ctx, c, RN_IN * k, RN_OUT * k, a - SEG / 2, a + SEG / 2);
        ctx.fillStyle = COLORS[colorOf(n)];
        ctx.fill();
        // Goldene Trennlinie
        ctx.strokeStyle = '#c9a33a';
        ctx.lineWidth = 5;
        ctx.stroke();
        // Zahl, Oberkante zeigt nach aussen
        const rm = ((RN_IN + RN_OUT) / 2) * k;
        ctx.save();
        ctx.translate(c + Math.cos(a) * rm, c + Math.sin(a) * rm);
        ctx.rotate(a + Math.PI / 2);
        ctx.fillStyle = '#f7f1e3';
        ctx.font = `700 ${Math.round(0.33 * k)}px "Segoe UI", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(n), 0, 0);
        ctx.restore();
      });
      // Goldene Kanten
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#d4af37';
      ctx.beginPath();
      ctx.arc(c, c, RN_OUT * k - 5, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(c, c, RN_IN * k + 5, 0, TAU);
      ctx.stroke();
    });

    const pockets = ringTexture(RN_IN, RP_IN, (ctx, k, c) => {
      WHEEL_ORDER.forEach((n, i) => {
        const a = i * SEG;
        segmentPath(ctx, c, RP_IN * k, RN_IN * k, a - SEG / 2, a + SEG / 2);
        const g = ctx.createRadialGradient(c, c, RP_IN * k, c, c, RN_IN * k);
        const base = COLORS[colorOf(n)];
        g.addColorStop(0, base);
        g.addColorStop(1, '#050505');
        ctx.fillStyle = g;
        ctx.fill();
      });
    });

    const wood = (() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      const g = ctx.createLinearGradient(0, 0, 1024, 0);
      g.addColorStop(0, '#4a2412');
      g.addColorStop(0.5, '#6b3518');
      g.addColorStop(1, '#4a2412');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 1024, 64);
      for (let i = 0; i < 260; i++) {
        ctx.strokeStyle = `rgba(${20 + Math.random() * 40},${8 + Math.random() * 14},0,${0.15 + Math.random() * 0.25})`;
        ctx.lineWidth = 1 + Math.random() * 2;
        const x = Math.random() * 1024;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + 20, 20, x - 20, 44, x + Math.random() * 10, 64);
        ctx.stroke();
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(6, 1);
      return tex;
    })();

    return { numbers, pockets, wood };
  }, []);
}

function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.55;
    return () => {
      scene.environment = null;
      env.dispose();
      pm.dispose();
    };
  }, [gl, scene]);
  return null;
}

/** Kamera so platzieren, dass das Rad in jedes Seitenverhältnis passt. */
function CameraRig({ variant }: { variant: 'table' | 'hero' }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    const vfov = THREE.MathUtils.degToRad(cam.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    // Breite ≈ Raddurchmesser, Höhe ≈ schräg gesehene Scheibe + Drehkreuz
    const dist = Math.max(6.1 / Math.tan(hfov / 2), 5.7 / Math.tan(vfov / 2)) * (variant === 'hero' ? 0.86 : 1.04);
    // Hero: flacher Blick von links vorne, wie ein Spieler am Tisch
    const tilt = THREE.MathUtils.degToRad(variant === 'hero' ? 30 : 52);
    const yaw = variant === 'hero' ? -0.35 : 0;
    const flat = Math.cos(tilt) * dist;
    cam.position.set(Math.sin(yaw) * flat, Math.sin(tilt) * dist, Math.cos(yaw) * flat);
    cam.lookAt(0, variant === 'hero' ? 0.4 : 0.1, 0);
    cam.updateProjectionMatrix();
  }, [camera, size, variant]);
  return null;
}

const gold = { color: '#d4af37', metalness: 1, roughness: 0.28 } as const;

function lathe(points: [number, number][], segments = 128) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

function WheelModel({ spin, restNumber }: { spin: WheelSpin | null; restNumber: number }) {
  const tex = useWheelTextures();
  const rotor = useRef<THREE.Group>(null);
  const ball = useRef<THREE.Mesh>(null);
  const state = useRef({
    rotorAngle: 0,
    phi: pocketAngle(restNumber),
    plan: null as SpinPlan | null,
    planRound: -1,
  });

  const geo = useMemo(
    () => ({
      // Holzrahmen + Laufbahn (statisch)
      rim: lathe([
        [5.65, -0.35],
        [5.7, 0.62],
        [5.55, 0.98],
        [4.88, 1.0],
        [4.84, 0.92],
      ]),
      track: lathe([
        [4.84, 0.92],
        [4.76, 0.62],
        [4.0, 0.4],
        [RN_OUT + 0.02, 0.32],
      ]),
      base: new THREE.CylinderGeometry(5.6, 5.4, 0.4, 96),
      // Rotor
      numbers: new THREE.RingGeometry(RN_IN, RN_OUT, 148, 1),
      pockets: new THREE.RingGeometry(RP_IN, RN_IN, 148, 1),
      pocketWall: new THREE.CylinderGeometry(RN_IN, RN_IN, Y_NUM - Y_POCKET_FLOOR, 148, 1, true),
      cone: lathe([
        [RP_IN, Y_POCKET_FLOOR],
        [RP_IN - 0.03, 0.26],
        [2.2, 0.36],
        [1.2, 0.62],
        [0.5, 0.74],
        [0.0, 0.76],
      ]),
      fret: new THREE.BoxGeometry(RN_IN - RP_IN, 0.16, 0.035),
      post: new THREE.CylinderGeometry(0.11, 0.2, 0.75, 32),
      arm: new THREE.CylinderGeometry(0.045, 0.075, 1.25, 16),
      knob: new THREE.SphereGeometry(0.13, 24, 16),
      top: new THREE.SphereGeometry(0.2, 32, 16),
      deflector: new THREE.OctahedronGeometry(0.16, 0),
      ball: new THREE.SphereGeometry(BALL_R, 32, 16),
    }),
    [],
  );

  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose());
      Object.values(tex).forEach((t) => t.dispose());
    },
    [geo, tex],
  );

  useFrame((_, dtRaw) => {
    const s = state.current;
    const dt = Math.min(dtRaw, 0.1);
    const now = Date.now();
    let p = 1;
    if (spin) {
      if (s.planRound !== spin.round) {
        s.plan = planSpin(s.phi, spin.number);
        s.planRound = spin.round;
      }
      p = (now - spin.startLocal) / BALL_SETTLE_MS;
    } else {
      s.plan = null;
      s.phi = pocketAngle(restNumber);
    }

    // Rotor: Grunddrehung + Schwung beim Anwerfen, klingt langsam ab
    const sinceSpin = spin ? Math.max(0, (now - spin.startLocal) / 1000) : 99;
    const omega = 0.32 + 1.25 * Math.exp(-sinceSpin / 4);
    s.rotorAngle = (s.rotorAngle + omega * dt) % TAU;
    if (rotor.current) rotor.current.rotation.y = -s.rotorAngle;

    let r = 2.9;
    let y = 0.2;
    if (s.plan) {
      const b = ballAt(s.plan, p);
      s.phi = b.phi;
      r = b.r;
      y = b.y;
    } else {
      const b = ballAt(planSpin(s.phi, restNumber), 1);
      r = b.r;
      y = b.y;
    }
    const A = s.rotorAngle + s.phi;
    if (ball.current) {
      ball.current.position.set(Math.cos(A) * r, y, Math.sin(A) * r);
      ball.current.rotation.z -= dt * 6;
    }
  });

  const frets = useMemo(
    () =>
      Array.from({ length: 37 }, (_, i) => {
        const a = i * SEG + SEG / 2;
        const rm = (RP_IN + RN_IN) / 2;
        return { pos: [Math.cos(a) * rm, Y_POCKET_FLOOR + 0.08, Math.sin(a) * rm] as const, rotY: -a };
      }),
    [],
  );

  return (
    <group>
      {/* Sockel & Holzrahmen */}
      <mesh geometry={geo.base} position={[0, -0.45, 0]}>
        <meshStandardMaterial color="#1a0f08" roughness={0.6} />
      </mesh>
      <mesh geometry={geo.rim}>
        <meshPhysicalMaterial map={tex.wood} roughness={0.35} clearcoat={0.8} clearcoatRoughness={0.2} />
      </mesh>
      <mesh geometry={geo.track}>
        <meshPhysicalMaterial color="#2a1a10" roughness={0.25} clearcoat={1} clearcoatRoughness={0.1} side={THREE.DoubleSide} />
      </mesh>
      {/* Rauten (Deflektoren) */}
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * TAU + 0.2;
        return (
          <mesh
            key={i}
            geometry={geo.deflector}
            position={[Math.cos(a) * (R_DEFLECT + 0.1), Y_DEFLECT - 0.08, Math.sin(a) * (R_DEFLECT + 0.1)]}
            rotation={[0, -a, Math.PI / 2]}
            scale={[1, 0.5, 2.2]}
          >
            <meshStandardMaterial {...gold} />
          </mesh>
        );
      })}

      {/* Rotor */}
      <group ref={rotor}>
        <mesh geometry={geo.numbers} rotation={[-Math.PI / 2, 0, 0]} position={[0, Y_NUM, 0]}>
          <meshPhysicalMaterial map={tex.numbers} roughness={0.35} clearcoat={0.6} />
        </mesh>
        <mesh geometry={geo.pocketWall} position={[0, (Y_NUM + Y_POCKET_FLOOR) / 2, 0]}>
          <meshStandardMaterial {...gold} side={THREE.DoubleSide} />
        </mesh>
        <mesh geometry={geo.pockets} rotation={[-Math.PI / 2, 0, 0]} position={[0, Y_POCKET_FLOOR, 0]}>
          <meshStandardMaterial map={tex.pockets} roughness={0.5} />
        </mesh>
        {frets.map((f, i) => (
          <mesh key={i} geometry={geo.fret} position={f.pos as unknown as THREE.Vector3Tuple} rotation={[0, f.rotY, 0]}>
            <meshStandardMaterial color="#e3e3e3" metalness={1} roughness={0.22} />
          </mesh>
        ))}
        <mesh geometry={geo.cone}>
          <meshStandardMaterial color="#b8892a" metalness={0.9} roughness={0.32} />
        </mesh>
        {/* Drehkreuz */}
        <mesh geometry={geo.post} position={[0, 1.08, 0]}>
          <meshStandardMaterial {...gold} />
        </mesh>
        {[0, 1, 2, 3].map((i) => {
          const a = (i * Math.PI) / 2;
          return (
            <group key={i} rotation={[0, a, 0]}>
              <mesh geometry={geo.arm} position={[0.62, 1.2, 0]} rotation={[0, 0, Math.PI / 2]}>
                <meshStandardMaterial {...gold} />
              </mesh>
              <mesh geometry={geo.knob} position={[1.27, 1.2, 0]}>
                <meshStandardMaterial {...gold} />
              </mesh>
            </group>
          );
        })}
        <mesh geometry={geo.top} position={[0, 1.5, 0]}>
          <meshStandardMaterial {...gold} />
        </mesh>
      </group>

      {/* Kugel */}
      <mesh ref={ball} geometry={geo.ball}>
        <meshPhysicalMaterial color="#ffffff" roughness={0.12} clearcoat={1} />
      </mesh>
    </group>
  );
}

export default function Wheel3D({ spin, restNumber, quality, variant = 'table' }: Props) {
  return (
    <Canvas
      key={quality}
      dpr={quality === 'high' ? [1, 2] : [0.75, 1]}
      gl={{ antialias: quality === 'high', powerPreference: 'high-performance', alpha: true }}
      camera={{ fov: 34, near: 0.1, far: 100, position: [0, 9, 7] }}
      aria-label="3D-Rouletterad"
      role="img"
    >
      <CameraRig variant={variant} />
      <Environment />
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 10, 6]} intensity={2.2} />
      <directionalLight position={[-6, 5, -4]} intensity={0.6} color="#ffd9a0" />
      <pointLight position={[0, 4, 0]} intensity={8} distance={12} color="#fff3d6" />
      <WheelModel spin={spin} restNumber={restNumber} />
    </Canvas>
  );
}
