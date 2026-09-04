"use client";

import { useRef, useEffect, useState } from "react";
import { useInView, motion, AnimatePresence } from "framer-motion";
import { animate } from "animejs";
import { CheckCircle2 } from "lucide-react";

export interface MechanicsStep {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  features?: string[];
}

interface MechanicsScrollShowcaseProps {
  steps: MechanicsStep[];
}

export default function MechanicsScrollShowcase({
  steps,
}: MechanicsScrollShowcaseProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeStepId, setActiveStepId] = useState(steps[0]?.id);

  return (
    <section
      ref={containerRef}
      id="mechanics"
      className="relative w-full border-t border-surface-border"
    >
      {/* Section heading, matching the eyebrow + title pattern used elsewhere
          on the landing page — the sticky step story below has no title of
          its own for this sequence as a whole. */}
      <div className="relative z-10 text-center max-w-2xl mx-auto px-6 pt-16 pb-4 space-y-2">
        <span className="text-xs font-mono uppercase tracking-widest text-moss font-semibold">
          How It Works
        </span>
        <h2 className="text-3xl sm:text-4xl font-black text-foreground tracking-tight">
          The Mechanics of Trustless Payments
        </h2>
      </div>

      {/* =========================================================
          STICKY CONTAINER
      ========================================================= */}

      <div className="sticky top-0 z-0 flex min-h-screen w-full items-center pointer-events-none overflow-hidden">
        <div className="relative mx-auto flex h-full w-full max-w-7xl items-center px-6 md:px-8 lg:px-12">

          {/* =====================================================
              LEFT — ANIME.JS ORBITAL SYSTEM
          ===================================================== */}

          <div className="hidden h-full lg:w-[50%] items-center justify-center lg:flex pointer-events-auto relative">
            <CurrencyOrb />
          </div>

          {/* =====================================================
              RIGHT — STORY
          ===================================================== */}

          <div className="flex min-h-screen w-full flex-col items-start justify-center py-16 lg:py-0 lg:min-h-0 lg:w-[50%] lg:pl-16 pointer-events-auto lg:-mt-32">
            <StepStory
              step={
                steps.find(
                  (s) => s.id === activeStepId
                ) || steps[0]
              }
            />
          </div>

        </div>
      </div>

      {/* =========================================================
          INVISIBLE SCROLL TRIGGERS
      ========================================================= */}

      <div className="relative z-10 mx-auto -mt-[100vh] flex w-full max-w-7xl px-6 md:px-8 lg:px-12 pointer-events-none">
        <div className="hidden lg:w-[50%] lg:block" />

        <div className="flex w-full flex-col lg:w-[50%] lg:pl-16">
          {steps.map((step, index) => (
            <StepBlock
              key={step.id}
              step={step}
              onVisible={() =>
                setActiveStepId(step.id)
              }
              isFirst={index === 0}
              isLast={index === steps.length - 1}
            />
          ))}
        </div>
      </div>
    </section>
  );
}


/* =============================================================
   CURRENCY ORBITAL SYSTEM (ANIMEJS V4 SCROLL SYNC)
   ============================================================= */

// Pseudo-3D orbital planes configuration
const PLANES = [
  { id: 1, tiltX: 70, tiltY: 20, speed: 18000, direction: 1, size: "inset-[5%]", border: "border-moss/40", symbols: [{ sym: "₹", color: "#84CC16", pos: "top" as const }, { sym: "$", color: "#22C55E", pos: "bottom" as const }] },
  { id: 2, tiltX: 65, tiltY: -45, speed: 22000, direction: -1, size: "inset-[2%]", border: "border-emerald-400/35 border-dashed", symbols: [{ sym: "₿", color: "#F59E0B", pos: "left" as const }, { sym: "£", color: "#22C55E", pos: "right" as const }] },
  { id: 3, tiltX: 75, tiltY: 75, speed: 25000, direction: 1, size: "inset-[12%]", border: "border-lime-300/25", symbols: [{ sym: "Ξ", color: "#BEF264", pos: "top" as const }, { sym: "₮", color: "#84CC16", pos: "left" as const }] },
  { id: 4, tiltX: 55, tiltY: -110, speed: 19000, direction: -1, size: "inset-[18%]", border: "border-blue-400/20", symbols: [{ sym: "€", color: "#3B82F6", pos: "bottom" as const }, { sym: "¥", color: "#F59E0B", pos: "right" as const }] },
  { id: 5, tiltX: 85, tiltY: 10, speed: 30000, direction: 1, size: "inset-[-5%]", border: "border-moss/10", symbols: [] },
];

const posClass = {
  top: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2",
  bottom: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2",
  left: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2",
  right: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2"
} as const;

