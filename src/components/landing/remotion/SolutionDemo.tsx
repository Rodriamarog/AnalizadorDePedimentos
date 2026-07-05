import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { CheckCircle2, Loader2, MousePointer2, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SatComboBox } from "@/components/sat-combobox";

interface Row {
  sec: number;
  descripcion: string;
  fraccion: string;
  cantidad: number;
  precioUnitario: number;
  claveProdServ: string;
  claveProdServDesc: string;
  unitKey: string;
}

const TC = 18.42;

const RAW_ROWS: Omit<Row, "sec">[] = [
  { descripcion: "Enrutadores inalámbricos de red", fraccion: "8517.62.01", cantidad: 480, precioUnitario: 350.0, claveProdServ: "43222612", claveProdServDesc: "Equipo de radiocomunicación", unitKey: "H87" },
  { descripcion: "Empaques plásticos para exportación", fraccion: "3926.90.99", cantidad: 3200, precioUnitario: 20.0, claveProdServ: "24111503", claveProdServDesc: "Envases y empaques de plástico", unitKey: "KGM" },
  { descripcion: "Instrumental médico desechable", fraccion: "9018.90.99", cantidad: 150, precioUnitario: 750.0, claveProdServ: "42182200", claveProdServDesc: "Instrumental médico desechable", unitKey: "H87" },
  { descripcion: "Laptops para uso empresarial", fraccion: "8471.30.01", cantidad: 60, precioUnitario: 7000.0, claveProdServ: "43211508", claveProdServDesc: "Computadoras portátiles", unitKey: "H87" },
  { descripcion: "Monitores LED de 24 pulgadas", fraccion: "8528.52.01", cantidad: 140, precioUnitario: 1850.0, claveProdServ: "52161504", claveProdServDesc: "Monitores", unitKey: "H87" },
  { descripcion: "Cables USB tipo C", fraccion: "8544.42.01", cantidad: 5000, precioUnitario: 18.5, claveProdServ: "26121636", claveProdServDesc: "Cables de datos", unitKey: "H87" },
  { descripcion: "Baterías de litio para equipo portátil", fraccion: "8507.60.01", cantidad: 900, precioUnitario: 120.0, claveProdServ: "26111702", claveProdServDesc: "Baterías", unitKey: "H87" },
  { descripcion: "Fundas protectoras de silicón", fraccion: "3926.90.99", cantidad: 2600, precioUnitario: 32.0, claveProdServ: "24111503", claveProdServDesc: "Envases y empaques de plástico", unitKey: "H87" },
  { descripcion: "Adaptadores de corriente universal", fraccion: "8504.40.16", cantidad: 1800, precioUnitario: 95.0, claveProdServ: "39121500", claveProdServDesc: "Fuentes de poder", unitKey: "H87" },
  { descripcion: "Discos duros externos 1TB", fraccion: "8471.70.13", cantidad: 620, precioUnitario: 480.0, claveProdServ: "43201806", claveProdServDesc: "Discos duros", unitKey: "H87" },
  { descripcion: "Teclados inalámbricos", fraccion: "8471.60.01", cantidad: 1100, precioUnitario: 145.0, claveProdServ: "43211708", claveProdServDesc: "Teclados", unitKey: "H87" },
  { descripcion: "Bocinas portátiles Bluetooth", fraccion: "8518.21.01", cantidad: 780, precioUnitario: 260.0, claveProdServ: "52161522", claveProdServDesc: "Bocinas", unitKey: "H87" },
  { descripcion: "Cámaras de seguridad IP", fraccion: "8525.89.03", cantidad: 340, precioUnitario: 890.0, claveProdServ: "46171610", claveProdServDesc: "Cámaras de vigilancia", unitKey: "H87" },
  { descripcion: "Impresoras térmicas de etiquetas", fraccion: "8443.32.05", cantidad: 210, precioUnitario: 1650.0, claveProdServ: "44101706", claveProdServDesc: "Impresoras", unitKey: "H87" },
  { descripcion: "Lectores de código de barras", fraccion: "8471.90.99", cantidad: 430, precioUnitario: 380.0, claveProdServ: "46171612", claveProdServDesc: "Lectores ópticos", unitKey: "H87" },
  { descripcion: "Reguladores de voltaje", fraccion: "8504.40.99", cantidad: 560, precioUnitario: 210.0, claveProdServ: "39121500", claveProdServDesc: "Fuentes de poder", unitKey: "H87" },
  { descripcion: "Mochilas para equipo de cómputo", fraccion: "4202.12.01", cantidad: 950, precioUnitario: 165.0, claveProdServ: "53131608", claveProdServDesc: "Bolsas y mochilas", unitKey: "H87" },
  { descripcion: "Memorias USB de alta velocidad", fraccion: "8523.51.01", cantidad: 4200, precioUnitario: 65.0, claveProdServ: "43201803", claveProdServDesc: "Memorias de almacenamiento", unitKey: "H87" },
];

