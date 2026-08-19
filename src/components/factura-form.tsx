"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Loader2, X, Trash2, ChevronsUpDown, TriangleAlert, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { SatComboBox } from "@/components/sat-combobox";
import { AutomapOverlay } from "@/components/automap-overlay";
import { useAutomapProgress } from "@/hooks/use-automap-progress";
import {
  CartaPorteFields,
  cartaPorteStateToInput,
  defaultCartaPorteState,
  mercanciaRowFromPrefill,
  validateCartaPorteState,
  type CartaPorteFormState,
  type ChoferLite,
  type VehiculoLite,
  type DireccionLite,
} from "@/components/carta-porte-fields";
import { fetchCatalogDescriptions } from "@/lib/fetchCatalogDescriptions";
import { umcToUnitKey } from "@/lib/umc";
import { alertError, alertInfo, alertSuccess } from "@/lib/alerts";
import { aduanaName } from "@/lib/aduanas";
import { buildCartaPorteComplement, mapPedimentoToMercancias, type PedimentoForCartaPorte } from "@/lib/buildCartaPorte";

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

// "Tipo de Documento" is a business-level document type distinct from
// FacturAPI's CFDI `type` field — two document types ("Recibo de Honorarios"
// and "Carta Porte Ingreso") both map to CFDI "Ingreso", so they can't share
// a single field the way a naive code/label pair would suggest.
export const DOCUMENT_TYPE_OPTIONS = [
  ["factura", "Factura"],
  ["recibo_honorarios", "Recibo de Honorarios"],
  ["nota_credito", "Nota de Crédito"],
  ["carta_porte", "Carta Porte"],
  ["carta_porte_ingreso", "Carta Porte Ingreso"],
] as const;

export type DocumentType = (typeof DOCUMENT_TYPE_OPTIONS)[number][0];

const DOCUMENT_TYPE_TO_CFDI: Record<DocumentType, "I" | "E" | "T"> = {
  factura: "I",
  recibo_honorarios: "I",
  nota_credito: "E",
  carta_porte: "T",
  carta_porte_ingreso: "I",
};

// SAT catálogo c_TipoRelacion — only relevant for a Nota de Crédito's
// `related_documents[].relationship`, describing how it relates to the
// invoice(s) it references. "01" (the straightforward credit-note case) is
// the default.
const RELATIONSHIP_CODE_OPTIONS = [
  ["01", "Nota de crédito de los documentos relacionados"],
  ["02", "Nota de débito de los documentos relacionados"],
  ["03", "Devolución de mercancía sobre facturas o traslados previos"],
  ["04", "Sustitución de los CFDI previos"],
  ["05", "Traslados de mercancías facturados previamente"],
  ["06", "Factura generada por los traslados previos"],
  ["07", "CFDI por aplicación de anticipo"],
] as const;

type RelationshipCode = (typeof RELATIONSHIP_CODE_OPTIONS)[number][0];

// UI convenience only, not an access restriction — every other user can
// still manually add the same two line items themselves. See #17.
const HONORARIOS_DEFAULT_ALLOWLIST = ["camaror@gmail.com", "rodriamarog@gmail.com"];

interface RelatedInvoiceCandidate {
  id: string;
  uuid: string;
  folio: string;
  total?: number;
  status?: string;
}

// Shape of each row in GET /api/facturas's `data` array (a passthrough of
// FacturAPI's invoice list) — only the fields the related-invoice picker uses.
interface FacturaListItem {
  id: string;
  uuid?: string;
  series?: string;
  folio_number?: number;
  total?: number;
  status?: string;
}

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
  fechaPago: string | null;
  claveAduana: string | null;
}

export interface PedimentoForFactura {
  id: string;
  pedimentoNum: string;
  importador: string;
  tipoCambio: number;
  fechaPago: string | null;
  claveAduana: string | null;
  dta: number | null;
  igi: number | null;
  prv: number | null;
  partidas: {
    fraccion: string;
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    umc: string | null;
    tipoCambio: number | null;
  }[];
}

interface ItemRow {
  key: string;
  descripcion: string;
  cantidad: string;
  precio: string;
  clave: string;
  // Optional fracción arancelaria, feeding the fracción-keyed automap/productos
  // cache path (see #16) — never required, same as clave itself.
  fraccion?: string;
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
  // Pedimento-sourced rows (partidas' precioUnitario, from Valor en Aduana;
  // and the DTA+IGI+PRV impuestos aduaneros row) are always stored in MXN —
  // see pedimentos/[id]/page.tsx, which derives USD as `precioUnitario / tc`,
  // never the reverse. So `precio` only needs conversion when the invoice's
  // target currency is USD, by dividing by the pedimento's own T.C.
  baseAmountMxn?: number;
  // The T.C. that actually applies to `baseAmountMxn` for this row — a
  // partida with its own override uses that instead of the pedimento-wide
  // rate, so re-converting on a currency switch keeps the same fixed USD
  // amount that the override was meant to preserve.
  effectiveTc?: number;
  // Per-row IVA override. Undefined means "follow the dialog-level ivaRate
  // toggle" — so changing that toggle still updates every row that hasn't
  // been manually overridden.
  ivaRate?: 16 | 8 | 0;
}

