"use client";

import { useCallback, useEffect, useMemo, useRef, useState, use } from "react";
import { ArrowLeft, FileText, Sparkles, Loader2, Download, Receipt, GripVertical, MousePointerClick } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SatComboBox } from "@/components/sat-combobox";
import { CrearFacturaDialog } from "@/components/crear-factura-dialog";
import { fetchCatalogDescriptions } from "@/lib/fetchCatalogDescriptions";
import { alertError, alertInfo, alertSuccess, promptNumber } from "@/lib/alerts";

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
  tipoCambio: number | null;
  nomClave: string | null;
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

interface InspeccionPartida {
  sec: number;
  descripcion: string;
  nomClave: string | null;
  filename: string;
}

type Filter = "all" | "inc" | "no";

interface Producto {
  fraccion: string;
  descripcion: string;
  claveProdServ: string | null;
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
      // Creating a brand-new row requires a ClaveProdServ (API-enforced); an
      // existing row (e.g. one pre-filled with only a UMC-derived unitKey at
      // upload time) can be updated with just a unit-key edit via PUT.
      if (!existing && !body.clave_prod_serv) return;
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

  const [inspeccionOpen, setInspeccionOpen] = useState(false);
  const [inspeccionLoading, setInspeccionLoading] = useState(false);
  const [inspeccionPartidas, setInspeccionPartidas] = useState<InspeccionPartida[] | null>(null);
  const [inspeccionZipping, setInspeccionZipping] = useState(false);
  const [previewSec, setPreviewSec] = useState<number | null>(null);
  const [previewLoadingSec, setPreviewLoadingSec] = useState<number | null>(null);
  const [previewHtml, setPreviewHtml] = useState<Record<number, string>>({});

  // Per-partida T.C. override — rarely used (only when a pedimento is
  // covered by multiple invoices paid on different dates, each with its own
  // real exchange rate), but must stay reachable. Selection is real
  // click-and-drag across the checkbox gutter (mousedown starts the drag and
  // decides add-vs-remove from the first row's current state, mouseenter on
  // each row visited during the drag applies that same mode, mouseup anywhere
  // ends it) — same interaction spreadsheets/file explorers use for a
  // selection column, no drag-select library needed for row ranges like this.
  const [tcEditMode, setTcEditMode] = useState(false);
  const [tcSelected, setTcSelected] = useState<Set<string>>(new Set());
  const [tcSaving, setTcSaving] = useState(false);
  const tcDragModeRef = useRef<"add" | "remove" | null>(null);

  useEffect(() => {
    function endDrag() {
      tcDragModeRef.current = null;
    }
    window.addEventListener("mouseup", endDrag);
    return () => window.removeEventListener("mouseup", endDrag);
  }, []);

  function toggleTcEditMode() {
    setTcEditMode((v) => !v);
    setTcSelected(new Set());
    tcDragModeRef.current = null;
  }

