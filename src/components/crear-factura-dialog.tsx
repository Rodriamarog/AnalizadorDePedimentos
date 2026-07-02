"use client";

import { useEffect, useState } from "react";
import { Loader2, X, Trash2, ChevronsUpDown, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { SatComboBox } from "@/components/sat-combobox";
import { fetchCatalogDescriptions } from "@/lib/fetchCatalogDescriptions";

const USO_CFDI_OPTIONS = [
  ["G01", "Adquisición de mercancias"],
  ["G02", "Devoluciones, descuentos o bonificaciones"],
  ["G03", "Gastos en general"],
  ["I01", "Construcciones"],
  ["I02", "Mobilario y equipo de oficina por inversiones"],
  ["I03", "Equipo de transporte"],
  ["I04", "Equipo de computo y accesorios"],
  ["I05", "Dados, troqueles, moldes, matrices y herramental"],
  ["I06", "Comunicaciones telefónicas"],
  ["I07", "Comunicaciones satelitales"],
  ["I08", "Otra maquinaria y equipo"],
  ["D01", "Honorarios médicos, dentales y gastos hospitalarios"],
  ["D02", "Gastos médicos por incapacidad o discapacidad"],
  ["D03", "Gastos funerales"],
  ["D04", "Donativos"],
  ["D05", "Intereses reales por créditos hipotecarios"],
  ["D06", "Aportaciones voluntarias al SAR"],
  ["D07", "Primas por seguros de gastos médicos"],
  ["D08", "Gastos de transportación escolar"],
  ["D09", "Depósitos en cuentas para el ahorro"],
  ["D10", "Pagos por servicios educativos (colegiaturas)"],
  ["S01", "Sin efectos fiscales"],
  ["CP01", "Pagos"],
  ["CN01", "Nómina"],
] as const;

// Exported so other payment-related dialogs (e.g. Registrar pago) can reuse
// the same SAT forma-de-pago catalog instead of showing a raw code.
export const PAYMENT_FORM_OPTIONS = [
  ["03", "Transferencia electrónica"],
  ["04", "Tarjeta de crédito"],
  ["28", "Tarjeta de débito"],
  ["01", "Efectivo"],
  ["02", "Cheque nominativo"],
  ["99", "Por definir"],
] as const;

// Business-friendly labels for FacturAPI's `type` field — FacturAPI's docs
// call this field itself "Type of document", so "Tipo de Documento" here and
// FacturAPI's `type` are the same field, not two separate concepts.
const DOCUMENT_TYPE_OPTIONS = [
  ["I", "Factura"],
  ["E", "Nota de crédito"],
  ["T", "Carta porte / Traslado"],
  ["P", "Recibo de pago / Complemento de pago"],
] as const;

// Fracción's unidad de medida (UMC) code -> SAT c_ClaveUnidad, used as the
// fallback when a partida's fracción has no entry in Productos yet.
const UMC_TO_UNIT_KEY: Record<string, string> = {
  "1": "KGM",
  "2": "GRM",
  "3": "MTR",
  "4": "MTK",
  "5": "MTQ",
  "6": "H87",
  "7": "H87",
  "8": "LTR",
  "9": "PR",
  "10": "KWT",
  "11": "MIL",
  "12": "SET",
  "13": "KWH",
  "14": "TNE",
  "15": "BRL",
  "16": "GRM",
  "17": "C62",
  "18": "CEN",
  "19": "DZN",
  "20": "XBX",
  "21": "XBO",
  "99": "H87",
};

interface Cliente {
  id: string;
  legal_name: string;
  tax_id?: string;
}

interface PedimentoLite {
  id: string;
  pedimentoNum: string;
  importador: string;
  tipoCambio: number;
}

export interface PedimentoForFactura {
  id: string;
  pedimentoNum: string;
  importador: string;
  tipoCambio: number;
  dta: number | null;
  igi: number | null;
  prv: number | null;
  partidas: {
    fraccion: string;
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    umc: string | null;
  }[];
}

interface ItemRow {
  key: string;
  descripcion: string;
  cantidad: string;
  precio: string;
  clave: string;
  unitKey: string;
  checked: boolean;
  removable: boolean;
  honorariosTipo?: "aduanal" | "comercializadora";
  isPartida?: boolean;
  isAduaneros?: boolean;
  claveReadonly?: boolean;
  unitReadonly?: boolean;
  qtyReadonly?: boolean;
  claveDescription?: string;
  unitDescription?: string;
}

function honorariosRow(id: string, descripcion: string, clave: string, tipo: "aduanal" | "comercializadora"): ItemRow {
  return {
    key: id,
    descripcion,
    cantidad: "1",
    precio: "",
    clave,
    unitKey: "E48",
    checked: true,
    removable: false,
    honorariosTipo: tipo,
  };
}

function newItemRow(): ItemRow {
  return {
    key: crypto.randomUUID(),
    descripcion: "",
    cantidad: "1",
    precio: "0",
    clave: "",
    unitKey: "H87",
    checked: true,
    removable: true,
  };
}

export interface ProductoLookup {
  fraccion: string;
  claveProdServ: string;
  unitKey: string;
  descripcionSat?: string | null;
}

// Pure transformation (no fetch), so it can be exercised directly in tests
// with a fixture productos list instead of needing a running server.
// `unitDescriptions` is an optional pre-fetched, deduped key->description map
// (see buildItemsFromPedimento) so callers can avoid each row's SatComboBox
// self-resolving its own description on mount.
export function mapPedimentoToItems(
  pedimento: PedimentoForFactura,
  productos: ProductoLookup[],
  unitDescriptions: Record<string, string> = {}
): ItemRow[] {
  const productoMap = new Map(productos.map((p) => [p.fraccion, p]));

  const partidaItems: ItemRow[] = pedimento.partidas.map((p, i) => {
    const prod = productoMap.get(p.fraccion);
    const clave = prod?.claveProdServ ?? "";
    const unit = prod?.unitKey ?? UMC_TO_UNIT_KEY[p.umc ?? ""] ?? "H87";
    return {
      key: `partida-${i}-${p.fraccion}`,
      descripcion: p.descripcion,
      cantidad: String(p.cantidad),
      precio: p.precioUnitario.toFixed(2),
      clave,
      unitKey: unit,
      checked: true,
      removable: false,
      isPartida: true,
      claveDescription: prod?.descripcionSat ?? undefined,
      unitDescription: unitDescriptions[unit],
    };
  });

  const impTotal = (pedimento.dta ?? 0) + (pedimento.igi ?? 0) + (pedimento.prv ?? 0);
  if (impTotal > 0) {
    partidaItems.push({
      key: "aduaneros",
      descripcion: "Impuestos Aduaneros (DTA + IGI + PRV)",
      cantidad: "1",
      precio: String(impTotal),
      clave: "93161608",
      unitKey: "ACT",
      checked: true,
      removable: false,
      isAduaneros: true,
      claveReadonly: true,
      unitReadonly: true,
      qtyReadonly: true,
    });
  }
  return partidaItems;
}

async function buildItemsFromPedimento(pedimento: PedimentoForFactura): Promise<ItemRow[]> {
  const res = await fetch("/api/productos");
  const productos: ProductoLookup[] = res.ok ? await res.json() : [];

  // Fracciones with no productos mapping fall back to the UMC->unit_key
  // table, so their unit key might not appear in `productos` at all —
  // collect the actual resolved unit for every partida before batching.
  const productoMap = new Map(productos.map((p) => [p.fraccion, p]));
  const resolvedUnits = pedimento.partidas.map(
    (p) => productoMap.get(p.fraccion)?.unitKey ?? UMC_TO_UNIT_KEY[p.umc ?? ""] ?? "H87"
  );
  const unitDescriptions = await fetchCatalogDescriptions("/api/catalogs/units", resolvedUnits);

  return mapPedimentoToItems(pedimento, productos, unitDescriptions);
}

interface CrearFacturaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  pedimento?: PedimentoForFactura;
}

