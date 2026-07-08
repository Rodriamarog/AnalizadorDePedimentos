"use client";

import { useEffect, useId, useRef } from "react";

// A low-poly geometric guardian, not an illustration: faceted head, folded
// wings and a two-tone beak, built from flat polygons only (no gradients).
// Two eyes whose pupils track the cursor across the whole page — it
// "watches" the visitor the way a customs officer eyes a stack of
// paperwork. Pupils are moved by directly mutating transforms in a
// pointermove handler (no React state) so tracking doesn't cause re-renders;
// each pupil is clipped to its eye's wedge shape so it can't slide past the
// brow while it moves.
const MAX_PUPIL_OFFSET = 2.4;

const INK = "oklch(0.114 0.024 264)";
const INK_MID = "oklch(0.16 0.024 264)";
const INK_LIGHT = "oklch(0.22 0.022 264)";
const INK_HIGHLIGHT = "oklch(0.32 0.02 264)";
const ACCENT = "oklch(0.68 0.199 48)";

const LEFT_EYE_POINTS = "26,41 46,46 42,54 30,58 20,50";
const RIGHT_EYE_POINTS = "74,41 54,46 58,54 70,58 80,50";

export function CrowMascot({ className = "" }: { className?: string }) {
  const leftPupilRef = useRef<SVGCircleElement>(null);
  const rightPupilRef = useRef<SVGCircleElement>(null);
  const eyesGroupRef = useRef<SVGGElement>(null);
  const uid = useId();
  const leftClipId = `${uid}-eye-left`;
  const rightClipId = `${uid}-eye-right`;

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    function handlePointerMove(e: PointerEvent) {
      const group = eyesGroupRef.current;
      if (!group) return;
      const rect = group.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy) || 1;
      const ox = (dx / dist) * Math.min(MAX_PUPIL_OFFSET, dist / 20);
      const oy = (dy / dist) * Math.min(MAX_PUPIL_OFFSET, dist / 20);
      const transform = `translate(${ox.toFixed(2)}px, ${oy.toFixed(2)}px)`;
      if (leftPupilRef.current) leftPupilRef.current.style.transform = transform;
      if (rightPupilRef.current) rightPupilRef.current.style.transform = transform;
    }

    window.addEventListener("pointermove", handlePointerMove);
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, []);

  return (
    <svg
      viewBox="0 0 100 92"
      className={className}
      role="img"
      aria-label="Cuervo guardián de Neurocrow"
      style={{
        filter:
          "drop-shadow(0 0 1.5px oklch(0.68 0.199 48 / 0.7)) drop-shadow(0 2px 6px rgba(0,0,0,0.5))",
      }}
    >
      <defs>
        <clipPath id={leftClipId}>
          <polygon points={LEFT_EYE_POINTS} />
        </clipPath>
        <clipPath id={rightClipId}>
          <polygon points={RIGHT_EYE_POINTS} />
        </clipPath>
      </defs>

      {/* folded wings/shoulders, sit behind everything */}
      <path d="M14 50 L30 60 L36 92 L10 86 L4 66 Z" fill={INK_LIGHT} stroke={ACCENT} strokeOpacity={0.35} strokeWidth={0.6} />
      <path d="M86 50 L70 60 L64 92 L90 86 L96 66 Z" fill={INK_LIGHT} stroke={ACCENT} strokeOpacity={0.35} strokeWidth={0.6} />

      {/* chest, beneath the head */}
      <path d="M36 60 L50 66 L64 60 L60 92 L40 92 Z" fill={INK} stroke={ACCENT} strokeOpacity={0.35} strokeWidth={0.6} />

      {/* crest, swept feather tufts */}
      <path d="M38 22 L46 2 L56 20 Z" fill={INK} stroke={ACCENT} strokeOpacity={0.35} strokeWidth={0.6} />
      <path d="M48 20 L58 4 L64 18 Z" fill={INK_LIGHT} stroke={ACCENT} strokeOpacity={0.35} strokeWidth={0.6} />

      {/* head */}
      <path
        d="M26 26 L50 14 L74 26 L80 46 L70 60 L50 66 L30 60 L20 46 Z"
        fill={INK}
        stroke={ACCENT}
        strokeOpacity={0.35}
        strokeWidth={0.6}
      />
      {/* head highlight facet */}
      <path d="M26 26 L50 14 L44 34 Z" fill={INK_HIGHLIGHT} />

      {/* eyes: wedge-shaped sclera flush with the brow, pupils clipped so they
          stay inside the wedge while tracking the cursor */}
      <g ref={eyesGroupRef}>
        <polygon points={LEFT_EYE_POINTS} fill="white" />
        <polygon points={RIGHT_EYE_POINTS} fill="white" />
        <g clipPath={`url(#${leftClipId})`}>
          <circle ref={leftPupilRef} cx="33" cy="49" r="5" fill={INK} />
        </g>
        <g clipPath={`url(#${rightClipId})`}>
          <circle ref={rightPupilRef} cx="67" cy="49" r="5" fill={INK} />
        </g>
      </g>

      {/* brow ridge, gives the eyes a fierce, hooded look */}
      <path d="M26 32 L48 38 L46 46 L26 41 Z" fill={INK} />
      <path d="M74 32 L52 38 L54 46 L74 41 Z" fill={INK} />

      {/* beak, two-tone so it reads clearly against the head */}
      <path d="M40 50 L50 72 L60 50 L50 44 Z" fill={INK_LIGHT} stroke={ACCENT} strokeOpacity={0.35} strokeWidth={0.6} />
      <path d="M46 58 L50 72 L54 58 L50 63 Z" fill={INK_HIGHLIGHT} />
    </svg>
  );
}