  function startTcDrag(id: string) {
    const mode = tcSelected.has(id) ? "remove" : "add";
    tcDragModeRef.current = mode;
    setTcSelected((prev) => {
      const next = new Set(prev);
      if (mode === "add") next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function continueTcDrag(id: string) {
    const mode = tcDragModeRef.current;
    if (!mode) return;
    setTcSelected((prev) => {
      const has = prev.has(id);
      if ((mode === "add") === has) return prev;
      const next = new Set(prev);
      if (mode === "add") next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function applyTcToSelection() {
    if (tcSelected.size === 0 || !data) return;
    const value = await promptNumber(
      "Tipo de cambio",
      `Se aplicará a ${tcSelected.size} partida${tcSelected.size > 1 ? "s" : ""} seleccionada${tcSelected.size > 1 ? "s" : ""}.`,
      String(data.tipoCambio || "")
    );
    if (value == null) return;
    setTcSaving(true);
    try {
      const res = await fetch(`/api/pedimentos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partidaIds: [...tcSelected], tipoCambio: value }),
      });
      if (!res.ok) {
        alertError("Error", "No se pudo actualizar el tipo de cambio");
        return;
      }
      const updated: Partida[] = await res.json();
      const updatedMap = new Map(updated.map((p) => [p.id, p]));
      setData((prev) =>
        prev ? { ...prev, partidas: prev.partidas.map((p) => updatedMap.get(p.id) ?? p) } : prev
      );
      setTcEditMode(false);
      setTcSelected(new Set());
    } finally {
      setTcSaving(false);
    }
  }

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

  async function openInspeccionModal() {
    setInspeccionOpen(true);
    setPreviewSec(null);
    setInspeccionLoading(true);
    try {
      const res = await fetch(`/api/pedimentos/${id}/inspeccion`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        alertError("Error", body.error ?? "No se pudo cargar las solicitudes de inspección");
        setInspeccionOpen(false);
        return;
      }
      setInspeccionPartidas(body.partidas ?? []);
    } finally {
      setInspeccionLoading(false);
    }
  }

  function closeInspeccionModal() {
    setInspeccionOpen(false);
    setInspeccionPartidas(null);
    setPreviewSec(null);
    setPreviewHtml({});
  }

  // Each file's HTML preview (the docx converted via mammoth) is fetched on
  // demand, only the first time its card is clicked, then cached — same
  // lazy-load-and-cache approach as the PDF/XML attachment preview in
  // facturas/page.tsx.
  async function togglePreview(sec: number) {
    if (previewSec === sec) {
      setPreviewSec(null);
      return;
    }
    setPreviewSec(sec);
    if (previewHtml[sec]) return;
    setPreviewLoadingSec(sec);
    try {
      const res = await fetch(`/api/pedimentos/${id}/inspeccion/${sec}/preview`);
      if (res.ok) {
        const { html } = await res.json();
        setPreviewHtml((prev) => ({ ...prev, [sec]: html }));
      }
    } finally {
      setPreviewLoadingSec(null);
    }
  }

  async function downloadInspeccionZip() {
    setInspeccionZipping(true);
    try {
      const res = await fetch(`/api/pedimentos/${id}/inspeccion/zip`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alertError("Error", body.error ?? "No se pudo generar el zip");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="(.+)"/);
      const filename = match ? match[1] : `pedimento_${data?.pedimentoNum ?? id}_inspecciones.zip`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setInspeccionZipping(false);
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

  const hasNom = useMemo(() => data?.partidas.some((p) => p.nomClave) ?? false, [data]);

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
          {tcEditMode && (
            <>
              <span className="inline-flex items-center gap-1.5 text-xs text-primary bg-primary/10 border border-primary/20 rounded-full px-2.5 py-1">
                <MousePointerClick className="w-3.5 h-3.5" />
                Arrastra sobre las filas para seleccionar
              </span>
              <span className="text-xs text-muted-foreground">
                {tcSelected.size} seleccionada{tcSelected.size !== 1 ? "s" : ""}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
                onClick={applyTcToSelection}
                disabled={tcSelected.size === 0 || tcSaving}
              >
                {tcSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Aplicar T.C.
              </Button>
            </>
          )}
          <Button size="sm" className="gap-1.5 text-xs" onClick={() => setFacturarOpen(true)}>
            <Receipt className="w-3.5 h-3.5" />
            Facturar
          </Button>
          {hasNom && (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={openInspeccionModal}>
              <FileText className="w-3.5 h-3.5" />
              Solicitud de Inspección NOM
            </Button>
          )}
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
        </div>
      </div>

      <Card className="border-border shadow-none">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="border-b border-border">
                  {tcEditMode && (
                    <th className="w-9 px-2 py-2 bg-primary/5 border-r border-primary/20">
                      <input
                        type="checkbox"
                        title="Seleccionar todas"
                        checked={filtered.length > 0 && filtered.every((p) => tcSelected.has(p.id))}
                        onChange={(e) =>
                          setTcSelected(e.target.checked ? new Set(filtered.map((p) => p.id)) : new Set())
                        }
                      />
                    </th>
                  )}
                  <th className="text-left px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">Partida</th>
                  <th className="text-left px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Descripción</th>
                  <th className="text-right px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">Val. Aduana</th>
                  <th className="text-right px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">Piezas</th>
                  <th className="text-right px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      T.C.
                      <Button
                        size="sm"
                        variant={tcEditMode ? "default" : "outline"}
                        className="h-6 px-2 text-[10px] normal-case tracking-normal"
                        onClick={toggleTcEditMode}
                      >
                        {tcEditMode ? "Cancelar" : "Editar"}
                      </Button>
                    </div>
                  </th>
                  <th className="text-right px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">P.U USD</th>
                  <th className="text-right px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">Valor Dlls</th>
                  <th className="text-right px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">P.U MN</th>
                  <th className="text-left px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      ClaveProdServ
                      <Button
                        size="sm"
                        title="Autocompletar claves SAT con IA"
                        aria-label="Autocompletar claves SAT con IA"
                        className="h-6 w-6 p-0 bg-gradient-to-br from-orange-500 to-orange-700 text-white hover:brightness-[1.07] shadow-sm normal-case tracking-normal"
                        onClick={handleAutomap}
                        disabled={automapRunning}
                      >
                        {automapRunning ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </div>
                  </th>
                  <th className="text-left px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">Unidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p) => {
                  const rowTc = p.tipoCambio ?? tc;
                  const puMn = p.precioUnitario;
                  const puUsd = rowTc ? puMn / rowTc : 0;
                  const valorDlls = rowTc ? p.valAduana / rowTc : 0;
                  const prod = productosMap[p.fraccion];
                  const conf = prod?.confidence === "medium" || prod?.confidence === "low" ? prod.confidence : null;
                  return (
                    <tr
                      key={p.id}
                      className={`transition-colors ${p.tieneIncrementables ? "bg-amber-50/50" : ""} ${
                        tcEditMode
                          ? `select-none cursor-crosshair ${tcSelected.has(p.id) ? "bg-primary/15" : "hover:bg-primary/5"}`
                          : "hover:bg-muted/40"
                      }`}
                      onMouseDown={
                        tcEditMode
                          ? (e) => {
                              e.preventDefault();
                              startTcDrag(p.id);
                            }
                          : undefined
                      }
                      onMouseEnter={tcEditMode ? () => continueTcDrag(p.id) : undefined}
                    >
                      {tcEditMode && (
                        <td className={`px-2 py-2 align-middle border-r border-primary/20 group ${tcSelected.has(p.id) ? "bg-primary/15" : "bg-primary/5"}`}>
                          <div className="flex items-center gap-0.5">
                            <GripVertical className="w-3 h-3 text-primary/40 group-hover:text-primary/70 shrink-0" />
                            <input
                              type="checkbox"
                              checked={tcSelected.has(p.id)}
                              readOnly
                              className="pointer-events-none"
                            />
                          </div>
                        </td>
                      )}
                      <td className="px-2.5 py-2 text-muted-foreground">{p.sec}</td>
                      <td className="px-2.5 py-2" title={p.descripcion}>
                        {p.descripcion}
                      </td>
                      <td className="px-2.5 py-2 text-right whitespace-nowrap">${p.valAduana.toLocaleString()}</td>
                      <td className="px-2.5 py-2 text-right text-muted-foreground whitespace-nowrap">{p.cantidad}</td>
                      <td
                        className={`px-2.5 py-2 text-right whitespace-nowrap ${p.tipoCambio != null ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                        title={p.tipoCambio != null ? "T.C. sobreescrito para esta partida" : undefined}
                      >
                        {rowTc ? rowTc.toFixed(5) : "—"}
                      </td>
                      <td className="px-2.5 py-2 text-right text-muted-foreground whitespace-nowrap">
                        {rowTc ? `$${puUsd.toFixed(5)}` : "—"}
                      </td>
                      <td className="px-2.5 py-2 text-right text-muted-foreground whitespace-nowrap">
                        {rowTc ? `$${valorDlls.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-2.5 py-2 text-right whitespace-nowrap">${puMn.toFixed(5)}</td>
                      <td
                        className="px-2.5 py-2 min-w-[160px]"
                        onMouseDown={tcEditMode ? (e) => e.stopPropagation() : undefined}
                      >
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
                      <td
                        className="px-2.5 py-2 min-w-[110px]"
                        onMouseDown={tcEditMode ? (e) => e.stopPropagation() : undefined}
                      >
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
            tipoCambio: p.tipoCambio,
          })),
        }}
      />

      <Dialog open={inspeccionOpen} onOpenChange={(open) => !open && closeInspeccionModal()}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Solicitudes de Inspección NOM</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {inspeccionLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!inspeccionLoading && inspeccionPartidas && (
              <div className="flex flex-col gap-1.5">
                {inspeccionPartidas.map((p) => (
                  <div key={p.sec}>
                    <button
                      type="button"
                      onClick={() => togglePreview(p.sec)}
                      className={`w-full flex items-center gap-2.5 rounded-md border px-3 py-2 text-xs text-left transition-colors ${
                        previewSec === p.sec ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <FileText className="w-4 h-4 shrink-0 text-blue-600" />
                      <span className="flex-1 min-w-0">
                        <span className="font-medium">{p.filename}</span>
                        <span className="block text-muted-foreground truncate">{p.descripcion}</span>
                      </span>
                      {previewLoadingSec === p.sec && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
                      )}
                    </button>
                    {previewSec === p.sec && (
                      <div className="mt-1.5 rounded-md border border-border overflow-hidden bg-white">
                        {previewLoadingSec === p.sec && (
                          <div className="h-[420px] flex items-center justify-center bg-muted/20">
                            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                          </div>
                        )}
                        {previewLoadingSec !== p.sec && previewHtml[p.sec] && (
                          <div
                            className="h-[420px] overflow-y-auto p-4 text-[13px] leading-snug text-black [&_table]:border-collapse [&_table]:w-full [&_td]:border [&_td]:border-gray-300 [&_td]:p-1.5"
                            dangerouslySetInnerHTML={{ __html: previewHtml[p.sec] }}
                          />
                        )}
                        {previewLoadingSec !== p.sec && !previewHtml[p.sec] && (
                          <div className="h-[420px] flex items-center justify-center bg-muted/20">
                            <p className="text-xs text-muted-foreground">No se pudo cargar la vista previa</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={closeInspeccionModal}>
              Cerrar
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={downloadInspeccionZip}
              disabled={inspeccionZipping || !inspeccionPartidas?.length}
            >
              {inspeccionZipping ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              Descargar como Zip
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
