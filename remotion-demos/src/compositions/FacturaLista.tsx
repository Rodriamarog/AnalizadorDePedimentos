import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FAKE_FACTURA } from "../fixtures";
import { Stage, AppTopBar } from "./Stage";

export function FacturaLista() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Stamp-drop entrance mirroring the real app's .nc-stamp-drop keyframe:
  // scale(1.5) rotate(-10deg) opacity 0 -> settle at scale(1) rotate(-2deg).
  const stamp = spring({ frame, fps, config: { damping: 11, stiffness: 140 } });
  const scale = interpolate(stamp, [0, 1], [1.5, 1]);
  const rotate = interpolate(stamp, [0, 1], [-10, -2]);
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const detailsIn = interpolate(frame, [20, 45], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const currency = FAKE_FACTURA.total.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
  });

  return (
    <AbsoluteFill>
      <Stage>
        <div className="flex flex-col h-full">
          <AppTopBar title="Facturas" />

          <div className="flex-1 flex flex-col items-center justify-center gap-8">
            <div style={{ opacity, transform: `scale(${scale}) rotate(${rotate}deg)` }}>
              <div className="flex flex-col items-center gap-3">
                <CheckCircle2 className="w-20 h-20" style={{ color: "oklch(0.6 0.15 155)" }} />
                <p className="text-2xl font-semibold text-foreground">Factura timbrada exitosamente</p>
              </div>
            </div>

            <div style={{ opacity: detailsIn, transform: `translateY(${(1 - detailsIn) * 12}px)` }}>
              <Card className="w-[640px]">
                <CardContent className="flex flex-col gap-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm text-muted-foreground">Folio {FAKE_FACTURA.folio}</span>
                    <div className="flex gap-2">
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">Válida</Badge>
                      <Badge variant="outline">{FAKE_FACTURA.metodoPago}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-foreground">{FAKE_FACTURA.cliente}</p>
                      <p className="text-xs text-muted-foreground font-mono">{FAKE_FACTURA.rfc}</p>
                    </div>
                    <p className="text-xl font-semibold text-foreground">{currency}</p>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
                    <span>{FAKE_FACTURA.fecha}</span>
                    <span className="font-mono">{FAKE_FACTURA.uuid}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </Stage>
    </AbsoluteFill>
  );
}