const CurrencyOrb = () => {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!root.current) return;

    const animations: any[] = [];

    // Ambient slow rotation for the entire 3D structure
    animations.push(animate('.orb-body', {
      rotateY: [0, 360],
      rotateX: [0, 8],
      duration: 50000,
      loop: true,
      ease: "linear"
    }));

    // Planes & Symbols continuous rotation
    PLANES.forEach((plane) => {
      // The track spins
      animations.push(animate(`.plane-spin-${plane.id}`, {
        rotateZ: [0, 360 * plane.direction],
        duration: plane.speed,
        loop: true,
        ease: "linear"
      }));

      // The symbols counter-spin so they stay upright
      animations.push(animate(`.currency-counter-${plane.id}`, {
        rotateZ: [0, -360 * plane.direction],
        duration: plane.speed,
        loop: true,
        ease: "linear"
      }));
    });

    // Reactor core pulse
    animations.push(animate('.orb-core-outer', { scale: [1, 1.15, 1], opacity: [0.2, 0.5, 0.2], duration: 4000, loop: true, ease: "inOutSine" }));
    animations.push(animate('.orb-core-inner', { scale: [1, 0.9, 1], duration: 5000, loop: true, ease: "inOutSine" }));
    animations.push(animate('.orb-reactor', { scale: [1, 1.25, 1], duration: 3000, loop: true, ease: "inOutSine" }));

    // HUD elements
    animations.push(animate('.orb-hud', { rotateZ: [0, 360], duration: 100000, loop: true, ease: "linear" }));
    animations.push(animate('.orb-scanner', { rotateZ: [0, -360], duration: 80000, loop: true, ease: "linear" }));

    return () => {
      animations.forEach(anim => {
        if (anim && typeof anim.pause === 'function') anim.pause();
      });
    };
  }, []);

  return (
    <div
      ref={root}
      className="
        relative mx-auto flex h-[480px] w-[480px]
        max-w-full items-center justify-center
      "
      style={{ perspective: "1400px" }}
    >
      {/* =======================================================
          AMBIENT GLOW
      ======================================================= */}
      <div
        className="pointer-events-none absolute inset-[18%] rounded-full blur-[80px]"
        style={{ background: "radial-gradient(circle, rgba(132,204,22,.22), rgba(34,197,94,.08), transparent 70%)" }}
      />

      {/* =======================================================
          OUTER HUD
      ======================================================= */}
      <div className="orb-hud absolute inset-0">
        <svg viewBox="0 0 500 500" className="h-full w-full">
          {/* outer circles */}
          <circle cx="250" cy="250" r="238" fill="none" stroke="var(--surface-border)" strokeWidth="1" />
          <circle cx="250" cy="250" r="230" fill="none" stroke="var(--surface-border)" strokeWidth="1" opacity=".5" />
          <circle cx="250" cy="250" r="220" fill="none" stroke="#22C55E" strokeWidth="1" strokeDasharray="2 10" opacity=".35" />

          {/* TECHNICAL TICKS */}
          {Array.from({ length: 96 }).map((_, i) => {
            const deg = i * 3.75;
            const major = i % 8 === 0;
            const outer = polarToXY(250, 250, 226, deg);
            const inner = polarToXY(250, 250, major ? 210 : 217, deg);
            return (
              <line key={i} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="var(--surface-border)" strokeWidth={major ? 1.5 : 0.7} opacity={major ? 0.7 : 0.3} />
            );
          })}

          {/* COLORED SEGMENTS */}
          {DIAL_ARCS.map((arc, i) => (
            <path key={i} d={arcPath(250, 250, 238, arc.from, arc.to)} fill="none" stroke={arc.color} strokeWidth="5" strokeLinecap="round" opacity=".85" />
          ))}
        </svg>
      </div>

      {/* =======================================================
          SCANNER RING
      ======================================================= */}
      <div className="orb-scanner absolute inset-[7%]">
        <svg viewBox="0 0 500 500" className="h-full w-full">
          <circle cx="250" cy="250" r="207" fill="none" stroke="#84CC16" strokeWidth="1" strokeDasharray="1 14" opacity=".3" />
          <circle cx="250" cy="250" r="196" fill="none" stroke="var(--surface-border)" strokeWidth="1" opacity=".35" />
          <path d={arcPath(250, 250, 207, 15, 70)} fill="none" stroke="#84CC16" strokeWidth="2" />
          <path d={arcPath(250, 250, 207, 145, 200)} fill="none" stroke="#F59E0B" strokeWidth="2" />
          <path d={arcPath(250, 250, 207, 270, 315)} fill="none" stroke="#3B82F6" strokeWidth="2" />
        </svg>
      </div>

      {/* =======================================================
          CENTRAL ORBITAL MACHINE (3D)
      ======================================================= */}
      <div className="orb-body relative h-[330px] w-[330px]" style={{ transformStyle: "preserve-3d" }}>
        {PLANES.map((plane) => (
          <div key={plane.id} className="absolute inset-0" style={{ transformStyle: "preserve-3d", transform: `rotateX(${plane.tiltX}deg) rotateY(${plane.tiltY}deg)` }}>
            <div className={`plane-spin-${plane.id} absolute ${plane.size} rounded-full border ${plane.border}`} style={{ transformStyle: "preserve-3d" }}>
              {plane.symbols.map((sym, i) => (
                <div key={i} className={`absolute ${posClass[sym.pos]}`} style={{ transformStyle: "preserve-3d" }}>
                  <div className={`currency-counter-${plane.id}`} style={{ transformStyle: "preserve-3d" }}>
                    <div style={{ transform: `rotateY(${-plane.tiltY}deg) rotateX(${-plane.tiltX}deg)` }}>
                      <div className="relative flex h-9 w-9 items-center justify-center rounded-full border bg-background/90 backdrop-blur-md text-[11px] font-black" style={{ color: sym.color, borderColor: `${sym.color}66`, boxShadow: `0 0 14px ${sym.color}33` }}>
                        {sym.sym}
                        <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full" style={{ background: sym.color, boxShadow: `0 0 8px ${sym.color}` }} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* INNER CORE RINGS */}
        <div className="orb-core-outer absolute left-1/2 top-1/2 h-[145px] w-[145px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-moss/20" />
        <div className="orb-core-inner absolute left-1/2 top-1/2 h-[105px] w-[105px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-400/25" />
        <div className="absolute left-1/2 top-1/2 h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-lime-400/20" />

        {/* CORE GLOW */}
        <div className="absolute left-1/2 top-1/2 h-[75px] w-[75px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl bg-moss/20" />

        {/* REACTOR CORE */}
        <div
          className="orb-reactor absolute left-1/2 top-1/2 h-[34px] w-[34px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: "radial-gradient(circle, #ecfccb 0%, #84cc16 35%, #22c55e 65%, transparent 75%)", boxShadow: "0 0 22px rgba(132,204,22,.9), 0 0 70px rgba(34,197,94,.45)" }}
        />
        <div className="absolute left-1/2 top-1/2 h-[6px] w-[6px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
      </div>

      {/* =======================================================
          HUD MARKERS
      ======================================================= */}
      <div className="absolute left-[9%] top-[32%] flex items-center gap-2">
        <span className="h-px w-9 bg-moss/50" />
        <span className="font-mono text-[8px] text-moss/60">01</span>
      </div>
      <div className="absolute right-[9%] bottom-[31%] flex items-center gap-2">
        <span className="font-mono text-[8px] text-moss/60">FX</span>
        <span className="h-px w-9 bg-emerald-400/40" />
      </div>
      <div className="absolute right-[17%] top-[24%] h-2 w-2 rounded-full bg-moss shadow-[0_0_14px_rgba(132,204,22,.9)]" />
      <div className="absolute left-[17%] bottom-[24%] h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(34,197,94,.9)]" />
    </div>
  );
};

/* =============================================================
   SVG HELPERS
   ============================================================= */

const DIAL_ARCS = [
  { color: "#84CC16", from: 0, to: 70 },
  { color: "#F59E0B", from: 78, to: 130 },
  { color: "#22C55E", from: 150, to: 210 },
  { color: "#3B82F6", from: 225, to: 275 },
  { color: "#84CC16", from: 290, to: 350 },
];

function polarToXY(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  // Round to 3dp: Math.cos/sin may differ in the last ULP between the SSR
  // (Node) and client (browser) engines, which otherwise trips React
  // hydration on the generated SVG coordinate attributes.
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return { x: round(cx + r * Math.cos(rad)), y: round(cy + r * Math.sin(rad)) };
}

function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number) {
  const start = polarToXY(cx, cy, r, fromDeg);
  const end = polarToXY(cx, cy, r, toDeg);
  const largeArc = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/* =============================================================
   RIGHT SIDE STORY
   ============================================================= */

const StepStory = ({ step }: { step: MechanicsStep }) => {
  return (
    <div className="relative flex w-full max-w-xl flex-col justify-center min-h-[320px] sm:min-h-[400px]">
      <AnimatePresence mode="wait">
        <motion.div
          key={step.id}
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.97 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col justify-center"
        >
          <p className="mb-4 md:mb-6 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-moss">
            <span className="h-1.5 w-1.5 rounded-full bg-moss" />
            {step.eyebrow}
          </p>

          <h2 className="mb-6 md:mb-8 text-4xl font-black leading-tight tracking-tight text-foreground sm:text-5xl">
            {step.title}
          </h2>

          <p className="mb-8 md:mb-10 text-base leading-relaxed text-muted sm:text-lg">
            {step.description}
          </p>

          {step.features && step.features.length > 0 && (
            <div className="mb-10 md:mb-12 rounded-2xl border border-surface-border bg-surface/50 p-6 backdrop-blur-sm">
              <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
                {step.features.map((feature, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-moss" strokeWidth={2.2} />
                    <span className="text-[15px] font-medium leading-tight text-foreground">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

/* =============================================================
   SCROLL INTERSECTION OBSERVER
   ============================================================= */

const StepBlock = ({
  step,
  onVisible,
  isFirst,
  isLast,
}: {
  step: MechanicsStep;
  onVisible: () => void;
  isFirst: boolean;
  isLast: boolean;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { margin: "-40% 0px -40% 0px" });

  useEffect(() => {
    if (isInView) {
      onVisible();
    }
  }, [isInView, onVisible]);

  return (
    <div
      ref={ref}
      className={`
        flex min-h-[100vh] w-full flex-col justify-center
        ${isFirst ? "pt-[10vh]" : ""}
        ${isLast ? "pb-[15vh]" : ""}
      `}
    />
  );
};