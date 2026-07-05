"use client";

import { useEffect, useRef } from "react";

// A geometric guardian, not an illustration: three flat shapes (body, one
// wing, a beak) plus two eyes whose pupils track the cursor across the
// whole page — it "watches" the visitor the way a customs officer eyes a
// stack of paperwork. Pupils are moved by directly mutating transforms in
// a mousemove handler (no React state) so tracking doesn't cause re-renders.
const MAX_PUPIL_OFFSET = 2.4;

export function CrowMascot({ className = "" }: { className?: string }) {
  const leftPupilRef = useRef<SVGCircleElement>(null);
  const rightPupilRef = useRef<SVGCircleElement>(null);
  const eyesGroupRef = useRef<SVGGElement>(null);

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
    >
      {/* wing, tucked behind the body */}
      <path d="M62 40 L94 30 L80 58 L58 54 Z" fill="oklch(0.178 0.024 264)" />
      {/* body */}
      <path
        d="M50 8
           C74 8 86 28 84 48
           C82 68 66 84 48 84
           C28 84 14 66 14 46
           C14 24 28 8 50 8 Z"
        fill="oklch(0.114 0.024 264)"
      />
      {/* beak */}
      <path d="M16 44 L3 50 L16 57 Z" fill="oklch(0.114 0.024 264)" />
      {/* eyes */}
      <g ref={eyesGroupRef}>
        <circle cx="38" cy="42" r="10" fill="white" />
        <circle cx="62" cy="42" r="10" fill="white" />
        <circle ref={leftPupilRef} cx="38" cy="42" r="4.5" fill="oklch(0.114 0.024 264)" />
        <circle ref={rightPupilRef} cx="62" cy="42" r="4.5" fill="oklch(0.114 0.024 264)" />
      </g>
    </svg>
  );
}