export function CrearFacturaDialog({ open, onOpenChange, onSaved, pedimento }: CrearFacturaDialogProps) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [use, setUse] = useState("G03");
  const [cfdiType, setCfdiType] = useState<"I" | "E" | "T" | "P">("I");
  const [paymentForm, setPaymentForm] = useState("03");
  const [paymentMethod, setPaymentMethod] = useState<"PUE" | "PPD">("PUE");
  const [ivaRate, setIvaRate] = useState<16 | 8>(8);
  const [currency, setCurrency] = useState<"MXN" | "USD">("MXN");
  const [exchangeRate, setExchangeRate] = useState("");
  const [items, setItems] = useState<ItemRow[]>([]);
  const [retencionesVisible, setRetencionesVisible] = useState(false);
  const [retIsr, setRetIsr] = useState("10");
  const [retIva, setRetIva] = useState("5.33");
  const [pedimentosList, setPedimentosList] = useState<PedimentoLite[]>([]);
  const [pedimentoLinkOpen, setPedimentoLinkOpen] = useState(false);
  const [pedimentoLinkQuery, setPedimentoLinkQuery] = useState("");
  const [pedimentoLink, setPedimentoLink] = useState<PedimentoLite | null>(null);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // Resetting the dialog's form state when it opens (same class of finding
    // already present, unaddressed, in src/hooks/use-mobile.ts).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    setCustomerId("");
    setPaymentForm("03");
    setPaymentMethod("PUE");
    setRetencionesVisible(false);
    setRetIsr("10");
    setRetIva("5.33");

    if (pedimento) {
      setUse("G01");
      setCfdiType("I");
      setIvaRate(16);
      setCurrency("MXN");
      setExchangeRate(pedimento.tipoCambio ? String(pedimento.tipoCambio) : "");
      setPedimentoLink({
        id: pedimento.id,
        pedimentoNum: pedimento.pedimentoNum,
        importador: pedimento.importador,
        tipoCambio: pedimento.tipoCambio,
      });
      setItems([]);
      setItemsLoading(true);
      buildItemsFromPedimento(pedimento)
        .then(setItems)
        .finally(() => setItemsLoading(false));
    } else {
      setUse("G03");
      setCfdiType("I");
      setIvaRate(8);
      setCurrency("MXN");
      setExchangeRate("");
      setPedimentoLink(null);
      setPedimentoLinkQuery("");
      setItems([
        honorariosRow("h-aduanal", "GASTOS AGENCIA ADUANAL", "80151605", "aduanal"),
        honorariosRow("h-comercializadora", "HONORARIOS COMERCIALIZADORA", "80151604", "comercializadora"),
      ]);
      fetch("/api/pedimentos")
        .then((res) => (res.ok ? res.json() : []))
        .then(setPedimentosList);
    }

    fetch("/api/clientes?limit=100")
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((data) => setClientes(data.data ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pedimento?.id]);

  function updateItem(key: string, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  // Only forma de pago follows método de pago (PPD forces "99 - Por definir",
  // matching how forma de pago is genuinely tied to payment timing). Tipo de
  // Documento is independent — it always defaults to "Factura" regardless of
  // PUE/PPD, and a manual choice there must survive switching between them.
  function handlePaymentMethodChange(pm: "PUE" | "PPD") {
    setPaymentMethod(pm);
    if (pm === "PUE") {
      setPaymentForm((prev) => (prev === "99" ? "03" : prev));
    } else {
      setPaymentForm("99");
    }
  }

  function selectPedimentoLink(p: PedimentoLite | null) {
    setPedimentoLink(p);
    setPedimentoLinkQuery(p?.pedimentoNum ?? "");
    if (p?.tipoCambio) setExchangeRate(String(p.tipoCambio));
    setPedimentoLinkOpen(false);
  }

  function buildInvoiceBody(): Record<string, unknown> | null {
    if (!customerId) {
      setError("Selecciona un cliente");
      return null;
    }

    const ivaTax = { type: "IVA", rate: ivaRate / 100, factor: "Tasa", withholding: false };
    const pedNum = pedimentoLink?.pedimentoNum ?? null;

    const outItems: Record<string, unknown>[] = [];
    const zeroPriceDescs: string[] = [];
    for (const it of items) {
      if (!it.checked) continue;
      const clave = it.clave.trim();
      if (!clave) continue;

      const price = Number(it.precio) || 0;
      if (price <= 0) {
        zeroPriceDescs.push(it.descripcion.trim() || "(sin descripción)");
        continue;
      }

      let taxes: Record<string, unknown>[];
      if (it.honorariosTipo === "comercializadora") {
        const isrRet = retencionesVisible ? (Number(retIsr) || 0) / 100 : 0;
        const ivaRet = retencionesVisible ? (Number(retIva) || 0) / 100 : 0;
        taxes = [
          { type: "IVA", rate: ivaRate / 100, factor: "Tasa", withholding: false },
          ...(isrRet > 0 ? [{ type: "ISR", rate: isrRet, factor: "Tasa", withholding: true }] : []),
          ...(ivaRet > 0 ? [{ type: "IVA", rate: ivaRet, factor: "Tasa", withholding: true }] : []),
        ];
      } else {
        taxes = [ivaTax];
      }

      const item: Record<string, unknown> = {
        quantity: Number(it.cantidad) || 1,
        product: {
          description: it.descripcion.trim(),
          product_key: clave,
          price,
          unit_key: it.unitKey.trim() || "H87",
          tax_included: false,
          taxes,
        },
      };
      if (pedNum) item.customs_keys = [pedNum];
      outItems.push(item);
    }

    if (zeroPriceDescs.length > 0) {
      setError(
        `El precio no puede ser 0: ${zeroPriceDescs.join(", ")}. Ingresa un precio válido para cada concepto.`
      );
      return null;
    }

    if (outItems.length === 0) {
      setError("Selecciona al menos una partida con ClaveProdServ asignada");
      return null;
    }

    const body: Record<string, unknown> = {
      customer: customerId,
      type: cfdiType,
      use,
      items: outItems,
      payment_form: paymentForm,
      payment_method: paymentMethod,
      currency,
      pedimento_id: pedimentoLink?.id ?? null,
    };
    if (currency !== "MXN") {
      const tc = Number(exchangeRate);
      if (!tc) {
        setError("Ingresa el tipo de cambio para facturar en USD");
        return null;
      }
      body.exchange = tc;
    }
    return body;
  }

  async function handlePreview() {
    setError(null);
    const body = buildInvoiceBody();
    if (!body) return;
    delete body.pedimento_id;
    setPreviewing(true);
    try {
      const res = await fetch("/api/facturas/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError("Vista previa no disponible (puede no estar disponible en sandbox)");
        return;
      }
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob));
    } finally {
      setPreviewing(false);
    }
  }

  async function handleSave() {
    setError(null);
    const body = buildInvoiceBody();
    if (!body) return;
    setSaving(true);
    try {
      const res = await fetch("/api/facturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al timbrar la factura");
        return;
      }
      onOpenChange(false);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  const selectableItems = items.filter((it) => !it.isAduaneros);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crear factura</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {!pedimento && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Vincular a pedimento <span className="font-normal">(opcional)</span>
              </label>
              <Popover open={pedimentoLinkOpen} onOpenChange={setPedimentoLinkOpen}>
                <PopoverTrigger className="w-full flex items-center justify-between rounded-md border border-input px-3 py-2 text-sm text-left">
                  <span className={pedimentoLink ? "" : "text-muted-foreground"}>
                    {pedimentoLink ? pedimentoLink.pedimentoNum : "— Sin vincular —"}
                  </span>
                  <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start">
                  <Command>
                    <CommandInput
                      value={pedimentoLinkQuery}
                      onValueChange={setPedimentoLinkQuery}
                      placeholder="Buscar pedimento…"
                    />
                    <CommandList>
                      <CommandEmpty>Sin resultados.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem value="__none__" onSelect={() => selectPedimentoLink(null)}>
                          <span className="text-muted-foreground">— Sin vincular —</span>
                        </CommandItem>
                        {pedimentosList.map((p) => (
                          <CommandItem key={p.id} value={p.pedimentoNum} onSelect={() => selectPedimentoLink(p)}>
                            <div>
                              <div className="font-mono text-xs">{p.pedimentoNum}</div>
                              {p.tipoCambio ? (
                                <div className="text-[10px] text-muted-foreground">TC: {p.tipoCambio}</div>
                              ) : null}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground">Cliente</label>
            <select
              className="w-full rounded-md border border-input px-3 py-2 text-sm"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">— Selecciona un cliente —</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.legal_name} ({c.tax_id})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Uso del CFDI</label>
            <select
              className="w-full rounded-md border border-input px-3 py-2 text-sm"
              value={use}
              onChange={(e) => setUse(e.target.value)}
            >
              {USO_CFDI_OPTIONS.map(([code, label]) => (
                <option key={code} value={code}>
                  {code} – {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-muted-foreground">Partidas a facturar</label>
              {!pedimento && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs"
                  onClick={() => setItems((p) => [...p, newItemRow()])}
                >
                  + Agregar concepto
                </Button>
              )}
            </div>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="w-8 px-2 py-2">
                      <input
                        type="checkbox"
                        checked={selectableItems.length > 0 && selectableItems.every((it) => it.checked)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setItems((prev) => prev.map((it) => (it.isAduaneros ? it : { ...it, checked })));
                        }}
                      />
                    </th>
                    <th className="text-left px-2 py-2 font-semibold">Descripción</th>
                    <th className="text-right px-2 py-2 font-semibold w-16">Cant.</th>
                    <th className="text-right px-2 py-2 font-semibold w-24">Precio ({currency})</th>
                    <th className="text-left px-2 py-2 font-semibold w-32">ClaveProdServ</th>
                    <th className="text-left px-2 py-2 font-semibold w-20">Unidad</th>
                    <th className="w-6" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {itemsLoading && (
                    <tr>
                      <td colSpan={7} className="px-2 py-4 text-center text-muted-foreground">
                        Cargando partidas…
                      </td>
                    </tr>
                  )}
                  {items.map((it) => (
                    <tr key={it.key} className={it.isAduaneros ? "bg-muted/30" : undefined}>
                      <td className="px-2 py-1.5 align-middle">
                        <input
                          type="checkbox"
                          checked={it.checked}
                          onChange={(e) => updateItem(it.key, { checked: e.target.checked })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-7 text-xs min-w-[180px]"
                          placeholder="Descripción"
                          value={it.descripcion}
                          onChange={(e) => updateItem(it.key, { descripcion: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        {it.qtyReadonly ? (
                          <div className="text-right text-muted-foreground pr-1">{it.cantidad}</div>
                        ) : (
                          <Input
                            className="h-7 text-xs text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            type="number"
                            value={it.cantidad}
                            onChange={(e) => updateItem(it.key, { cantidad: e.target.value })}
                          />
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-7 text-xs text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          type="number"
                          placeholder="0.00"
                          value={it.precio}
                          onChange={(e) => updateItem(it.key, { precio: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        {it.claveReadonly ? (
                          <div className="font-mono text-muted-foreground">{it.clave}</div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <SatComboBox
                              endpoint="/api/catalogs/products"
                              value={it.clave}
                              description={it.claveDescription}
                              hideDescription
                              mapped={!!it.clave}
                              placeholder="ej. 78101803"
                              onSelect={(key, description) =>
                                updateItem(it.key, { clave: key, claveDescription: description })
                              }
                            />
                            {it.isPartida && !it.clave && (
                              <TriangleAlert
                                className="w-3.5 h-3.5 text-amber-500 shrink-0"
                                aria-label="Sin mapeo en Productos"
                              />
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {it.unitReadonly ? (
                          <div className="text-center text-muted-foreground">{it.unitKey}</div>
                        ) : (
                          <SatComboBox
                            endpoint="/api/catalogs/units"
                            value={it.unitKey}
                            description={it.unitDescription}
                            hideDescription
                            mapped={!!it.unitKey}
                            placeholder="H87"
                            onSelect={(key, description) =>
                              updateItem(it.key, { unitKey: key, unitDescription: description })
                            }
                          />
                        )}
                      </td>
                      <td className="px-1 py-1.5">
                        {it.removable && (
                          <button
                            className="text-muted-foreground hover:text-red-600"
                            onClick={() => setItems((p) => p.filter((row) => row.key !== it.key))}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!pedimento && (
                    <tr>
                      <td />
                      <td colSpan={6} className="px-2 py-1.5">
                        {!retencionesVisible ? (
                          <button
                            type="button"
                            className="text-[11px] text-muted-foreground border border-dashed border-border rounded px-2 py-0.5"
                            onClick={() => setRetencionesVisible(true)}
                          >
                            + Agregar retenciones
                          </button>
                        ) : (
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                            <label className="flex items-center gap-1">
                              ISR
                              <Input
                                className="h-6 w-16 text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                type="number"
                                value={retIsr}
                                onChange={(e) => setRetIsr(e.target.value)}
                              />
                              %
                            </label>
                            <label className="flex items-center gap-1">
                              IVA ret.
                              <Input
                                className="h-6 w-16 text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                type="number"
                                value={retIva}
                                onChange={(e) => setRetIva(e.target.value)}
                              />
                              %
                            </label>
                            <button
                              type="button"
                              className="inline-flex items-center gap-0.5 hover:text-foreground"
                              onClick={() => setRetencionesVisible(false)}
                            >
                              <X className="w-3 h-3" /> Quitar
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {!pedimento && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Las retenciones aplican solo al concepto de Honorarios Comercializadora.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Método de pago</label>
              <div className="flex gap-1.5 mt-1">
                <Button
                  size="sm"
                  variant={paymentMethod === "PUE" ? "default" : "outline"}
                  className="h-8 px-3 text-xs flex-1"
                  onClick={() => handlePaymentMethodChange("PUE")}
                >
                  PUE
                </Button>
                <Button
                  size="sm"
                  variant={paymentMethod === "PPD" ? "default" : "outline"}
                  className="h-8 px-3 text-xs flex-1"
                  onClick={() => handlePaymentMethodChange("PPD")}
                >
                  PPD
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {paymentMethod === "PUE"
                  ? "Pago en una sola exhibición al momento de la factura."
                  : "Pago en parcialidades o diferido. Se emitirá un complemento de pago después."}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Forma de pago</label>
              <select
                className="w-full rounded-md border border-input px-2 py-1.5 text-xs mt-1"
                value={paymentForm}
                onChange={(e) => setPaymentForm(e.target.value)}
              >
                {PAYMENT_FORM_OPTIONS.map(([code, label]) => (
                  <option key={code} value={code}>
                    {code} – {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Tipo de Documento</label>
              <select
                className="w-full rounded-md border border-input px-2 py-1.5 text-xs mt-1"
                value={cfdiType}
                onChange={(e) => setCfdiType(e.target.value as typeof cfdiType)}
              >
                {DOCUMENT_TYPE_OPTIONS.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Tasa IVA</label>
              <div className="flex gap-1.5 mt-1">
                <Button
                  size="sm"
                  variant={ivaRate === 16 ? "default" : "outline"}
                  className="h-8 px-3 text-xs flex-1"
                  onClick={() => setIvaRate(16)}
                >
                  16%
                </Button>
                <Button
                  size="sm"
                  variant={ivaRate === 8 ? "default" : "outline"}
                  className="h-8 px-3 text-xs flex-1"
                  onClick={() => setIvaRate(8)}
                >
                  8%
                </Button>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Moneda</label>
              <div className="flex gap-1.5 mt-1">
                <Button
                  size="sm"
                  variant={currency === "MXN" ? "default" : "outline"}
                  className="h-8 px-3 text-xs flex-1"
                  onClick={() => setCurrency("MXN")}
                >
                  MXN
                </Button>
                <Button
                  size="sm"
                  variant={currency === "USD" ? "default" : "outline"}
                  className="h-8 px-3 text-xs flex-1"
                  onClick={() => setCurrency("USD")}
                >
                  USD
                </Button>
              </div>
              {currency === "USD" && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">T.C.</span>
                  <Input
                    className="h-6 w-20 text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    type="number"
                    min="0.01"
                    step="0.0001"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="outline" size="sm" onClick={handlePreview} disabled={previewing}>
            {previewing && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
            Vista previa PDF
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
            Timbrar factura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
