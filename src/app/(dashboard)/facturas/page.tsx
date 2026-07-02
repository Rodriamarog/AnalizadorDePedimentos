"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Receipt, Plus, Loader2, ChevronDown, ChevronRight, Banknote, Mail, FileText, FileCode, MoreVertical } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CrearFacturaDialog, PAYMENT_FORM_OPTIONS } from "@/components/crear-factura-dialog";
import { GridSearchInput } from "@/components/grid-search-input";
import { alertError, alertSuccess } from "@/lib/alerts";

interface Factura {
  id: string;
  series?: string;
  folio_number?: number;
  customer?: { legal_name?: string; tax_id?: string };
  total?: number;
  date: string;
  payment_method: string;
  status: string;
}

const statusBadge: Record<string, string> = {
  valid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  canceled: "bg-red-50 text-red-700 border-red-200",
};

interface Complemento {
  id: string;
  facturapiId: string;
  uuid: string | null;
  facturaFacturapiId: string | null;
  fechaPago: string;
  monto: number;
  formaPago: string;
}

export default function FacturasPage() {
  const [rows, setRows] = useState<Factura[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("");
  const [q, setQ] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);

  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);

  const [complementos, setComplementos] = useState<Complemento[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pagoTarget, setPagoTarget] = useState<Factura | null>(null);
  const [pagoMonto, setPagoMonto] = useState("");
  const [pagoFecha, setPagoFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [pagoForma, setPagoForma] = useState("03");
  const [pagoSaving, setPagoSaving] = useState(false);
  const [pagoError, setPagoError] = useState<string | null>(null);

  const load = useCallback(async (pm: string, query: string) => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (pm) params.set("payment_method", pm);
    if (query) params.set("q", query);
    const [facturasRes, complementosRes] = await Promise.all([
      fetch(`/api/facturas?${params}`),
      fetch("/api/complementos"),
    ]);
    if (facturasRes.ok) {
      const data = await facturasRes.json();
      setRows(data.data ?? []);
    }
    if (complementosRes.ok) setComplementos(await complementosRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => load(paymentMethodFilter, q), 300);
    return () => clearTimeout(timer);
  }, [paymentMethodFilter, q, load]);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openRegistrarPago(f: Factura) {
    setPagoTarget(f);
    setPagoMonto(String(f.total ?? ""));
    setPagoFecha(new Date().toISOString().slice(0, 10));
    setPagoForma("03");
    setPagoError(null);
  }

  async function handleRegistrarPago() {
    if (!pagoTarget) return;
    setPagoError(null);
    const montoNum = Number(pagoMonto);
    if (!montoNum || montoNum <= 0) {
      setPagoError("Ingresa un monto válido");
      return;
    }
    if (!pagoFecha) {
      setPagoError("Ingresa la fecha de pago");
      return;
    }
    setPagoSaving(true);
    try {
      const res = await fetch("/api/complementos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factura_facturapi_id: pagoTarget.id,
          monto: montoNum,
          fecha_pago: pagoFecha,
          forma_pago: pagoForma,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPagoError(data.error ?? "No se pudo emitir el complemento");
        return;
      }
      setPagoTarget(null);
      setExpanded((prev) => new Set(prev).add(pagoTarget.id));
      await load(paymentMethodFilter, q);
    } finally {
      setPagoSaving(false);
    }
  }

  async function handleDownload(id: string, fmt: "pdf" | "xml") {
    const res = await fetch(`/api/facturas/${id}/${fmt}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${id}.${fmt}`;
    if (fmt === "pdf") window.open(url, "_blank");
    else a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async function handleSendEmail(id: string) {
    setSendingEmailId(id);
    try {
      const res = await fetch(`/api/facturas/${id}/email`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alertError("Error", data.error ?? "No se pudo enviar el correo");
        return;
      }
      alertSuccess("Correo enviado", "El correo fue enviado al cliente correctamente.");
    } finally {
      setSendingEmailId(null);
    }
  }

  async function handleCancel(motive: string) {
    if (!cancelTarget) return;
    const res = await fetch(`/api/facturas/${cancelTarget}?motive=${motive}`, { method: "DELETE" });
    setCancelTarget(null);
    if (res.ok) await load(paymentMethodFilter, q);
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <PageHeader title="Facturas" description="Documentos fiscales (FacturAPI)" icon={Receipt} />

      <Card className="border-border shadow-none flex-1 min-h-0 flex flex-col">
        <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
          <div className="overflow-auto flex-1 min-h-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="w-8 px-2 py-3 sticky top-0 z-10 bg-card" />
                  <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-10 bg-card">Folio</th>
                  <th className="text-left px-5 py-2.5 sticky top-0 z-10 bg-card">
                    <GridSearchInput
                      className="max-w-[220px]"
                      placeholder="Buscar por cliente, RFC o folio…"
                      value={q}
                      onChange={setQ}
                    />
                  </th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-10 bg-card">RFC</th>
                  <th className="text-right px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-10 bg-card">Total</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-10 bg-card">Fecha</th>
                  <th className="text-left px-5 py-2.5 sticky top-0 z-10 bg-card">
                    <select
                      className="rounded-md border border-input px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground bg-transparent"
                      value={paymentMethodFilter}
                      onChange={(e) => setPaymentMethodFilter(e.target.value)}
                    >
                      <option value="">Método</option>
                      <option value="PUE">PUE</option>
                      <option value="PPD">PPD</option>
                    </select>
                  </th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-10 bg-card">Status</th>
                  <th className="px-5 py-2.5 text-right sticky top-0 z-10 bg-card">
                    <Button size="sm" className="gap-1.5 text-xs" onClick={() => setDialogOpen(true)}>
                      <Plus className="w-3.5 h-3.5" />
                      Nueva factura
                    </Button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && (
                  <tr>
                    <td colSpan={9} className="px-5 py-8 text-center text-muted-foreground text-sm">Cargando...</td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-5 py-8 text-center text-muted-foreground text-sm">
                      No hay facturas registradas.
                    </td>
                  </tr>
                )}
                {rows.map((f) => {
                  const folio = [f.series, f.folio_number].filter(Boolean).join("-") || f.id.slice(-6);
                  const isPpd = f.payment_method === "PPD";
                  const facturaComplementos = complementos.filter((c) => c.facturaFacturapiId === f.id);
                  const isExpanded = expanded.has(f.id);
                  return (
                    <Fragment key={f.id}>
                      <tr className="hover:bg-muted/40 transition-colors">
                        <td className="px-2 py-2.5 text-center">
                          {isPpd && facturaComplementos.length > 0 && (
                            <button
                              className="text-muted-foreground hover:text-foreground"
                              onClick={() => toggleExpanded(f.id)}
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </td>
                        <td className="px-5 py-2.5 font-mono text-xs font-semibold">{folio}</td>
                        <td className="px-5 py-2.5 font-medium text-foreground">{f.customer?.legal_name || "—"}</td>
                        <td className="px-5 py-2.5 font-mono text-xs text-muted-foreground">{f.customer?.tax_id || "—"}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums">
                          ${(f.total ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-5 py-2.5 text-xs text-muted-foreground">
                          {new Date(f.date).toLocaleDateString("es-MX")}
                        </td>
                        <td className="px-5 py-2.5">
                          <Badge variant="outline" className="text-[11px]">{f.payment_method}</Badge>
                          {isPpd && facturaComplementos.length > 0 && (
                            <span className="ml-1.5 text-[11px] text-muted-foreground">
                              ({facturaComplementos.length})
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-2.5">
                          <Badge variant="outline" className={`text-[11px] font-medium ${statusBadge[f.status] ?? ""}`}>
                            {f.status === "valid" ? "Válida" : f.status === "canceled" ? "Cancelada" : f.status}
                          </Badge>
                        </td>
                        <td className="px-5 py-2.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {isPpd && f.status === "valid" && (
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <Button size="sm" className="h-7 w-7 p-0" onClick={() => openRegistrarPago(f)}>
                                      <Banknote className="w-3.5 h-3.5" />
                                    </Button>
                                  }
                                />
                                <TooltipContent>Registrar pago</TooltipContent>
                              </Tooltip>
                            )}
                            {f.status === "valid" && (
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 px-2.5 text-xs"
                                onClick={() => setCancelTarget(f.id)}
                              >
                                Cancelar
                              </Button>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <Button size="sm" variant="outline" className="h-7 w-7 p-0">
                                    <MoreVertical className="w-3.5 h-3.5" />
                                  </Button>
                                }
                              />
                              <DropdownMenuContent>
                                <DropdownMenuItem onClick={() => handleDownload(f.id, "pdf")}>
                                  <FileText className="w-3.5 h-3.5" />
                                  Descargar PDF
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDownload(f.id, "xml")}>
                                  <FileCode className="w-3.5 h-3.5" />
                                  Descargar XML
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleSendEmail(f.id)}
                                  disabled={sendingEmailId === f.id}
                                >
                                  {sendingEmailId === f.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Mail className="w-3.5 h-3.5" />
                                  )}
                                  Enviar por correo
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && facturaComplementos.length > 0 && (
                        <tr className="bg-muted/20">
                          <td />
                          <td colSpan={8} className="px-5 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                              Complementos de pago emitidos
                            </p>
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-muted-foreground">
                                  <th className="text-left font-medium py-1 pr-4">Fecha pago</th>
                                  <th className="text-right font-medium py-1 pr-4">Monto</th>
                                  <th className="text-left font-medium py-1 pr-4">Forma pago</th>
                                  <th className="text-left font-medium py-1">UUID</th>
                                </tr>
                              </thead>
                              <tbody>
                                {facturaComplementos.map((c) => (
                                  <tr key={c.id}>
                                    <td className="py-1 pr-4">{c.fechaPago}</td>
                                    <td className="py-1 pr-4 text-right tabular-nums">
                                      ${c.monto.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="py-1 pr-4">{c.formaPago}</td>
                                    <td className="py-1 font-mono text-[11px] text-muted-foreground">
                                      {c.uuid || "—"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <CrearFacturaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={() => load(paymentMethodFilter, q)}
      />

      <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar factura</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Selecciona el motivo de cancelación ante el SAT.</p>
          <div className="flex flex-col gap-2">
            <Button variant="outline" size="sm" onClick={() => handleCancel("01")}>
              01 — Comprobante emitido con errores con relación
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleCancel("02")}>
              02 — Comprobante emitido con errores sin relación
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleCancel("03")}>
              03 — No se llevó a cabo la operación
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleCancel("04")}>
              04 — Operación nominativa relacionada en factura global
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pagoTarget} onOpenChange={(open) => !open && setPagoTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar pago</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Monto</label>
              <InputGroup>
                <InputGroupAddon>
                  <InputGroupText>$</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  type="number"
                  className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  value={pagoMonto}
                  onChange={(e) => setPagoMonto(e.target.value)}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>MXN</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Fecha de pago</label>
              <Input type="date" value={pagoFecha} onChange={(e) => setPagoFecha(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Forma de pago</label>
              <select
                className="w-full rounded-md border border-input px-3 py-2 text-sm"
                value={pagoForma}
                onChange={(e) => setPagoForma(e.target.value)}
              >
                {PAYMENT_FORM_OPTIONS.map(([code, label]) => (
                  <option key={code} value={code}>
                    {code} – {label}
                  </option>
                ))}
              </select>
            </div>
            {pagoError && <p className="text-xs text-red-600">{pagoError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPagoTarget(null)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleRegistrarPago} disabled={pagoSaving}>
              {pagoSaving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Emitir complemento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
