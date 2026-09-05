/**
 * THE STACK, IN THREE DIMENSIONS · blueprint §10.2, P13
 *
 * *"This is where 3D is justified and nowhere else. On the landing page the
 * stack is R3F with real depth and the key light from §03. Inside the app it
 * is the same composition rendered as flat SVG — same shapes, same
 * proportions, no WebGL cost on a working screen."*
 *
 * Five decisions hold this scene to the rest of the product.
 *
 * **1. The geometry is the same arithmetic.** Block heights come from the same
 * paise-to-height scale the flat `Stack` uses: the tower's full height *is*
 * the gross, and each block's share of it is its share of the gross, exactly.
 * A 3D chart whose proportions were tuned by eye would be the one drawing in
 * this product that disagrees with the payslip.
 *
 * **2. Deductions genuinely carve.** This is the part a bar chart cannot do,
 * and it is why the act exists. The earnings build a solid tower. Then a
 * horizontal **cut plane** descends through it, clipping the tower away from
 * the top — and behind the removed material stand narrower, recessed blocks,
 * one per deduction, which were inside the solid tower all along. The tower
 * visibly shortens, the removed volume is replaced by a *notch*, and what is
 * still full width at the bottom is `NET`. Nothing fades; material is taken.
 *
 * **3. There is no text in the scene.** Labels are HTML, laid over the canvas
 * by the act. WebGL text means a font atlas, a second copy of the typeface and
 * a rendering path where §05's scale does not apply — three costs, in exchange
 * for text that cannot be selected, found, or read by a screen reader.
 *
 * **4. Colour and light come from the tokens.** `palette.ts` reads them off
 * the live document, so the scene follows the theme for the same reason every
 * other surface does. The key light is §03's, unchanged: one light,
 * upper-left, 35° above the horizon, with the shade side filled warm because
 * clay's shadow is never black.
 *
 * **5. The canvas renders on demand.** Every position here is a pure function
 * of scroll progress, so between scroll events there is nothing to animate. A
 * continuous loop would spin a GPU to draw an identical frame sixty times a
 * second — and it is a *landing page*, which is exactly the wrong place to do
 * that. It also means scrolling backwards takes the tower apart correctly
 * without a line of reverse-playback code.
 */
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useMotionValueEvent, type MotionValue } from "motion/react";
import * as THREE from "three";
import type { StackBlock } from "@/components/signature";
import { readPalette, type Palette } from "./palette";

/* ── World units ─────────────────────────────────────────────────────── */

/** The tower's full height at `GROSS`. Every other height derives from it. */
const TOWER_H = 4.2;
const TOWER_W = 2.15;
const TOWER_D = 1.5;
/** How far in a carve sits, per side — the notch's depth into the tower. */
const CARVE_INSET = 0.3;
/** A rule worth almost nothing still has to be visible. */
const MIN_H = 0.05;
/** `--r-2xl`, in world units. */
const RADIUS = 0.13;

/* ── Rounded blocks ──────────────────────────────────────────────────── */

/**
 * `--r-2xl` as real geometry rather than a shader trick.
 *
 * An extruded rounded rectangle with a bevel gives both the corner radius the
 * blueprint asks for *and* a chamfered edge for the key light to catch — which
 * is what makes the material read as clay. A plain box has one lit face and
 * five flat ones, and looks like every other WebGL bar chart ever shipped.
 */
function roundedBox(width: number, height: number, depth: number, radius: number) {
  const r = Math.max(0.01, Math.min(radius, width / 2 - 0.01, height / 2 - 0.01));
  const w = width / 2;
  const h = height / 2;

  const shape = new THREE.Shape();
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.quadraticCurveTo(w, -h, w, -h + r);
  shape.lineTo(w, h - r);
  shape.quadraticCurveTo(w, h, w - r, h);
  shape.lineTo(-w + r, h);
  shape.quadraticCurveTo(-w, h, -w, h - r);
  shape.lineTo(-w, -h + r);
  shape.quadraticCurveTo(-w, -h, -w + r, -h);

  const bevel = Math.min(0.045, height / 3);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, depth - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 8,
  });
  geometry.center();
  return geometry;
}

/* ── The layout, shared with the flat stack ──────────────────────────── */

export interface Piece {
  block: StackBlock;
  /** Centre of the piece above the ground plane, in world units. */
  y: number;
  height: number;
  /** Position in the landing sequence — also the sound's depth. */
  index: number;
  carve: boolean;
  /** For a carve: the height of tower still standing once it has been taken. */
  cutTo: number;
  /**
   * Progress at which the earnings tower is complete. A carve is hidden until
   * then — it lives *inside* the solid tower, and a notch floating in the air
   * above a half-built stack would be a hole in nothing.
   */
  builtAt: number;
}

