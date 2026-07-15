"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Receipt, Plus, Loader2, ChevronDown, ChevronRight, Banknote, Mail, FileText, FileCode, FileBarChart, MoreVertical, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CrearFacturaDialog, PAYMENT_FORM_OPTIONS } from "@/components/crear-factura-dialog";
import { GridSearchInput } from "@/components/grid-search-input";
import { alertSuccess } from "@/lib/alerts";

interface Factura {
  id: string;
  series?: string;
  folio_number?: number;
  customer?: { id?: string; legal_name?: string; tax_id?: string; email?: string };
  total?: number;
  currency?: string;
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
  const { user } = useUser();
  const userEmail = user?.primaryEmailAddress?.emailAddress;
  const [rows, setRows] = useState<Factura[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("");
  const [q, setQ] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);

  const [cancelTarget, setCancelTarget] = useState<string | null>(null);

  const [emailTarget, setEmailTarget] = useState<{ id: string; folio: string } | null>(null);
  const [emailAddresses, setEmailAddresses] = useState<string[]>([""]);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [attachmentUrls, setAttachmentUrls] = useState<{ pdf?: string; xml?: string }>({});
  const [attachmentLoading, setAttachmentLoading] = useState<"pdf" | "xml" | null>(null);
  const [openPreview, setOpenPreview] = useState<"pdf" | "xml" | null>(null);
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [complementos, setComplementos] = useState<Complemento[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pagoTarget, setPagoTarget] = useState<Factura | null>(null);
  const [pagoMonto, setPagoMonto] = useState("");
  const [pagoFecha, setPagoFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [pagoForma, setPagoForma] = useState("03");
  const [pagoSaving, setPagoSaving] = useState(false);
  const [pagoPreviewing, setPagoPreviewing] = useState(false);
  const [pagoError, setPagoError] = useState<string | null>(null);

  const [reporteOpen, setReporteOpen] = useState(false);
  const [reporteMonth, setReporteMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [reporteLoading, setReporteLoading] = useState(false);
  const [reporteError, setReporteError] = useState<string | null>(null);

  // Text search is filtered client-side rather than forwarded to FacturAPI's
  // `q` param — that endpoint silently requires 4+ characters before it
  // matches anything, which made short queries look broken even when the
  // match was right there. payment_method stays a server-side filter since
  // it's an exact enum value, not free text.
  const load = useCallback(async (pm: string) => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (pm) params.set("payment_method", pm);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(paymentMethodFilter);
  }, [paymentMethodFilter, load]);

  const filteredRows = rows.filter((f) => {
    const query = q.trim().toLowerCase();
    if (!query) return true;
    const folio = [f.series, f.folio_number].filter(Boolean).join("-");
    return (
      (f.customer?.legal_name ?? "").toLowerCase().includes(query) ||
      (f.customer?.tax_id ?? "").toLowerCase().includes(query) ||
      folio.toLowerCase().includes(query)
    );
  });

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function saldoPendiente(f: Factura): number {
    const pagado = complementos
      .filter((c) => c.facturaFacturapiId === f.id)
      .reduce((sum, c) => sum + c.monto, 0);
    return Math.round(((f.total ?? 0) - pagado) * 100) / 100;
  }

  function openRegistrarPago(f: Factura) {
    setPagoTarget(f);
    setPagoMonto(String(saldoPendiente(f)));
    setPagoFecha(new Date().toISOString().slice(0, 10));
    setPagoForma("03");
    setPagoError(null);
  }

  function buildPagoBody(): Record<string, unknown> | null {
    if (!pagoTarget) return null;
    setPagoError(null);
    const montoNum = Number(pagoMonto);
    if (!montoNum || montoNum <= 0) {
      setPagoError("Ingresa un monto válido");
      return null;
    }
    if (!pagoFecha) {
      setPagoError("Ingresa la fecha de pago");
      return null;
    }
    const saldo = saldoPendiente(pagoTarget);
    if (montoNum - saldo > 0.01) {
      setPagoError(`El monto excede el saldo pendiente ($${saldo})`);
      return null;
    }
    return {
      factura_facturapi_id: pagoTarget.id,
      monto: montoNum,
      fecha_pago: pagoFecha,
      forma_pago: pagoForma,
    };
  }

  async function handlePreviewPago() {
    const body = buildPagoBody();
    if (!body) return;
    setPagoPreviewing(true);
    try {
      const res = await fetch("/api/complementos/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPagoError(data.error ?? "Vista previa no disponible");
        return;
      }
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob));
    } finally {
      setPagoPreviewing(false);
    }
  }

  async function handleRegistrarPago() {
    if (!pagoTarget) return;
    const body = buildPagoBody();
    if (!body) return;
    setPagoSaving(true);
    try {
      const res = await fetch("/api/complementos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setPagoError(data.error ?? "No se pudo emitir el complemento");
        return;
      }
      setPagoTarget(null);
      setExpanded((prev) => new Set(prev).add(pagoTarget.id));
      await load(paymentMethodFilter);
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

  async function handleDescargarReporte() {
    const [yearStr, monthStr] = reporteMonth.split("-");
    setReporteError(null);
    setReporteLoading(true);
    try {
      const res = await fetch(`/api/facturas/reporte-mensual?year=${yearStr}&month=${monthStr}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setReporteError(data.error ?? "No se pudo generar el reporte");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setReporteOpen(false);
    } finally {
      setReporteLoading(false);
    }
  }

  async function openSendEmail(id: string, folio: string, customer?: { id?: string; email?: string }) {
    setEmailTarget({ id, folio });
    // Prefilled below with, in order: the cliente's primary FacturAPI email,
    // its saved extras, then the logged-in user's own email so they get a
    // copy by default — dedup since the user's email can coincide with a
    // cliente's. Invoice list results only embed a partial `CustomerInfo`
    // (id/legal_name/tax_id, no email — see docs/facturapi/api-es.yaml
    // `CustomerInfo` schema), so the primary email has to be fetched from
    // the full Customer record, same as the local extras.
    setEmailAddresses(userEmail ? [userEmail] : [""]);
    setEmailSubject(`Factura ${folio}`);
    setEmailBody(`Adjunto encontrarás tu factura ${folio} en PDF y XML.\n\nSaludos.`);
    setEmailError(null);
    setAttachmentUrls({});
    setOpenPreview(null);
    try {
      const [customerRes, emailsRes] = await Promise.all([
        customer?.id ? fetch(`/api/clientes/${customer.id}`) : Promise.resolve(null),
        customer?.id ? fetch(`/api/clientes/${customer.id}/emails`) : Promise.resolve(null),
      ]);
      const clienteEmails: string[] = [];
      if (customerRes?.ok) {
        const full = await customerRes.json();
        if (full.email) clienteEmails.push(full.email);
      }
      if (emailsRes?.ok) {
        const { emails } = await emailsRes.json();
        clienteEmails.push(...emails);
      }
      if (clienteEmails.length > 0) {
        setEmailAddresses((prev) => Array.from(new Set([...clienteEmails, ...prev.filter(Boolean)])));
      }
    } catch {
      // Best-effort prefill — the send button still works with whatever
      // addresses are already in the field.
    }
  }

  function closeSendEmail() {
    Object.values(attachmentUrls).forEach((url) => url && URL.revokeObjectURL(url));
    setEmailTarget(null);
    setAttachmentUrls({});
    setOpenPreview(null);
    setEmailError(null);
  }

  // Attachment previews are loaded on demand (only when the user clicks the
  // PDF/XML card) instead of eagerly on dialog open, and cached per-kind so
  // toggling back and forth doesn't re-fetch.
  async function toggleAttachmentPreview(kind: "pdf" | "xml") {
    if (openPreview === kind) {
      setOpenPreview(null);
      return;
    }
    setOpenPreview(kind);
    if (attachmentUrls[kind] || !emailTarget) return;
    setAttachmentLoading(kind);
    try {
      const res = await fetch(`/api/facturas/${emailTarget.id}/${kind}`);
      if (res.ok) {
        const blob = await res.blob();
        setAttachmentUrls((prev) => ({ ...prev, [kind]: URL.createObjectURL(blob) }));
      }
    } finally {
      setAttachmentLoading(null);
    }
  }

  function updateEmailAddress(i: number, value: string) {
    setEmailAddresses((prev) => prev.map((e, idx) => (idx === i ? value : e)));
  }

  function addEmailAddress() {
    setEmailAddresses((prev) => [...prev, ""]);
  }

  function removeEmailAddress(i: number) {
    setEmailAddresses((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function confirmSendEmail() {
    if (!emailTarget) return;
    const emails = emailAddresses.map((e) => e.trim()).filter(Boolean);
    if (emails.length === 0) {
      setEmailError("Ingresa al menos un correo de destino");
      return;
    }
    if (!emailSubject.trim()) {
      setEmailError("Ingresa un asunto");
      return;
    }
    setEmailSending(true);
    setEmailError(null);
    try {
      const res = await fetch(`/api/facturas/${emailTarget.id}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: emails, subject: emailSubject.trim(), message: emailBody }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEmailError(data.error ?? "No se pudo enviar el correo");
        return;
      }
      closeSendEmail();
      alertSuccess("Correo enviado", "El correo fue enviado al cliente correctamente.");
    } finally {
      setEmailSending(false);
    }
  }

  async function handleCancel(motive: string) {
    if (!cancelTarget) return;
    const res = await fetch(`/api/facturas/${cancelTarget}?motive=${motive}`, { method: "DELETE" });
    setCancelTarget(null);
    if (res.ok) await load(paymentMethodFilter);
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
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs"
                        onClick={() => setReporteOpen(true)}
                      >
                        <FileBarChart className="w-3.5 h-3.5" />
                        Reporte mensual
                      </Button>
                      <Button size="sm" className="gap-1.5 text-xs" onClick={() => setDialogOpen(true)}>
                        <Plus className="w-3.5 h-3.5" />
                        Nueva factura
                      </Button>
                    </div>
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
                {!loading && rows.length > 0 && filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-5 py-8 text-center text-muted-foreground text-sm">
                      Sin resultados para &quot;{q}&quot;.
                    </td>
                  </tr>
                )}
                {filteredRows.map((f) => {
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
                          ${(f.total ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}{" "}
                          <span className="text-muted-foreground text-[11px]">{f.currency ?? "MXN"}</span>
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
                                <DropdownMenuItem onClick={() => openSendEmail(f.id, folio, f.customer)}>
                                  <Mail className="w-3.5 h-3.5" />
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
                                  <th className="text-left font-medium py-1 pr-4">UUID</th>
                                  <th className="text-right font-medium py-1">Acciones</th>
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
                                    <td className="py-1 pr-4 font-mono text-[11px] text-muted-foreground">
                                      {c.uuid || "—"}
                                    </td>
                                    <td className="py-1">
                                      <div className="flex items-center justify-end gap-1">
                                        <Tooltip>
                                          <TooltipTrigger
                                            render={
                                              <button
                                                className="text-muted-foreground hover:text-foreground p-1"
                                                onClick={() => handleDownload(c.facturapiId, "pdf")}
                                              >
                                                <FileText className="w-3.5 h-3.5" />
                                              </button>
                                            }
                                          />
                                          <TooltipContent>Descargar PDF</TooltipContent>
                                        </Tooltip>
                                        <Tooltip>
                                          <TooltipTrigger
                                            render={
                                              <button
                                                className="text-muted-foreground hover:text-foreground p-1"
                                                onClick={() => handleDownload(c.facturapiId, "xml")}
                                              >
                                                <FileCode className="w-3.5 h-3.5" />
                                              </button>
                                            }
                                          />
                                          <TooltipContent>Descargar XML</TooltipContent>
                                        </Tooltip>
                                        <Tooltip>
                                          <TooltipTrigger
                                            render={
                                              <button
                                                className="text-muted-foreground hover:text-foreground p-1"
                                                onClick={() =>
                                                  openSendEmail(
                                                    c.facturapiId,
                                                    c.uuid ?? c.facturapiId.slice(-6),
                                                    f.customer
                                                  )
                                                }
                                              >
                                                <Mail className="w-3.5 h-3.5" />
                                              </button>
                                            }
                                          />
                                          <TooltipContent>Enviar por correo</TooltipContent>
                                        </Tooltip>
                                      </div>
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
        onSaved={() => load(paymentMethodFilter)}
      />

      <Dialog open={reporteOpen} onOpenChange={(open) => !open && setReporteOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reporte mensual de facturas</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Genera un PDF con el desglose de comprobantes emitidos en el mes seleccionado, agrupados por moneda,
              con subtotal, IVA trasladado/retenido y total.
            </p>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Mes</label>
              <Input
                type="month"
                value={reporteMonth}
                onChange={(e) => setReporteMonth(e.target.value)}
              />
            </div>
            {reporteError && <p className="text-xs text-red-600">{reporteError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setReporteOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleDescargarReporte} disabled={reporteLoading}>
              {reporteLoading && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Descargar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            {pagoTarget && (
              <p className="text-xs text-muted-foreground">
                Saldo pendiente:{" "}
                <span className="font-medium text-foreground">
                  ${saldoPendiente(pagoTarget).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </span>
              </p>
            )}
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
            <Button variant="outline" size="sm" onClick={handlePreviewPago} disabled={pagoPreviewing}>
              {pagoPreviewing && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Vista previa PDF
            </Button>
            <Button size="sm" onClick={handleRegistrarPago} disabled={pagoSaving}>
              {pagoSaving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Emitir complemento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!emailTarget} onOpenChange={(open) => !open && closeSendEmail()}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Enviar factura {emailTarget?.folio} por correo</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">
                  Correo{emailAddresses.length > 1 ? "s" : ""} destino
                </label>
                <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={addEmailAddress}>
                  <Plus className="w-3 h-3" /> Agregar correo
                </Button>
              </div>
              <div className="flex flex-col gap-1.5 mt-1">
                {emailAddresses.map((email, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Input
                      type="email"
                      placeholder="cliente@ejemplo.com"
                      value={email}
                      onChange={(e) => updateEmailAddress(i, e.target.value)}
                    />
                    {emailAddresses.length > 1 && (
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-red-600 shrink-0"
                        onClick={() => removeEmailAddress(i)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Asunto</label>
              <Input
                className="mt-1"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Mensaje</label>
              <Textarea
                className="mt-1 min-h-24"
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
              />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Archivos adjuntos</p>
              <div className="flex gap-2">
                {(
                  [
                    ["pdf", FileText, "text-red-600"],
                    ["xml", FileCode, "text-blue-600"],
                  ] as const
                ).map(([kind, Icon, iconClass]) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => toggleAttachmentPreview(kind)}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors ${
                      openPreview === kind ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${iconClass}`} />
                    {emailTarget?.folio}.{kind}
                    {attachmentLoading === kind && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                  </button>
                ))}
              </div>
              {openPreview && (
                <div className="mt-2 rounded-md border border-border overflow-hidden h-[420px] flex items-center justify-center bg-muted/20">
                  {attachmentLoading === openPreview && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
                  {attachmentLoading !== openPreview && attachmentUrls[openPreview] && (
                    <iframe
                      src={attachmentUrls[openPreview]}
                      className="w-full h-full"
                      title={`Vista previa ${openPreview.toUpperCase()}`}
                    />
                  )}
                  {attachmentLoading !== openPreview && !attachmentUrls[openPreview] && (
                    <p className="text-xs text-muted-foreground">No se pudo cargar el {openPreview.toUpperCase()}</p>
                  )}
                </div>
              )}
            </div>
            {emailError && <p className="text-xs text-red-600">{emailError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={closeSendEmail}>
              Cancelar
            </Button>
            <Button size="sm" onClick={confirmSendEmail} disabled={emailSending}>
              {emailSending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Enviar correo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
