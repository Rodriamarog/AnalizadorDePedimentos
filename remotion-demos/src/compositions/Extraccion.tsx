import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SatComboBox } from "@/components/sat-combobox";
import { FAKE_PARTIDAS } from "../fixtures";
import { Stage, AppTopBar } from "./Stage";

const ROW_START = 25; // first row reveal frame
const ROW_GAP = 32; // frames between each row appearing

export function Extraccion() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const allRevealed = frame >= ROW_START + (FAKE_PARTIDAS.length - 1) * ROW_GAP + 20;

  return (
    <AbsoluteFill>
      <Stage>
        <div className="flex flex-col h-full">
          <AppTopBar title="Pedimento 25 47 3891 7000123" />

          <div className="flex-1 flex flex-col px-10 py-8 gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-foreground">Partidas</h2>
              <div
                className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium"
                style={{
                  background: allRevealed
                    ? "color-mix(in oklch, oklch(0.6 0.15 155) 15%, transparent)"
                    : "color-mix(in oklch, var(--primary) 12%, transparent)",
                  color: allRevealed ? "oklch(0.45 0.13 155)" : "var(--primary)",
                  opacity: interpolate(frame, [0, 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
                }}
              >
                <Sparkles className="w-4 h-4" />
                {allRevealed
                  ? `${FAKE_PARTIDAS.length} partidas mapeadas automáticamente`
                  : "IA analizando fracciones arancelarias…"}
              </div>
            </div>

            <div className="flex-1 rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border" style={{ background: "var(--muted)" }}>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Fracción</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Descripción</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Valor Dlls</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground w-56">ClaveProdServ</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground w-28">Unidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {FAKE_PARTIDAS.map((p, i) => {
                    const rowFrame = ROW_START + i * ROW_GAP;
                    const localFrame = frame - rowFrame;
                    if (localFrame < 0) return null;

                    const rowIn = spring({ frame: localFrame, fps, config: { damping: 16 } });
                    const claveIn = interpolate(localFrame, [10, 22], [0, 1], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    });
                    const badgeIn = spring({ frame: localFrame - 18, fps, config: { damping: 12 } });

                    return (
                      <tr
                        key={p.fraccion}
                        style={{
                          opacity: rowIn,
                          transform: `translateX(${(1 - rowIn) * -24}px)`,
                          background: p.tieneIncrementables ? "color-mix(in oklch, oklch(0.75 0.15 80) 12%, transparent)" : undefined,
                        }}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-foreground">{p.fraccion}</td>
                        <td className="px-4 py-3 text-foreground">{p.descripcion}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-foreground">
                          ${p.valAduana.toLocaleString("es-MX")}
                        </td>
                        <td className="px-4 py-3">
                          <div style={{ opacity: claveIn }} className="flex items-center gap-1.5">
                            <SatComboBox
                              endpoint="/api/catalogs/products"
                              value={p.claveProdServ}
                              description={p.descripcionSat}
                              mapped
                              confidence={p.confidence}
                              hideDescription
                              onSelect={() => {}}
                            />
                            {p.confidence && (
                              <span style={{ opacity: badgeIn, transform: `scale(${0.7 + badgeIn * 0.3})` }}>
                                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-[10px]">
                                  IA
                                </Badge>
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div style={{ opacity: claveIn }}>
                            <SatComboBox
                              endpoint="/api/catalogs/units"
                              value={p.unitKey}
                              mapped
                              hideDescription
                              onSelect={() => {}}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Stage>
    </AbsoluteFill>
  );
}