const ROWS: Row[] = RAW_ROWS.map((r, i) => ({ sec: i + 1, ...r }));

function valAduana(row: Row) {
  return Math.round(row.precioUnitario * row.cantidad);
}

const TOTAL_MXN = ROWS.reduce((sum, r) => sum + valAduana(r), 0);

// Frame timeline (30fps). The upload card fully disappears before the table
// takes over the whole content area — the document is never shown again
// after this point.
const DROPZONE_IN_DUR = 8;
const FILE_IN_START = 6;
const FILE_IN_DUR = 8;
const SPIN_START = 14;
const DONE_START = 30;
const DONE_DUR = 6;
const UPLOAD_OUT_START = 36;
const UPLOAD_OUT_DUR = 10;

const TABLE_IN_START = 34;
const TABLE_IN_DUR = 14;
const ROW_START = 44;
const ROW_GAP = 3;
const ROW_SETTLE = 6;

const badgeDoneStart = ROW_START + (ROWS.length - 1) * ROW_GAP + ROW_SETTLE + 4;
const BADGE_DONE_DUR = 8;

const CURSOR_START = badgeDoneStart + 10;
const CURSOR_DUR = 14;
const CLICK_AT = CURSOR_START + CURSOR_DUR;
const CLICK_DUR = 10;
const COLLAPSE_START = CLICK_AT + 4;
const COLLAPSE_DUR = 16;
const SUMMARY_START = COLLAPSE_START + 8;
const SUMMARY_DUR = 16;
const STAMP_START = SUMMARY_START + 14;
const STAMP_DUR = 16;

export const SOLUTION_DEMO_FPS = 30;
export const SOLUTION_DEMO_DURATION = STAMP_START + STAMP_DUR + 26;

const EASE = Easing.bezier(0.22, 1, 0.36, 1);

function progress(frame: number, start: number, dur: number) {
  return interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
}

// The Facturar button sits in a fixed-width slot at the end of the toolbar
// row (28px content padding, 180px badge + 10px gap + 110px button slot,
// right-aligned) so its on-screen center is deterministic — the cursor
// targets this same point instead of a guessed coordinate.
const CONTENT_PADDING = 28;
const TOOLBAR_HEIGHT = 32;
const BUTTON_SLOT_WIDTH = 110;
const CONTENT_WIDTH = 1600;
const toolbarRight = CONTENT_WIDTH - CONTENT_PADDING;
const BUTTON_CENTER = {
  x: toolbarRight - BUTTON_SLOT_WIDTH / 2,
  y: CONTENT_PADDING + TOOLBAR_HEIGHT / 2,
};

const COLUMNS = [
  { key: "sec", label: "Partida", align: "left" as const },
  { key: "descripcion", label: "Descripción", align: "left" as const },
  { key: "valAduana", label: "Val. Aduana", align: "right" as const },
  { key: "cantidad", label: "Piezas", align: "right" as const },
  { key: "tc", label: "T.C.", align: "right" as const },
  { key: "puUsd", label: "P.U USD", align: "right" as const },
  { key: "valorDlls", label: "Valor Dlls", align: "right" as const },
  { key: "puMn", label: "P.U MN", align: "right" as const },
  { key: "claveProdServ", label: "ClaveProdServ", align: "left" as const },
  { key: "unitKey", label: "Unidad", align: "left" as const },
];

