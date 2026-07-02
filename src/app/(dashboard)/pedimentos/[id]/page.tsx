"use client";

import { useCallback, useEffect, useMemo, useRef, useState, use } from "react";
import { ArrowLeft, FileText, Sparkles, Loader2, Download, Receipt } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SatComboBox } from "@/components/sat-combobox";
import { CrearFacturaDialog } from "@/components/crear-factura-dialog";
import { fetchCatalogDescriptions } from "@/lib/fetchCatalogDescriptions";
import { alertError, alertInfo, alertSuccess } from "@/lib/alerts";

const AUTOMAP_MESSAGES = [
  "Iniciando análisis…",
  "Buscando claves SAT…",
  "Consultando catálogo…",
  "La IA está pensando…",
  "Verificando resultados…",
  "Refinando búsqueda…",
  "Casi listo…",
];

// Stepped progress simulation matching the old app's timing — automap calls
// a real LLM and can take up to ~2 minutes, so this gives the user a sense of
// motion without pretending to track real progress.
const AUTOMAP_STEPS: Array<[number, number]> = [
  [400, 8],
  [3000, 22],
  [8000, 40],
  [18000, 55],
  [32000, 67],
  [50000, 77],
  [68000, 84],
  [85000, 88],
];

interface Partida {
  id: string;
  sec: number;
  fraccion: string;
  descripcion: string;
  cantidad: number;
  valAduana: number;
  valComercial: number;
  precioUnitario: number;
  tieneIncrementables: boolean;
  umc: string | null;
}

interface PedimentoDetail {
  id: string;
  pedimentoNum: string;
  importador: string;
  tipoCambio: number;
  pdfFilename: string;
  fechaUpload: string;
  dta: number | null;
  igi: number | null;
  prv: number | null;
  partidas: Partida[];
}

type Filter = "all" | "inc" | "no";

interface Producto {
  fraccion: string;
  descripcion: string;
  claveProdServ: string;
  descripcionSat: string | null;
  unitKey: string;
  confidence: string | null;
}