/**
 * The same walk the flat `Stack` makes: additive blocks stack from the ground
 * up to `GROSS`; deductions then carve *downward* from `GROSS`, and what is
 * left standing beneath them is `NET`.
 */
export function layout(blocks: StackBlock[], gross: number) {
  const perPaisa = gross > 0 ? TOWER_H / gross : 0;
  const height = (amount: number) => Math.max(MIN_H, Math.abs(amount) * perPaisa);

  const additive = blocks.filter((b) => b.kind === "add");
  const deducted = blocks.filter((b) => b.kind === "deduct");

  const pieces: Piece[] = [];
  const builtAt = additive.length / Math.max(1, additive.length + deducted.length);
  let cursor = 0;

  additive.forEach((block, i) => {
    const h = height(block.amount);
    pieces.push({ block, y: cursor + h / 2, height: h, index: i, carve: false, cutTo: 0, builtAt });
    cursor += h;
  });

  const grossTop = cursor;
  let carveCursor = grossTop;

  deducted.forEach((block, i) => {
    const h = height(block.amount);
    carveCursor -= h;
    pieces.push({
      block,
      y: carveCursor + h / 2,
      height: h,
      index: additive.length + i,
      carve: true,
      cutTo: carveCursor,
      builtAt,
    });
  });

  return { pieces, grossTop, netTop: carveCursor, steps: pieces.length };
}

/* ── The window a piece owns ─────────────────────────────────────────── */

const windowFor = (index: number, count: number) => [index / count, (index + 1) / count] as const;
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
/** Decelerating, to approximate `spring.block`'s landing without a solver. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/* ── One block ───────────────────────────────────────────────────────── */

function Block({
  piece,
  count,
  progress,
  palette,
  active,
  clip,
  onHover,
  onSelect,
}: {
  piece: Piece;
  count: number;
  progress: MotionValue<number>;
  palette: Palette;
  active: boolean;
  /** Only the earnings are clipped — the notch is what is left behind. */
  clip: THREE.Plane | null;
  onHover: (code: string | null) => void;
  onSelect: (code: string) => void;
}) {
  const ref = useRef<THREE.Mesh>(null);

  /**
   * A carve is inset on both horizontal axes, and shortened a hair vertically
   * so its top face never lands exactly on the tower's — coincident faces are
   * where z-fighting comes from, and a flickering seam across the loudest act
   * would be the only thing anybody remembered about it.
   */
  const geometry = useMemo(
    () =>
      piece.carve
        ? roundedBox(
            TOWER_W - CARVE_INSET * 2,
            Math.max(MIN_H / 2, piece.height - 0.012),
            TOWER_D - CARVE_INSET * 2,
            RADIUS / 2,
          )
        : roundedBox(TOWER_W, piece.height, TOWER_D, RADIUS),
    [piece.carve, piece.height],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;

    if (piece.carve) {
      mesh.visible = progress.get() >= piece.builtAt;
      return;
    }

    // Earnings fall in, one per window, from above the finished tower.
    const [from, to] = windowFor(piece.index, count);
    const t = clamp01((progress.get() - from) / (to - from));
    const e = easeOut(t);

    mesh.position.set(0, piece.y + (1 - e) * TOWER_H, 0);
    mesh.scale.setScalar(t === 0 ? 0.0001 : 1);
    mesh.visible = t > 0;
  });

  const colour = active ? palette.blockActive : piece.carve ? palette.carve : palette.block;

  return (
    <mesh
      ref={ref}
      geometry={geometry}
      position={[0, piece.y, 0]}
      castShadow={!piece.carve}
      receiveShadow
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onHover(piece.block.code);
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onSelect(piece.block.code);
      }}
    >
      <meshStandardMaterial
        color={colour}
        roughness={piece.carve ? 0.95 : 0.8}
        metalness={0}
        clippingPlanes={clip ? [clip] : null}
        clipShadows
      />
    </mesh>
  );
}

/* ── The rig, and the cut ────────────────────────────────────────────── */

/**
 * Owns the two things that are true of the whole tower at once: where the cut
 * plane is, and how far round the tower has turned.
 *
 * The plane is written in **world** coordinates, so the group's own offset has
 * to be added to it. The group only ever rotates about Y, and a horizontal
 * plane is invariant under that rotation — which is the reason the tower can
 * be turned at all without the carve going crooked.
 */