export function SolutionDemo() {
  const frame = useCurrentFrame();

  const dropzoneIn = progress(frame, 0, DROPZONE_IN_DUR);
  const fileIn = progress(frame, FILE_IN_START, FILE_IN_DUR);
  const spinning = frame >= SPIN_START && frame < DONE_START;
  const done = frame >= DONE_START;
  const doneIn = progress(frame, DONE_START, DONE_DUR);
  const uploadOut = progress(frame, UPLOAD_OUT_START, UPLOAD_OUT_DUR);
  const uploadVisible = frame < UPLOAD_OUT_START + UPLOAD_OUT_DUR;

  const tableIn = progress(frame, TABLE_IN_START, TABLE_IN_DUR);

  const badgeDone = progress(frame, badgeDoneStart, BADGE_DONE_DUR);

  const cursorMove = progress(frame, CURSOR_START, CURSOR_DUR);
  const cursorVisible = frame >= CURSOR_START && frame < CLICK_AT + CLICK_DUR + 6;
  const clicked = frame >= CLICK_AT;
  const clickPulse = progress(frame, CLICK_AT, CLICK_DUR);
  const buttonPress = interpolate(
    frame,
    [CLICK_AT - 2, CLICK_AT + 3, CLICK_AT + 9],
    [1, 0.93, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const collapse = progress(frame, COLLAPSE_START, COLLAPSE_DUR);
  const summaryIn = progress(frame, SUMMARY_START, SUMMARY_DUR);

  const stampT = progress(frame, STAMP_START, STAMP_DUR);
  const stampScale = interpolate(stampT, [0, 0.55, 0.8, 1], [1.5, 1.12, 0.97, 1]);
  const stampRotate = interpolate(stampT, [0, 1], [-14, -4]);
  const stampOpacity = interpolate(frame, [STAMP_START, STAMP_START + 6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: "var(--card)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          height: 56,
          padding: "0 28px",
          borderBottom: "1px solid var(--border)",
          background: "oklch(0.114 0.024 264)",
          flexShrink: 0,
        }}
      >
        <span style={{ fontFamily: "var(--font-sans)", fontWeight: 900, color: "white", fontSize: 20, letterSpacing: -0.5 }}>
          NEUROCROW
        </span>
        <span style={{ color: "var(--muted-foreground)", fontSize: 13, fontFamily: "var(--font-mono)" }}>
          pedimento 25 47 3891 7000123
        </span>
      </div>

      <div style={{ position: "relative", flex: 1 }}>
        {/* Phase 1: upload, centered in the content area */}
        {uploadVisible && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: dropzoneIn * (1 - uploadOut),
              scale: interpolate(dropzoneIn, [0, 1], [0.92, 1]) * interpolate(uploadOut, [0, 1], [1, 0.9]),
            }}
          >
            <div
              style={{
                width: 460,
                borderRadius: 24,
                border: "2px dashed var(--border)",
                background: "var(--muted)",
                padding: "40px 32px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 24,
              }}
            >
              <div
                style={{
                  opacity: fileIn,
                  translate: `0 ${interpolate(fileIn, [0, 1], [-16, 0])}px`,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "white",
                  boxShadow: "0 4px 16px -6px rgba(0,0,0,0.15)",
                }}
              >
                <div style={{ position: "relative", width: 34, height: 44, flexShrink: 0 }}>
                  <Img
                    src={staticFile("marketing/pedimento-partidas.png")}
                    style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 3, border: "1px solid var(--border)" }}
                  />
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--foreground)", flex: 1 }}>
                  6000505.pdf
                </span>
                {!done ? (
                  spinning && <Loader2 width={20} height={20} style={{ color: "var(--primary)", transform: `rotate(${(frame * 14) % 360}deg)` }} />
                ) : (
                  <span style={{ opacity: doneIn, scale: interpolate(doneIn, [0, 1], [0.6, 1]) }}>
                    <CheckCircle2 width={20} height={20} style={{ color: "oklch(0.6 0.15 155)" }} />
                  </span>
                )}
              </div>

              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  padding: "6px 16px",
                  borderRadius: 999,
                  background: done
                    ? "color-mix(in oklch, oklch(0.6 0.15 155) 15%, transparent)"
                    : "color-mix(in oklch, var(--primary) 12%, transparent)",
                  color: done ? "oklch(0.45 0.13 155)" : "var(--primary)",
                }}
              >
                {done ? "Pedimento analizado" : "Subiendo y analizando…"}
              </span>
            </div>
          </div>
        )}

        {/* Phase 2: toolbar + full-width partidas table */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            padding: 28,
            display: "flex",
            flexDirection: "column",
            gap: 14,
            opacity: tableIn,
            translate: `0 ${interpolate(tableIn, [0, 1], [16, 0])}px`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {["Todas", "Con incrementables", "Sin incrementables"].map((label, i) => (
                <span
                  key={label}
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 12,
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: i === 0 ? "var(--primary)" : "transparent",
                    color: i === 0 ? "var(--primary-foreground)" : "var(--muted-foreground)",
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  padding: "6px 14px",
                  borderRadius: 999,
                  minWidth: 180,
                  textAlign: "center",
                  background: badgeDone > 0.5
                    ? "color-mix(in oklch, oklch(0.6 0.15 155) 15%, transparent)"
                    : "color-mix(in oklch, var(--primary) 12%, transparent)",
                  color: badgeDone > 0.5 ? "oklch(0.45 0.13 155)" : "var(--primary)",
                }}
              >
                {badgeDone > 0.5 ? `${ROWS.length} partidas mapeadas` : "Analizando…"}
              </span>
              <div style={{ width: 110, display: "flex", justifyContent: "center", scale: buttonPress }}>
                <Button id="facturar-btn" className="gap-1.5">
                  <Receipt width={14} height={14} />
                  Facturar
                </Button>
              </div>
            </div>
          </div>

          <div
            style={{
              flex: 1,
              borderRadius: 12,
              border: "1px solid var(--border)",
              overflow: "hidden",
              opacity: 1 - collapse,
              scale: interpolate(collapse, [0, 1], [1, 0.96]),
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      style={{
                        textAlign: col.align,
                        padding: "8px 12px",
                        color: "var(--muted-foreground)",
                        fontWeight: 600,
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: 0.4,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row, i) => {
                  const rowStart = ROW_START + i * ROW_GAP;
                  const rowIn = progress(frame, rowStart, ROW_SETTLE);
                  const puMn = row.precioUnitario;
                  const puUsd = puMn / TC;
                  const va = valAduana(row);
                  const valorDlls = va / TC;
                  return (
                    <tr
                      key={row.fraccion + row.sec}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        opacity: rowIn,
                        translate: `${interpolate(rowIn, [0, 1], [-10, 0])}px 0`,
                      }}
                    >
                      <td style={{ padding: "5px 12px", color: "var(--muted-foreground)" }}>{row.sec}</td>
                      <td style={{ padding: "5px 12px", color: "var(--foreground)", whiteSpace: "nowrap" }}>{row.descripcion}</td>
                      <td style={{ padding: "5px 12px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--foreground)", whiteSpace: "nowrap" }}>
                        ${va.toLocaleString()}
                      </td>
                      <td style={{ padding: "5px 12px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
                        {row.cantidad.toLocaleString()}
                      </td>
                      <td style={{ padding: "5px 12px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
                        {TC.toFixed(5)}
                      </td>
                      <td style={{ padding: "5px 12px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
                        ${puUsd.toFixed(5)}
                      </td>
                      <td style={{ padding: "5px 12px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
                        ${valorDlls.toFixed(2)}
                      </td>
                      <td style={{ padding: "5px 12px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--foreground)", whiteSpace: "nowrap" }}>
                        ${puMn.toFixed(5)}
                      </td>
                      <td style={{ padding: "5px 12px" }}>
                        <SatComboBox
                          endpoint="/api/catalogs/products"
                          value={row.claveProdServ}
                          description={row.claveProdServDesc}
                          mapped
                          hideDescription
                          onSelect={() => {}}
                        />
                      </td>
                      <td style={{ padding: "5px 12px" }}>
                        <SatComboBox
                          endpoint="/api/catalogs/units"
                          value={row.unitKey}
                          description={null}
                          mapped
                          hideDescription
                          onSelect={() => {}}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Factura summary, replaces the table in the same content area */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: summaryIn,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                position: "relative",
                width: 420,
                borderRadius: 16,
                background: "white",
                boxShadow: "0 30px 80px -20px rgba(0,0,0,0.35)",
                padding: 24,
                scale: interpolate(summaryIn, [0, 1], [0.9, 1]),
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13, color: "oklch(0.2 0.02 264)" }}>FACTURA</span>
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">Lista para timbrar</Badge>
              </div>
              <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--muted-foreground)" }}>
                <span>Partidas</span>
                <span style={{ fontFamily: "var(--font-mono)", color: "oklch(0.2 0.02 264)" }}>{ROWS.length}</span>
              </div>
              <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 700 }}>
                <span style={{ color: "oklch(0.2 0.02 264)" }}>Total</span>
                <span style={{ fontFamily: "var(--font-mono)", color: "oklch(0.2 0.02 264)" }}>${TOTAL_MXN.toLocaleString()}</span>
              </div>

              <div
                style={{
                  position: "absolute",
                  top: -18,
                  right: -18,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "2px solid var(--primary)",
                  background: "white",
                  color: "var(--primary)",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 800,
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  opacity: stampOpacity,
                  rotate: `${stampRotate}deg`,
                  scale: stampScale,
                }}
              >
                <CheckCircle2 width={14} height={14} />
                Timbrada
              </div>
            </div>
          </div>
        </div>

        {/* Cursor flying to the Facturar button */}
        {cursorVisible && (
          <div
            style={{
              position: "absolute",
              left: interpolate(cursorMove, [0, 1], [BUTTON_CENTER.x - 260, BUTTON_CENTER.x + 4]),
              top: interpolate(cursorMove, [0, 1], [BUTTON_CENTER.y + 220, BUTTON_CENTER.y + 4]),
              filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))",
            }}
          >
            <MousePointer2 width={26} height={26} className="text-foreground" fill="white" />
          </div>
        )}
        {clicked && frame < CLICK_AT + 16 && (
          <div
            style={{
              position: "absolute",
              left: BUTTON_CENTER.x - 12,
              top: BUTTON_CENTER.y - 12,
              width: 24,
              height: 24,
              borderRadius: 9999,
              border: "2px solid var(--primary)",
              opacity: 1 - clickPulse,
              scale: 1 + clickPulse * 1.4,
            }}
          />
        )}
      </div>
    </AbsoluteFill>
  );
}