export default function PedimentoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<PedimentoDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [productosMap, setProductosMap] = useState<Record<string, Producto>>({});
  const [unitDescMap, setUnitDescMap] = useState<Record<string, string>>({});

  const [automapRunning, setAutomapRunning] = useState(false);
  const [automapProgress, setAutomapProgress] = useState(0);
  const [automapStatusText, setAutomapStatusText] = useState(AUTOMAP_MESSAGES[0]);
  const [automapDone, setAutomapDone] = useState<"success" | "error" | null>(null);
  const automapTimers = useRef<Array<ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>>>([]);

  const loadProductos = useCallback(async () => {
    const res = await fetch("/api/productos");
    if (!res.ok) return;
    const rows: Producto[] = await res.json();
    setProductosMap(Object.fromEntries(rows.map((p) => [p.fraccion, p])));
    // Batched, deduped by unique unit_key (same strategy as the old app's
    // unitDescMap) instead of letting each row's SatComboBox self-resolve
    // its own description on mount — that would fire one fetch per row.
    const descs = await fetchCatalogDescriptions("/api/catalogs/units", rows.map((p) => p.unitKey));
    setUnitDescMap((prev) => ({ ...prev, ...descs }));
  }, []);

  useEffect(() => {
    fetch(`/api/pedimentos/${id}`).then(async (res) => {
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      setData(await res.json());
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProductos();
  }, [id, loadProductos]);

  const saveMapping = useCallback(
    async (
      fraccion: string,
      descripcionPartida: string,
      patch: { claveProdServ?: string; descripcionSat?: string; unitKey?: string }
    ) => {
      const existing = productosMap[fraccion];
      const method = existing ? "PUT" : "POST";
      const url = existing ? `/api/productos/${fraccion}` : "/api/productos";
      const body = {
        fraccion,
        descripcion: descripcionPartida,
        clave_prod_serv: patch.claveProdServ ?? existing?.claveProdServ ?? "",
        descripcion_sat: patch.descripcionSat ?? existing?.descripcionSat ?? null,
        unit_key: patch.unitKey ?? existing?.unitKey ?? "H87",
        // A manual edit means we no longer trust an earlier automap confidence score.
        confidence: null,
      };
      if (!body.clave_prod_serv) return;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const saved = await res.json();
        setProductosMap((prev) => ({ ...prev, [fraccion]: saved }));
      }
    },
    [productosMap]
  );

  function clearAutomapTimers() {
    automapTimers.current.forEach((t) => {
      clearTimeout(t as ReturnType<typeof setTimeout>);
      clearInterval(t as ReturnType<typeof setInterval>);
    });
    automapTimers.current = [];
  }

  function showAutomapOverlay() {
    clearAutomapTimers();
    setAutomapDone(null);
    setAutomapProgress(0);
    setAutomapStatusText(AUTOMAP_MESSAGES[0]);
    setAutomapRunning(true);

    AUTOMAP_STEPS.forEach(([delay, pct]) => {
      automapTimers.current.push(setTimeout(() => setAutomapProgress(pct), delay));
    });

    let msgIdx = 0;
    automapTimers.current.push(
      setInterval(() => {
        msgIdx = (msgIdx + 1) % AUTOMAP_MESSAGES.length;
        setAutomapStatusText(AUTOMAP_MESSAGES[msgIdx]);
      }, 5000)
    );
  }

  function hideAutomapOverlay(success: boolean) {
    clearAutomapTimers();
    setAutomapProgress(100);
    setAutomapDone(success ? "success" : "error");
    setTimeout(() => setAutomapRunning(false), 700);
  }

  const [exporting, setExporting] = useState(false);
  const [facturarOpen, setFacturarOpen] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`/api/pedimentos/${id}/export`);
      if (!res.ok) {
        alertError("Error", "No se pudo exportar el pedimento");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="(.+)"/);
      const filename = match ? match[1] : `pedimento_${data?.pedimentoNum ?? id}.xlsx`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setExporting(false);
    }
  }

  async function handleAutomap() {
    showAutomapOverlay();
    try {
      const res = await fetch(`/api/pedimentos/${id}/automap`, { method: "POST" });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Error al automapear");

      hideAutomapOverlay(true);
      await loadProductos();

      if (resData.message) {
        alertInfo("Autocompletar SAT", resData.message);
      } else {
        const medium = (resData.results ?? []).filter((r: { confidence?: string }) => r.confidence === "medium").length;
        const low = (resData.results ?? []).filter((r: { confidence?: string }) => r.confidence === "low").length;
        const skipped = resData.skipped ?? 0;
        let msg = `${resData.mapped} fracciones mapeadas.`;
        if (medium) msg += `\n⚠ ${medium} requieren revisión (amarillo).`;
        if (low) msg += `\n✕ ${low} son aproximadas — verificar (rojo).`;
        if (skipped) msg += `\n${skipped} sin código en el catálogo.`;
        alertSuccess("Autocompletar SAT", msg);
      }
    } catch (e) {
      hideAutomapOverlay(false);
      alertError("Error", e instanceof Error ? e.message : "Error al automapear");
    }
  }

  const filtered = useMemo(() => {
    if (!data) return [];
    if (filter === "inc") return data.partidas.filter((p) => p.tieneIncrementables);
    if (filter === "no") return data.partidas.filter((p) => !p.tieneIncrementables);
    return data.partidas;
  }, [data, filter]);

  if (notFound) {
    return (
      <div className="h-full overflow-y-auto text-center py-16 text-muted-foreground">
        Pedimento no encontrado.{" "}
        <Link href="/pedimentos" className="text-primary hover:underline">
          Volver
        </Link>
      </div>
    );
  }

  if (!data) {
    return <div className="h-full overflow-y-auto py-16 text-center text-muted-foreground">Cargando...</div>;
  }

  const tc = data.tipoCambio || 0;

  return (
    // This page keeps the old whole-page-scroll behavior deliberately (per
    // user request) instead of the "grid scrolls, chrome stays fixed"
    // treatment applied to Clientes/Facturas/Productos/Pedimentos list —
    // h-full + overflow-y-auto here is what opts back into that, since the
    // shared dashboard <main> is overflow-hidden by default now.
    <div className="h-full overflow-y-auto">
      <PageHeader title={data.pedimentoNum} description={data.importador} icon={FileText} />

      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Link
            href="/pedimentos"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mr-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Pedimentos
          </Link>
          {(
            [
              ["all", "Todas"],
              ["inc", "Con incrementables"],
              ["no", "Sin incrementables"],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant={filter === key ? "default" : "outline"}
              className="h-7 px-3 text-xs"
              onClick={() => setFilter(key)}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="gap-1.5 text-xs" onClick={() => setFacturarOpen(true)}>
            <Receipt className="w-3.5 h-3.5" />
            Facturar
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Exportar Excel
          </Button>
          <Button
            size="sm"
            className="gap-1.5 text-xs bg-gradient-to-br from-orange-500 to-orange-700 text-white hover:brightness-[1.07] shadow-sm"
            onClick={handleAutomap}
            disabled={automapRunning}
          >
            {automapRunning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Autocompletar SAT
          </Button>
        </div>
      </div>

      <Card className="border-border shadow-none">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">Partida</th>
                  <th className="text-left px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Descripción</th>
                  <th className="text-right px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">Val. Aduana</th>
                  <th className="text-right px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">Piezas</th>
                  <th className="text-right px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">T.C.</th>
                  <th className="text-right px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">P.U USD</th>
                  <th className="text-right px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">Valor Dlls</th>
                  <th className="text-right px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">P.U MN</th>
                  <th className="text-left px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">ClaveProdServ</th>
                  <th className="text-left px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">Unidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p) => {
                  const puMn = p.precioUnitario;
                  const puUsd = tc ? puMn / tc : 0;
                  const valorDlls = tc ? p.valAduana / tc : 0;
                  const prod = productosMap[p.fraccion];
                  const conf = prod?.confidence === "medium" || prod?.confidence === "low" ? prod.confidence : null;
                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-muted/40 transition-colors ${p.tieneIncrementables ? "bg-amber-50/50" : ""}`}
                    >
                      <td className="px-2.5 py-2 text-muted-foreground">{p.sec}</td>
                      <td className="px-2.5 py-2" title={p.descripcion}>
                        {p.descripcion}
                      </td>
                      <td className="px-2.5 py-2 text-right whitespace-nowrap">${p.valAduana.toLocaleString()}</td>
                      <td className="px-2.5 py-2 text-right text-muted-foreground whitespace-nowrap">{p.cantidad}</td>
                      <td className="px-2.5 py-2 text-right text-muted-foreground whitespace-nowrap">
                        {tc ? tc.toFixed(5) : "—"}
                      </td>
                      <td className="px-2.5 py-2 text-right text-muted-foreground whitespace-nowrap">
                        {tc ? `$${puUsd.toFixed(5)}` : "—"}
                      </td>
                      <td className="px-2.5 py-2 text-right text-muted-foreground whitespace-nowrap">
                        {tc ? `$${valorDlls.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-2.5 py-2 text-right whitespace-nowrap">${puMn.toFixed(5)}</td>
                      <td className="px-2.5 py-2 min-w-[160px]">
                        <SatComboBox
                          endpoint="/api/catalogs/products"
                          value={prod?.claveProdServ ?? ""}
                          description={prod?.descripcionSat}
                          mapped={!!prod?.claveProdServ}
                          confidence={conf}
                          placeholder="Buscar clave SAT…"
                          onSelect={(key, description) =>
                            saveMapping(p.fraccion, p.descripcion, { claveProdServ: key, descripcionSat: description })
                          }
                        />
                      </td>
                      <td className="px-2.5 py-2 min-w-[110px]">
                        <SatComboBox
                          endpoint="/api/catalogs/units"
                          value={prod?.unitKey ?? ""}
                          description={prod?.unitKey ? unitDescMap[prod.unitKey] : undefined}
                          mapped={!!prod?.unitKey}
                          placeholder="H87"
                          onSelect={(key, description) => {
                            setUnitDescMap((prev) => ({ ...prev, [key]: description }));
                            saveMapping(p.fraccion, p.descripcion, { unitKey: key });
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {automapRunning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background border border-border rounded-lg shadow-lg p-8 w-full max-w-sm text-center">
            <Sparkles className="w-8 h-8 text-primary mx-auto mb-3" />
            <h3 className="text-base font-semibold mb-2">Autocompletar SAT con IA</h3>
            <p className="text-sm text-muted-foreground mb-4 min-h-[1.25rem]">
              {automapDone ? (automapDone === "success" ? "¡Listo!" : "Ocurrió un error.") : automapStatusText}
            </p>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-[2000ms] ease-out"
                style={{ width: `${automapProgress}%` }}
              />
            </div>
            {!automapDone && (
              <p className="text-[11px] text-muted-foreground mt-3">Esto puede tomar hasta 2 minutos</p>
            )}
          </div>
        </div>
      )}

      <CrearFacturaDialog
        open={facturarOpen}
        onOpenChange={setFacturarOpen}
        pedimento={{
          id: data.id,
          pedimentoNum: data.pedimentoNum,
          importador: data.importador,
          tipoCambio: data.tipoCambio,
          dta: data.dta,
          igi: data.igi,
          prv: data.prv,
          partidas: data.partidas.map((p) => ({
            fraccion: p.fraccion,
            descripcion: p.descripcion,
            cantidad: p.cantidad,
            precioUnitario: p.precioUnitario,
            umc: p.umc,
          })),
        }}
      />
    </div>
  );
}