function Rig({
  progress,
  plane,
  pieces,
  count,
  grossTop,
  children,
}: {
  progress: MotionValue<number>;
  plane: THREE.Plane;
  pieces: Piece[];
  count: number;
  grossTop: number;
  children: React.ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const invalidate = useThree((state) => state.invalidate);
  const baseY = -TOWER_H / 2 + 0.15;

  // On demand: a scroll change is the only thing that can change this scene.
  useMotionValueEvent(progress, "change", () => invalidate());
  useEffect(() => {
    invalidate();
  }, [invalidate]);

  const carves = useMemo(() => pieces.filter((p) => p.carve), [pieces]);

  useFrame(() => {
    const g = group.current;
    if (!g) return;

    const p = progress.get();

    /**
     * The cut starts at the tower's full height and descends through each
     * deduction in turn. Partial progress through a deduction removes a
     * proportional slice of it — so the tower shortens continuously with the
     * scroll rather than in ten discrete jumps.
     */
    let cut = grossTop;
    for (const carve of carves) {
      const [from, to] = windowFor(carve.index, count);
      const t = clamp01((p - from) / (to - from));
      cut = Math.min(cut, carve.cutTo + carve.height * (1 - easeOut(t)));
    }

    // Nothing has been built yet: leave the tower unclipped so the first
    // blocks are not cut away by a plane sitting on the ground.
    plane.constant = cut + baseY + 0.0001;

    g.rotation.y = -0.42 + p * 0.3;
    g.position.y = baseY;
  });

  return <group ref={group}>{children}</group>;
}

/* ── The scene ───────────────────────────────────────────────────────── */

export interface StackSceneProps {
  blocks: StackBlock[];
  gross: number;
  progress: MotionValue<number>;
  /** The code under the pointer, lifted so the HTML inspector can read it. */
  active: string | null;
  onHover: (code: string | null) => void;
  onSelect: (code: string) => void;
}

export default function StackScene({
  blocks,
  gross,
  progress,
  active,
  onHover,
  onSelect,
}: StackSceneProps) {
  const palette = useMemo(() => readPalette(), []);
  const { pieces, grossTop } = useMemo(() => layout(blocks, gross), [blocks, gross]);

  /** One plane, shared by every earnings material — one cut, not eight. */
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), TOWER_H * 2), []);

  return (
    <Canvas
      frameloop="demand"
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [3.2, 1.9, 6.4], fov: 34 }}
      gl={{ antialias: true, alpha: true }}
      onCreated={({ gl }) => {
        // Per-material clipping, which is what makes the cut affect the
        // earnings and leave the notch standing.
        gl.localClippingEnabled = true;
      }}
      /*
        Decorative twice over: the same codes, amounts and formulae are printed
        in the inspector beside the canvas, and the flat SVG substitute carries
        the identical description. Nothing here is the only copy of anything.
      */
      aria-hidden="true"
    >
      {/* §03 — one key light, upper-left, 35° above the horizon. */}
      <directionalLight
        position={[-5.2, 4.4, 5.4]}
        intensity={2.2}
        color={palette.key}
        castShadow
        /*
          512, not 1024. `frameloop="demand"` means the scene renders only
          while act 04 is being scrubbed — but during that scrub it renders
          every frame, and every frame re-renders the shadow map, because the
          blocks are moving. Quartering the map's fill is free here: the
          subject is a ten-block tower at six units, and the shadow it casts
          is soft-edged clay rather than a hard silhouette.

          **This whole light is a standing conflict with §19**, which says
          "no post-processing, no shadow maps — shadows are baked into the
          material". The scene was built with a real cast shadow and is tuned
          for one (`shadow-bias`, the shadow camera bounds), so removing it is
          a visible design change and not P14's call to make. Flagged in the
          build plan instead. P14 smoothness pass.
        */
        shadow-mapSize={[512, 512]}
        shadow-camera-near={1}
        shadow-camera-far={24}
        shadow-bias={-0.0012}
      />
      {/* Fill, warm and weak: clay's shade side is never black. */}
      <hemisphereLight args={[palette.key, palette.fill, 1.05]} />
      <ambientLight intensity={0.32} color={palette.fill} />

      <Rig progress={progress} plane={plane} pieces={pieces} count={pieces.length} grossTop={grossTop}>
        {pieces.map((piece) => (
          <Block
            key={piece.block.code}
            piece={piece}
            count={pieces.length}
            progress={progress}
            palette={palette}
            active={active === piece.block.code}
            clip={piece.carve ? null : plane}
            onHover={onHover}
            onSelect={onSelect}
          />
        ))}

        {/* The ground plane the first block lands on — shadow only, so the
            act's own background shows through. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]} receiveShadow>
          <planeGeometry args={[16, 16]} />
          <shadowMaterial opacity={0.15} />
        </mesh>
      </Rig>
    </Canvas>
  );
}
