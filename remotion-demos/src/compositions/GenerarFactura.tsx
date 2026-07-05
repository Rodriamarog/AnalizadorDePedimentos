import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { MousePointer2 } from "lucide-react";
import { FacturaDialogPreview } from "./FacturaDialogPreview";

// Approximate on-screen position of the "Timbrar factura" button at
// 1920x1080 — close enough for a demo cursor, not pixel-perfect hit-testing.
const CURSOR_START = { x: 1500, y: 200 };
const CURSOR_TARGET = { x: 1660, y: 790 };

export function GenerarFactura() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cursorMove = interpolate(frame, [10, 70], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const eased = 1 - Math.pow(1 - cursorMove, 3);
  const cursorX = CURSOR_START.x + (CURSOR_TARGET.x - CURSOR_START.x) * eased;
  const cursorY = CURSOR_START.y + (CURSOR_TARGET.y - CURSOR_START.y) * eased;

  const clickPulse = spring({ frame: frame - 74, fps, config: { damping: 10 } });
  const clicked = frame >= 74;
  const saving = frame >= 74 && frame < 150;
  const saved = frame >= 150;

  return (
    <AbsoluteFill style={{ background: "oklch(0.114 0.024 264)" }}>
      <FacturaDialogPreview saving={saving} saved={saved} />

      {!clicked && (
        <div
          style={{
            position: "absolute",
            left: cursorX,
            top: cursorY,
            transform: "translate(-4px, -4px)",
            filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.5))",
          }}
        >
          <MousePointer2 className="w-8 h-8 text-white fill-white" />
        </div>
      )}
      {clicked && frame < 100 && (
        <div
          style={{
            position: "absolute",
            left: CURSOR_TARGET.x - 20,
            top: CURSOR_TARGET.y - 20,
            width: 40,
            height: 40,
            borderRadius: "9999px",
            border: "2px solid white",
            opacity: 1 - clickPulse,
            transform: `scale(${1 + clickPulse * 1.5})`,
          }}
        />
      )}
    </AbsoluteFill>
  );
}