function mxnToCurrency(amountMxn: number, currency: "MXN" | "USD", tipoCambio: number): number {
  if (currency === "MXN" || !tipoCambio) return amountMxn;
  return amountMxn / tipoCambio;
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

// SAT ClaveProdServ 78101800 ("Transporte de carga por carretera") and
// ClaveUnidad E48 ("Unidad de servicio") are the conventional codes a
// transportista uses to bill their own freight service — both stay editable
// in case the actual service is air/maritime freight instead.
function transporteFeeRow(): ItemRow {
  return {
    ...newItemRow(),
    descripcion: "Tarifa del Transportista",
    clave: "78101800",
    unitKey: "E48",
  };
}

export interface ProductoLookup {
  fraccion: string;
  claveProdServ: string | null;
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
  unitDescriptions: Record<string, string> = {},
  currency: "MXN" | "USD" = "MXN",
  tipoCambio: number = pedimento.tipoCambio
): ItemRow[] {
  const productoMap = new Map(productos.map((p) => [p.fraccion, p]));

  const partidaItems: ItemRow[] = pedimento.partidas.map((p, i) => {
    const prod = productoMap.get(p.fraccion);
    const clave = prod?.claveProdServ ?? "";
    const unit = prod?.unitKey ?? umcToUnitKey(p.umc);
    const rowTc = p.tipoCambio ?? tipoCambio;
    return {
      key: `partida-${i}-${p.fraccion}`,
      descripcion: p.descripcion,
      cantidad: String(p.cantidad),
      precio: mxnToCurrency(p.precioUnitario, currency, rowTc).toFixed(5),
      clave,
      unitKey: unit,
      checked: true,
      removable: false,
      isPartida: true,
      claveDescription: prod?.descripcionSat ?? undefined,
      unitDescription: unitDescriptions[unit],
      baseAmountMxn: p.precioUnitario,
      effectiveTc: rowTc,
    };
  });

  const impTotal = (pedimento.dta ?? 0) + (pedimento.igi ?? 0) + (pedimento.prv ?? 0);
  if (impTotal > 0) {
    partidaItems.push({
      key: "aduaneros",
      descripcion: "Impuestos Aduaneros (DTA + IGI + PRV)",
      cantidad: "1",
      precio: mxnToCurrency(impTotal, currency, tipoCambio).toFixed(5),
      clave: "93161608",
      unitKey: "ACT",
      checked: true,
      removable: false,
      isAduaneros: true,
      claveReadonly: true,
      unitReadonly: true,
      qtyReadonly: true,
      baseAmountMxn: impTotal,
      effectiveTc: tipoCambio,
    });
  }
  return partidaItems;
}

async function buildItemsFromPedimento(
  pedimento: PedimentoForFactura,
  currency: "MXN" | "USD",
  tipoCambio: number
): Promise<ItemRow[]> {
  const res = await fetch("/api/productos");
  const productos: ProductoLookup[] = res.ok ? await res.json() : [];

  // Fracciones with no productos mapping fall back to the UMC->unit_key
  // table, so their unit key might not appear in `productos` at all —
  // collect the actual resolved unit for every partida before batching.
  const productoMap = new Map(productos.map((p) => [p.fraccion, p]));
  const resolvedUnits = pedimento.partidas.map(
    (p) => productoMap.get(p.fraccion)?.unitKey ?? umcToUnitKey(p.umc)
  );
  const unitDescriptions = await fetchCatalogDescriptions("/api/catalogs/units", resolvedUnits);

  return mapPedimentoToItems(pedimento, productos, unitDescriptions, currency, tipoCambio);
}

// Shape of GET /api/facturas/[id] — a raw FacturAPI invoice, used to prefill
// the form when reopening a saved draft for editing.
export interface FacturaDraftDetail {
  id: string;
  status?: string;
  type?: "I" | "E" | "P" | "N" | "T";
  use?: string;
  payment_form?: string;
  payment_method?: "PUE" | "PPD";
  currency?: "MXN" | "USD";
  exchange?: number;
  customer?: { id?: string };
  related_documents?: { relationship?: string; documents?: string[] }[];
  items?: {
    quantity?: number;
    product?: {
      description?: string;
      product_key?: string;
      price?: number;
      unit_key?: string;
      taxes?: { type: string; rate: number; withholding?: boolean }[];
    };
  }[];
}

const CFDI_TO_DOCUMENT_TYPE: Record<string, DocumentType> = {
  I: "factura",
  E: "nota_credito",
  T: "carta_porte",
};

interface FacturaFormProps {
  // Called when the user cancels out of the form without saving.
  onCancel: () => void;
  onSaved?: () => void;
  pedimento?: PedimentoForFactura;
  // A previously-saved draft to reopen for editing — mutually exclusive with
  // `pedimento`, which only applies to a brand new invoice.
  draft?: FacturaDraftDetail;
  documentType: DocumentType;
  onDocumentTypeChange: (next: DocumentType) => void;
}

export function FacturaForm({
  onCancel,
  onSaved,
  pedimento,
  draft,
  documentType,
  onDocumentTypeChange,
}: FacturaFormProps) {
  const { user } = useUser();
  const userEmail = user?.primaryEmailAddress?.emailAddress;
  // Read via a ref (not a dependency) inside the mount-reset effect below —
  // that effect intentionally only re-runs on pedimento/draft changes (see
  // its own comment), so listing userEmail there would instead re-reset the
  // whole form whenever Clerk's user data changes. The ref still gives that
  // effect the latest known value at the moment it runs.
  const userEmailRef = useRef<string | undefined>(userEmail);
  useEffect(() => {
    userEmailRef.current = userEmail;
  }, [userEmail]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [use, setUse] = useState("G03");
  const [paymentForm, setPaymentForm] = useState("03");
  const [paymentMethod, setPaymentMethod] = useState<"PUE" | "PPD">("PUE");
  const [ivaRate, setIvaRate] = useState<16 | 8 | 0>(8);
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
  const [relatedInvoiceCandidates, setRelatedInvoiceCandidates] = useState<RelatedInvoiceCandidate[]>([]);
  const [relatedInvoiceLoading, setRelatedInvoiceLoading] = useState(false);
  const [relatedInvoiceOpen, setRelatedInvoiceOpen] = useState(false);
  const [relatedInvoice, setRelatedInvoice] = useState<RelatedInvoiceCandidate | null>(null);
  const [relationshipCode, setRelationshipCode] = useState<RelationshipCode>("01");
  // Set while loading a nota_credito draft, whose related invoice's uuid is
  // known before its full candidate object (id/folio/total) is fetched —
  // consumed by the candidates effect below once the list arrives.
  const [pendingRelatedUuid, setPendingRelatedUuid] = useState<string | null>(null);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [cartaPorte, setCartaPorte] = useState<CartaPorteFormState>(defaultCartaPorteState());
  const [vehiculosList, setVehiculosList] = useState<VehiculoLite[]>([]);
  const [choferesList, setChoferesList] = useState<ChoferLite[]>([]);
  const [direccionesList, setDireccionesList] = useState<DireccionLite[]>([]);
  const [saving, setSaving] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const automap = useAutomapProgress();

  useEffect(() => {
    // Resetting the form's state on mount (same class of finding already
    // present, unaddressed, in src/hooks/use-mobile.ts).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    setCustomerId("");
    setPaymentForm("03");
    setPaymentMethod("PUE");
    setRetencionesVisible(false);
    setRetIsr("10");
    setRetIva("5.33");
    setRelatedInvoice(null);
    setRelatedInvoiceCandidates([]);
    setRelationshipCode("01");
    setCartaPorte(defaultCartaPorteState());

    fetch("/api/vehiculos?active=true")
      .then((res) => (res.ok ? res.json() : []))
      .then(setVehiculosList);
    fetch("/api/choferes?active=true")
      .then((res) => (res.ok ? res.json() : []))
      .then(setChoferesList);
    fetch("/api/direcciones?active=true")
      .then((res) => (res.ok ? res.json() : []))
      .then(setDireccionesList);

    if (draft) {
      setUse(draft.use ?? "G03");
      onDocumentTypeChange(CFDI_TO_DOCUMENT_TYPE[draft.type ?? "I"] ?? "factura");
      setPaymentForm(draft.payment_form ?? "03");
      setPaymentMethod(draft.payment_method ?? "PUE");
      setCurrency(draft.currency ?? "MXN");
      setExchangeRate(draft.exchange ? String(draft.exchange) : "");
      setCustomerId(draft.customer?.id ?? "");
      setPedimentoLink(null);
      setPedimentoLinkQuery("");
      const draftItems: ItemRow[] = (draft.items ?? []).map((it, i) => {
        const ivaTax = it.product?.taxes?.find((t) => t.type === "IVA" && !t.withholding);
        return {
          key: `draft-${i}`,
          descripcion: it.product?.description ?? "",
          cantidad: String(it.quantity ?? 1),
          precio: String(it.product?.price ?? 0),
          clave: it.product?.product_key ?? "",
          unitKey: it.product?.unit_key ?? "H87",
          checked: true,
          removable: true,
          ivaRate: ivaTax ? ((ivaTax.rate * 100) as 16 | 8 | 0) : undefined,
        };
      });
      setItems(draftItems.length > 0 ? draftItems : [newItemRow()]);
      const relatedUuid = draft.related_documents?.[0]?.documents?.[0];
      setPendingRelatedUuid(relatedUuid ?? null);
      if (relatedUuid) {
        setRelationshipCode((draft.related_documents?.[0]?.relationship as RelationshipCode) ?? "01");
      }
      fetch("/api/pedimentos")
        .then((res) => (res.ok ? res.json() : []))
        .then(setPedimentosList);
    } else if (pedimento) {
      // documentType is not reset here — FacturaTipoSelectorDialog sets its
      // initial value before this form even mounts (the Tipo de Documento
      // dropdown below can still change it afterward, same as any other flow).
      setUse("G01");
      setIvaRate(16);
      setCurrency("MXN");
      setExchangeRate(pedimento.tipoCambio ? String(pedimento.tipoCambio) : "");
      setPedimentoLink({
        id: pedimento.id,
        pedimentoNum: pedimento.pedimentoNum,
        importador: pedimento.importador,
        tipoCambio: pedimento.tipoCambio,
        fechaPago: pedimento.fechaPago,
        claveAduana: pedimento.claveAduana,
      });
      // Carta Porte Ingreso bills the transportista's own service, not the
      // merchandise — see the comment on transporteFeeRow.
      if (documentType === "carta_porte_ingreso") {
        setItems([transporteFeeRow()]);
      } else {
        setItems([]);
        setItemsLoading(true);
        buildItemsFromPedimento(pedimento, "MXN", pedimento.tipoCambio)
          .then(setItems)
          .finally(() => setItemsLoading(false));
      }
    } else {
      setUse("G03");
      setIvaRate(8);
      setCurrency("MXN");
      setExchangeRate("");
      setPedimentoLink(null);
      setPedimentoLinkQuery("");
      setItems(
        userEmailRef.current && HONORARIOS_DEFAULT_ALLOWLIST.includes(userEmailRef.current)
          ? [
              honorariosRow("h-aduanal", "GASTOS AGENCIA ADUANAL", "80151605", "aduanal"),
              honorariosRow("h-comercializadora", "HONORARIOS COMERCIALIZADORA", "80151604", "comercializadora"),
            ]
          : []
      );
      fetch("/api/pedimentos")
        .then((res) => (res.ok ? res.json() : []))
        .then(setPedimentosList);
    }

    fetch("/api/clientes?limit=100")
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((data) => setClientes(data.data ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedimento?.id, draft?.id]);

  // Pedimento-sourced rows (partidas in USD, impuestos aduaneros in MXN)
  // carry their price in a fixed "home" currency — recompute `precio` from
  // that base whenever the invoice's target currency changes, using each
  // row's own effective T.C. (a partida's override if it has one, else the
  // pedimento's own T.C.) so a currency switch preserves the same fixed USD
  // amount the override was meant to fix, not the pedimento-wide rate.
  useEffect(() => {
    if (!pedimento || !pedimento.tipoCambio) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems((prev) =>
      prev.map((it) =>
        it.baseAmountMxn != null
          ? { ...it, precio: mxnToCurrency(it.baseAmountMxn, currency, it.effectiveTc ?? pedimento.tipoCambio).toFixed(5) }
          : it
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency]);

  // The invoice a Nota de Crédito can relate to must belong to the same
  // customer, so re-fetch candidates whenever either changes; switching away
  // from Nota de Crédito or away from the customer that was selected drops
  // whatever was picked, since it's no longer a valid choice.
  useEffect(() => {
    // Resetting selection state in response to a prop/state change is the
    // same class of finding already present, unaddressed, in
    // src/hooks/use-mobile.ts and the mount-reset effect above.
    if (documentType !== "nota_credito" || !customerId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRelatedInvoiceCandidates([]);
      setRelatedInvoice(null);
      return;
    }
    setRelatedInvoice(null);
    setRelatedInvoiceLoading(true);
    // Explicit type=I: a nota de crédito can only relate to an Ingreso
    // invoice, and GET /api/facturas defaults to returning both I and E.
    fetch(`/api/facturas?customer=${encodeURIComponent(customerId)}&type=I`)
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((data: { data?: FacturaListItem[] }) => {
        const candidates: RelatedInvoiceCandidate[] = (data.data ?? [])
          .filter((f): f is FacturaListItem & { uuid: string } => f.status === "valid" && !!f.uuid)
          .map((f) => ({
            id: f.id,
            uuid: f.uuid,
            folio: [f.series, f.folio_number].filter(Boolean).join("-") || f.id,
            total: f.total,
            status: f.status,
          }));
        setRelatedInvoiceCandidates(candidates);
        if (pendingRelatedUuid) {
          setRelatedInvoice(candidates.find((c) => c.uuid === pendingRelatedUuid) ?? null);
          setPendingRelatedUuid(null);
        }
      })
      .finally(() => setRelatedInvoiceLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentType, customerId]);

  const isCartaPorte = documentType === "carta_porte" || documentType === "carta_porte_ingreso";
  const isTraslado = documentType === "carta_porte";

  // A linked pedimento's partidas prefill mercancías (still editable
  // afterward) whenever the link changes while a Carta Porte variant is
  // selected — mirrors buildItemsFromPedimento's prefill-on-link pattern for
  // the regular items table.
  useEffect(() => {
    if (!isCartaPorte || !pedimentoLink) return;
    Promise.all([
      fetch(`/api/pedimentos/${pedimentoLink.id}`).then((res) => (res.ok ? res.json() : null)),
      // BienesTransp uses the same c_ClaveProdServ catalog as a factura's
      // Concepto.ClaveProdServ, so the existing fracción->claveProdServ
      // productos registry (mapPedimentoToItems' lookup) doubles as the
      // fracción->BienesTransp lookup here.
      fetch("/api/productos").then((res) => (res.ok ? res.json() : [])),
    ]).then(([data, productos]: [PedimentoForCartaPorte | null, ProductoLookup[]]) => {
      if (!data) return;
      const bienesTransp = productos
        .filter((p) => p.claveProdServ)
        .map((p) => ({ fraccion: p.fraccion, bienesTransp: p.claveProdServ as string }));
      const { mercancias, paisOrigenDestino, pesoBrutoTotal } = mapPedimentoToMercancias(data, bienesTransp);
      setCartaPorte((prev) => ({
        ...prev,
        mercancias: mercancias.map(mercanciaRowFromPrefill),
        paisOrigenDestino: paisOrigenDestino ?? prev.paisOrigenDestino,
        pesoBrutoTotal: pesoBrutoTotal !== undefined ? String(pesoBrutoTotal) : prev.pesoBrutoTotal,
      }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCartaPorte, pedimentoLink?.id]);

  // Switching the Tipo de Documento away from a Carta Porte variant clears
  // the Carta Porte-specific form state — those fields are meaningless (and
  // shouldn't linger) once the user picks a different document type.
  function handleDocumentTypeChange(next: DocumentType) {
    onDocumentTypeChange(next);
    if (next !== "carta_porte" && next !== "carta_porte_ingreso") {
      setCartaPorte(defaultCartaPorteState());
    }
    // Carta Porte Ingreso bills the transportista's own service (e.g. flete),
    // not the merchandise being hauled — the merchandise itself only belongs
    // in the complement's Mercancías. A linked pedimento prefills "Partidas a
    // facturar" with each partida at its full value (see buildItemsFromPedimento),
    // which is correct for a regular Factura but would double-bill the cargo
    // here, so switching in replaces that with a single blank row for the fee.
    if (next === "carta_porte_ingreso" && documentType !== "carta_porte_ingreso") {
      setItems([transporteFeeRow()]);
    }
  }

  function updateItem(key: string, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  // Classifies every row with no clave yet against the SAT product/service
  // catalog — rows that already have one (manually typed or a previous
  // autofill run, including the two hardcoded honorarios rows) are left
  // untouched. Only used outside the pedimento flow, which has its own
  // automap button on the pedimento detail page instead.
  async function handleAutomap() {
    const toMap = items.filter((it) => it.checked && !it.clave.trim());
    if (toMap.length === 0) {
      alertInfo("Autocompletar SAT", "Todos los conceptos ya tienen una clave asignada.");
      return;
    }
    automap.show();
    try {
      const res = await fetch("/api/facturas/automap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: toMap.map((it) => ({ id: it.key, descripcion: it.descripcion, fraccion: it.fraccion || undefined })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al automapear");

      let mapped = 0;
      for (const r of data.results as { id: string; key: string | null; description: string | null }[]) {
        if (!r.key) continue;
        mapped++;
        updateItem(r.id, { clave: r.key, claveDescription: r.description ?? undefined });
      }
      automap.hide(true);
      alertSuccess("Autocompletar SAT", `${mapped} de ${toMap.length} concepto(s) clasificados.`);
    } catch (e) {
      automap.hide(false);
      alertError("Error", e instanceof Error ? e.message : "Error al automapear");
    }
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

  // SAT's published pattern for NumeroPedimento groups the 15 digits as
  // AA  AA  AAAA  AAAAAAA with two spaces between groups; FacturAPI accepts
  // single-space too, but some clients' other facturación software insists
  // on the literal double-space form, so we normalize to it here.
  function isoToSlash(iso: string): string {
    const [yyyy, mm, dd] = iso.split("-");
    return `${dd}/${mm}/${yyyy}`;
  }

  function formatPedimentoForCfdi(pedNum: string): string {
    const digits = pedNum.replace(/\D/g, "");
    if (digits.length !== 15) return pedNum;
    return `${digits.slice(0, 2)}  ${digits.slice(2, 4)}  ${digits.slice(4, 8)}  ${digits.slice(8, 15)}`;
  }

  function selectPedimentoLink(p: PedimentoLite | null) {
    setPedimentoLink(p);
    setPedimentoLinkQuery(p?.pedimentoNum ?? "");
    if (p?.tipoCambio) setExchangeRate(String(p.tipoCambio));
    setPedimentoLinkOpen(false);
  }

  // `draftMode` relaxes the checks that only matter for a stamped CFDI
  // (customer selected, every item priced and mapped to a ClaveProdServ, a
  // related invoice for notas de crédito) since FacturAPI's own `draft`
  // status already makes all of those optional — the point of a draft is to
  // save incomplete work. Full validation still runs for "Timbrar factura".
  function buildInvoiceBody(draftMode = false): Record<string, unknown> | null {
    if (!customerId && !draftMode) {
      setError("Selecciona un cliente");
      return null;
    }

    if (documentType === "nota_credito" && !relatedInvoice && !draftMode) {
      setError("Selecciona la factura que esta nota de crédito corrige");
      return null;
    }

    const pedNum = pedimentoLink?.pedimentoNum ?? null;

    const outItems: Record<string, unknown>[] = [];
    const zeroPriceDescs: string[] = [];
    for (const it of items) {
      if (!it.checked) continue;
      const clave = it.clave.trim();
      if (!clave && !draftMode) continue;

      // Traslado (CFDI type "T") line items have no price/taxes at all —
      // FacturAPI's LineItemTrasladoProductInput schema only has
      // description/product_key/unit_key/unit_name/sku, since no
      // consideration changes hands on a mercancía transfer.
      const price = Number(it.precio) || 0;
      if (!isTraslado && price <= 0 && !draftMode) {
        zeroPriceDescs.push(it.descripcion.trim() || "(sin descripción)");
        continue;
      }

      let description = it.descripcion.trim();
      if (pedNum && pedimentoLink?.fechaPago) {
        description += ` - Fecha pedimento: ${isoToSlash(pedimentoLink.fechaPago)}`;
      }

      let product: Record<string, unknown>;
      if (isTraslado) {
        product = {
          description,
          product_key: clave,
          unit_key: it.unitKey.trim() || "H87",
        };
      } else {
        const rowIvaRate = it.ivaRate ?? ivaRate;
        let taxes: Record<string, unknown>[];
        if (it.honorariosTipo === "comercializadora") {
          const isrRet = retencionesVisible ? (Number(retIsr) || 0) / 100 : 0;
          const ivaRet = retencionesVisible ? (Number(retIva) || 0) / 100 : 0;
          taxes = [
            { type: "IVA", rate: rowIvaRate / 100, factor: "Tasa", withholding: false },
            ...(isrRet > 0 ? [{ type: "ISR", rate: isrRet, factor: "Tasa", withholding: true }] : []),
            ...(ivaRet > 0 ? [{ type: "IVA", rate: ivaRet, factor: "Tasa", withholding: true }] : []),
          ];
        } else {
          taxes = [{ type: "IVA", rate: rowIvaRate / 100, factor: "Tasa", withholding: false }];
        }
        product = {
          description,
          product_key: clave,
          price,
          unit_key: it.unitKey.trim() || "H87",
          tax_included: false,
          taxes,
        };
      }

      const item: Record<string, unknown> = { quantity: Number(it.cantidad) || 1, product };
      if (pedNum) item.customs_keys = [formatPedimentoForCfdi(pedNum)];
      outItems.push(item);
    }

    if (zeroPriceDescs.length > 0 && !draftMode) {
      setError(
        `El precio no puede ser 0: ${zeroPriceDescs.join(", ")}. Ingresa un precio válido para cada concepto.`
      );
      return null;
    }

    if (outItems.length === 0 && !draftMode) {
      setError("Selecciona al menos una partida con ClaveProdServ asignada");
      return null;
    }

    const cartaPorteError = isCartaPorte ? validateCartaPorteState(cartaPorte) : null;
    if (cartaPorteError && !draftMode) {
      setError(cartaPorteError);
      return null;
    }

    const body: Record<string, unknown> = {
      type: DOCUMENT_TYPE_TO_CFDI[documentType],
      use,
      items: outItems,
      currency,
      pedimento_id: pedimentoLink?.id ?? null,
    };
    // Traslado has no payment_form/payment_method in FacturAPI's
    // InvoiceTrasladoInput schema — a mercancía transfer has no payment.
    if (!isTraslado) {
      body.payment_form = paymentForm;
      body.payment_method = paymentMethod;
    }
    if (customerId) body.customer = customerId;
    if (documentType === "nota_credito" && relatedInvoice) {
      body.related_documents = [{ relationship: relationshipCode, documents: [relatedInvoice.uuid] }];
    }
    if (isCartaPorte && !cartaPorteError) {
      body.complements = [buildCartaPorteComplement(cartaPorteStateToInput(cartaPorte))];
    }
    // customs_keys on each item is what legally ties the CFDI to the
    // pedimento (InformacionAduanera), but FacturAPI's own PDF template
    // repeats it under every line item; this adds one clean summary line
    // for readability. It renders after the totals block, not at the top —
    // FacturAPI's template doesn't offer a way to inject content above the
    // items table.
    if (pedNum) {
      const parts = [`<strong>Pedimento:</strong> ${formatPedimentoForCfdi(pedNum)}`];
      if (pedimentoLink?.fechaPago) parts.push(`<strong>Fecha:</strong> ${isoToSlash(pedimentoLink.fechaPago)}`);
      const aduana = aduanaName(pedimentoLink?.claveAduana);
      if (aduana) parts.push(`<strong>Aduana:</strong> ${pedimentoLink!.claveAduana} - ${aduana}`);
      body.pdf_custom_section = `<div style="margin-top:8px;padding:6px 8px;border:1px solid #2f6fed;font-size:12px">${parts.join(" &nbsp;|&nbsp; ")}</div>`;
    }
    if (currency !== "MXN") {
      const tc = Number(exchangeRate);
      if (!tc && !draftMode) {
        setError("Ingresa el tipo de cambio para facturar en USD");
        return null;
      }
      if (tc) body.exchange = tc;
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
        const data = await res.json().catch(() => null);
        setError(
          data?.error
            ? `Vista previa no disponible: ${data.error}`
            : "Vista previa no disponible (puede no estar disponible en sandbox)"
        );
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
      // Editing a saved draft: persist the latest edits first (a stamp call
      // takes no body and just timbra whatever FacturAPI already has stored
      // for it), then timbrar it.
      if (draft) {
        const putRes = await fetch(`/api/facturas/${draft.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const putData = await putRes.json();
        if (!putRes.ok) {
          setError(putData.error ?? "Error al guardar los cambios del borrador");
          return;
        }
      }

      const res = draft
        ? await fetch(`/api/facturas/${draft.id}/stamp`, { method: "POST" })
        : await fetch("/api/facturas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al timbrar la factura");
        return;
      }
      onSaved?.();
      const folio = [data.series, data.folio_number].filter(Boolean).join("-");
      alertSuccess("Factura timbrada", folio ? `Folio ${folio} generado correctamente.` : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDraft() {
    setError(null);
    const body = buildInvoiceBody(true);
    if (!body) return;
    setSavingDraft(true);
    try {
      const res = draft
        ? await fetch(`/api/facturas/${draft.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/facturas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...body, status: "draft" }),
          });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al guardar el borrador");
        return;
      }
      onSaved?.();
      alertSuccess("Borrador guardado", "Podrás retomarlo desde la lista de facturas.");
    } finally {
      setSavingDraft(false);
    }
  }

  const selectableItems = items.filter((it) => !it.isAduaneros);

  return (
    <>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {documentType === "carta_porte_ingreso" ? "Cuota del transportista a facturar" : "Partidas a facturar"}
            </label>
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              onClick={() => setItems((p) => [...p, newItemRow()])}
            >
              + Agregar concepto
            </Button>
          </div>
          {documentType === "carta_porte_ingreso" && (
            <p className="text-[11px] text-muted-foreground mb-1.5">
              Factura únicamente el servicio de transporte (flete). Las mercancías transportadas se declaran en la sección
              Carta Porte más abajo, no aquí.
            </p>
          )}
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
                  {!pedimento && (
                    <th className="text-left px-2 py-2 font-semibold w-24">
                      Fracción <span className="font-normal text-muted-foreground">(opc.)</span>
                    </th>
                  )}
                  <th className="text-left px-2 py-2 font-semibold w-32">
                    {pedimento ? (
                      "ClaveProdServ"
                    ) : (
                      <div className="flex items-center gap-1.5">
                        ClaveProdServ
                        <Button
                          size="sm"
                          title="Autocompletar claves SAT con IA"
                          aria-label="Autocompletar claves SAT con IA"
                          className="h-6 w-6 p-0 bg-gradient-to-br from-orange-500 to-orange-700 text-white hover:brightness-[1.07] shadow-sm normal-case tracking-normal"
                          onClick={handleAutomap}
                          disabled={automap.running}
                        >
                          {automap.running ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      </div>
                    )}
                  </th>
                  <th className="text-left px-2 py-2 font-semibold w-20">Unidad</th>
                  <th className="text-left px-2 py-2 font-semibold w-16">IVA</th>
                  <th className="w-6" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {itemsLoading && (
                  <tr>
                    <td colSpan={8} className="px-2 py-4 text-center text-muted-foreground">
                      Cargando partidas…
                    </td>
                  </tr>
                )}
                {items.map((it) => (
                  <Fragment key={it.key}>
                    <tr className={it.isAduaneros ? "bg-muted/30" : undefined}>
                    <td className="px-2 py-1.5 align-middle">
                      <input
                        type="checkbox"
                        checked={it.checked}
                        onChange={(e) => updateItem(it.key, { checked: e.target.checked })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        className="h-7 text-xs md:text-xs min-w-[180px]"
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
                          className="h-7 text-xs md:text-xs text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          type="number"
                          value={it.cantidad}
                          onChange={(e) => updateItem(it.key, { cantidad: e.target.value })}
                        />
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        className="h-7 text-xs md:text-xs text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        type="number"
                        placeholder="0.00000"
                        value={it.precio}
                        onChange={(e) => updateItem(it.key, { precio: e.target.value })}
                      />
                    </td>
                    {!pedimento && (
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-7 text-xs md:text-xs font-mono min-w-[90px]"
                          placeholder="8 dígitos"
                          value={it.fraccion ?? ""}
                          onChange={(e) => updateItem(it.key, { fraccion: e.target.value })}
                        />
                      </td>
                    )}
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
                    <td className="px-2 py-1.5">
                      <select
                        className="w-full rounded-md border border-input px-1 py-1 text-xs h-7"
                        value={it.ivaRate ?? ivaRate}
                        onChange={(e) => updateItem(it.key, { ivaRate: Number(e.target.value) as 16 | 8 | 0 })}
                      >
                        <option value={16}>16%</option>
                        <option value={8}>8%</option>
                        <option value={0}>0%</option>
                      </select>
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
                    {!pedimento && it.honorariosTipo === "comercializadora" && (
                      <tr className="bg-muted/20">
                        <td />
                        <td colSpan={7} className="px-2 py-1.5">
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
                                  className="h-6 w-16 text-xs md:text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                  type="number"
                                  value={retIsr}
                                  onChange={(e) => setRetIsr(e.target.value)}
                                />
                                %
                              </label>
                              <label className="flex items-center gap-1">
                                IVA ret.
                                <Input
                                  className="h-6 w-16 text-xs md:text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
                  </Fragment>
                ))}
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
              value={documentType}
              onChange={(e) => handleDocumentTypeChange(e.target.value as DocumentType)}
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
              <Button
                size="sm"
                variant={ivaRate === 0 ? "default" : "outline"}
                className="h-8 px-3 text-xs flex-1"
                onClick={() => setIvaRate(0)}
              >
                0%
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
                  className="h-6 w-20 text-xs md:text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  type="number"
                  min="0.01"
                  step="0.0001"
                  value={exchangeRate}
                  disabled={!!pedimentoLink}
                  onChange={(e) => setExchangeRate(e.target.value)}
                />
                {pedimentoLink && (
                  <span className="text-[10px] text-muted-foreground">(tomado del pedimento)</span>
                )}
              </div>
            )}
          </div>
        </div>

        {documentType === "nota_credito" && (
          <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-muted/20 p-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Factura relacionada</label>
              <Popover open={relatedInvoiceOpen} onOpenChange={setRelatedInvoiceOpen}>
                <PopoverTrigger
                  disabled={!customerId}
                  className="w-full flex items-center justify-between rounded-md border border-input px-3 py-2 text-sm text-left mt-1 disabled:opacity-50"
                >
                  <span className={relatedInvoice ? "" : "text-muted-foreground"}>
                    {!customerId
                      ? "Selecciona un cliente primero"
                      : relatedInvoice
                        ? `${relatedInvoice.folio}${relatedInvoice.total != null ? ` — $${relatedInvoice.total}` : ""}`
                        : "— Selecciona la factura a corregir —"}
                  </span>
                  <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar folio…" />
                    <CommandList>
                      <CommandEmpty>
                        {relatedInvoiceLoading ? "Cargando…" : "Sin facturas vigentes para este cliente."}
                      </CommandEmpty>
                      <CommandGroup>
                        {relatedInvoiceCandidates.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={c.folio}
                            onSelect={() => {
                              setRelatedInvoice(c);
                              setRelatedInvoiceOpen(false);
                            }}
                          >
                            <div>
                              <div className="font-mono text-xs">{c.folio}</div>
                              {c.total != null && (
                                <div className="text-[10px] text-muted-foreground">${c.total}</div>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Relación (SAT)</label>
              <select
                className="w-full rounded-md border border-input px-2 py-1.5 text-xs mt-1"
                value={relationshipCode}
                onChange={(e) => setRelationshipCode(e.target.value as RelationshipCode)}
              >
                {RELATIONSHIP_CODE_OPTIONS.map(([code, label]) => (
                  <option key={code} value={code}>
                    {code} – {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {isCartaPorte && (
          <CartaPorteFields
            value={cartaPorte}
            onChange={setCartaPorte}
            vehiculos={vehiculosList}
            choferes={choferesList}
            direcciones={direccionesList}
            onVehiculoCreated={(v) => setVehiculosList((prev) => [...prev, v])}
            onChoferCreated={(c) => setChoferesList((prev) => [...prev, c])}
            onDireccionCreated={(d) => setDireccionesList((prev) => [...prev, d])}
          />
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button variant="outline" size="sm" onClick={handlePreview} disabled={previewing}>
          {previewing && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
          Vista previa PDF
        </Button>
        <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={savingDraft || saving}>
          {savingDraft && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
          Guardar borrador
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving || savingDraft}>
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
          Timbrar factura
        </Button>
      </DialogFooter>

      <AutomapOverlay
        running={automap.running}
        progress={automap.progress}
        statusText={automap.statusText}
        done={automap.done}
      />
    </>
  );
}
