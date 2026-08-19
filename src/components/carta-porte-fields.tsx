"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { BadgeCheck, Check, ChevronsUpDown, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { SatComboBox } from "@/components/sat-combobox";
import { DireccionForm, emptyDireccionForm, type DireccionFormState } from "@/components/direccion-form";
import { alertError } from "@/lib/alerts";
import {
  CONFIG_VEHICULAR_OPTIONS,
  ENTRADA_SALIDA_OPTIONS,
  FIGURA_TRANSPORTE_OPTIONS,
  PERMISO_SCT_OPTIONS,
  TIPO_EMBALAJE_OPTIONS,
  UNIDAD_PESO_OPTIONS,
  VIA_ENTRADA_SALIDA_OPTIONS,
} from "@/lib/cartaPorteOptions";
import type { CartaPorteComplementInput, CartaPorteDomicilio, MercanciaInput } from "@/lib/buildCartaPorte";

export interface VehiculoLite {
  id: string;
  placa: string;
  configVehicular: string | null;
  permisoSct: string | null;
  numeroPermiso: string | null;
  aseguradoraCarga: string | null;
  polizaCarga: string | null;
  aseguradoraRespCivil: string | null;
  polizaRespCivil: string | null;
  pesoBrutoVehicular: string | null;
  anioModeloVehiculo: string | null;
  remolques: { subTipoRemolque: string; placa: string }[];
}

export interface ChoferLite {
  id: string;
  nombre: string;
  rfc: string;
  numeroLicencia: string | null;
}

// Permanently classified as origen/destino (issue #21) — the picker only
// offers each ubicación section its matching tipo (issue #23).
export interface DireccionLite {
  id: string;
  tipo: "origen" | "destino";
  etiqueta: string;
  rfc: string;
  nombre: string | null;
  calle: string | null;
  numeroExterior: string | null;
  numeroInterior: string | null;
  colonia: string | null;
  municipio: string | null;
  localidad: string | null;
  estado: string | null;
  pais: string | null;
  codigoPostal: string | null;
  googlePlaceId: string | null;
}

interface UbicacionFields {
  rfc: string;
  nombre: string;
  fechaHoraSalidaLlegada: string; // datetime-local value: AAAA-MM-DDThh:mm
  calle: string;
  numeroExterior: string;
  numeroInterior: string;
  colonia: string;
  municipio: string;
  localidad: string;
  estado: string;
  pais: string;
  codigoPostal: string;
  // Set when this ubicación was populated from a verified (has a
  // google_place_id) saved dirección — issue #20. Cleared as soon as any
  // domicilio field is hand-edited, since the edited address may no longer
  // be the place Google resolved.
  googlePlaceId: string | null;
}

function defaultUbicacion(): UbicacionFields {
  return {
    rfc: "",
    nombre: "",
    fechaHoraSalidaLlegada: "",
    calle: "",
    numeroExterior: "",
    numeroInterior: "",
    colonia: "",
    municipio: "",
    localidad: "",
    estado: "",
    pais: "MEX",
    codigoPostal: "",
    googlePlaceId: null,
  };
}

export interface MercanciaRow {
  key: string;
  bienesTransp: string;
  bienesTranspDescription?: string;
  descripcion: string;
  cantidad: string;
  claveUnidad: string;
  claveUnidadDescription?: string;
  pesoEnKg: string;
  materialPeligroso: boolean;
  cveMaterialPeligroso: string;
  embalaje: string;
  descripEmbalaje: string;
}

function newMercanciaRow(): MercanciaRow {
  return {
    key: crypto.randomUUID(),
    bienesTransp: "",
    descripcion: "",
    cantidad: "1",
    claveUnidad: "",
    pesoEnKg: "0",
    materialPeligroso: false,
    cveMaterialPeligroso: "",
    embalaje: "",
    descripEmbalaje: "",
  };
}

// Turns a mapPedimentoToMercancias() result row into a UI MercanciaRow —
// shares newMercanciaRow's defaults for the fields a pedimento partida can't
// supply (materialPeligroso/embalaje/etc.), so both stay in sync in one place.
export function mercanciaRowFromPrefill(m: MercanciaInput): MercanciaRow {
  return {
    ...newMercanciaRow(),
    bienesTransp: m.bienesTransp,
    descripcion: m.descripcion,
    cantidad: String(m.cantidad),
    claveUnidad: m.claveUnidad,
    pesoEnKg: String(m.pesoEnKg),
  };
}

interface AutotransporteFields {
  permisoSct: string;
  numeroPermisoSct: string;
  configVehicular: string;
  placa: string;
  pesoBrutoVehicular: string;
  anioModeloVehiculo: string;
  aseguradoraCarga: string;
  polizaCarga: string;
  aseguradoraRespCivil: string;
  polizaRespCivil: string;
  remolques: { subTipoRemolque: string; placa: string }[];
}

function defaultAutotransporte(): AutotransporteFields {
  return {
    permisoSct: "",
    numeroPermisoSct: "",
    configVehicular: "",
    placa: "",
    pesoBrutoVehicular: "",
    anioModeloVehiculo: "",
    aseguradoraCarga: "",
    polizaCarga: "",
    aseguradoraRespCivil: "",
    polizaRespCivil: "",
    remolques: [],
  };
}

export interface FiguraRow {
  key: string;
  choferId: string;
  nombre: string;
  rfc: string;
  numeroLicencia: string;
  tipoFigura: string;
}

export interface CartaPorteFormState {
  ubicacionOrigen: UbicacionFields;
  ubicacionDestino: UbicacionFields;
  mercancias: MercanciaRow[];
  pesoBrutoTotal: string;
  unidadPeso: string;
  distanciaRecorridaKm: string;
  internacionalEnabled: boolean;
  entradaSalidaMerc: "Entrada" | "Salida";
  paisOrigenDestino: string;
  viaEntradaSalida: string;
  vehiculoId: string;
  autotransporte: AutotransporteFields;
  figuras: FiguraRow[];
}

export function defaultCartaPorteState(): CartaPorteFormState {
  return {
    ubicacionOrigen: defaultUbicacion(),
    ubicacionDestino: defaultUbicacion(),
    mercancias: [newMercanciaRow()],
    pesoBrutoTotal: "0",
    unidadPeso: "KGM",
    distanciaRecorridaKm: "",
    internacionalEnabled: false,
    entradaSalidaMerc: "Salida",
    paisOrigenDestino: "",
    viaEntradaSalida: "01",
    vehiculoId: "",
    autotransporte: defaultAutotransporte(),
    figuras: [],
  };
}

function buildDomicilio(u: UbicacionFields): CartaPorteDomicilio {
  return {
    Estado: u.estado,
    Pais: u.pais,
    CodigoPostal: u.codigoPostal,
    Calle: u.calle || undefined,
    NumeroExterior: u.numeroExterior || undefined,
    NumeroInterior: u.numeroInterior || undefined,
    Colonia: u.colonia || undefined,
    Localidad: u.localidad || undefined,
    Municipio: u.municipio || undefined,
  };
}

// Pure transformation from the dialog's UI-shaped state (strings for every
// numeric input, same convention as ItemRow) to buildCartaPorteComplement's
// input shape.
export function cartaPorteStateToInput(state: CartaPorteFormState): CartaPorteComplementInput {
  return {
    ubicacionOrigen: {
      rfc: state.ubicacionOrigen.rfc.trim(),
      nombre: state.ubicacionOrigen.nombre.trim() || undefined,
      fechaHoraSalidaLlegada: state.ubicacionOrigen.fechaHoraSalidaLlegada,
      domicilio: buildDomicilio(state.ubicacionOrigen),
    },
    ubicacionDestino: {
      rfc: state.ubicacionDestino.rfc.trim(),
      nombre: state.ubicacionDestino.nombre.trim() || undefined,
      fechaHoraSalidaLlegada: state.ubicacionDestino.fechaHoraSalidaLlegada,
      domicilio: buildDomicilio(state.ubicacionDestino),
    },
    mercancias: state.mercancias.map((m) => ({
      bienesTransp: m.bienesTransp.trim(),
      descripcion: m.descripcion.trim(),
      cantidad: Number(m.cantidad) || 0,
      claveUnidad: m.claveUnidad.trim(),
      pesoEnKg: Number(m.pesoEnKg) || 0,
      materialPeligroso: m.materialPeligroso,
      cveMaterialPeligroso: m.materialPeligroso ? m.cveMaterialPeligroso.trim() || undefined : undefined,
      embalaje: m.embalaje || undefined,
      descripEmbalaje: m.descripEmbalaje.trim() || undefined,
    })),
    pesoBrutoTotal: Number(state.pesoBrutoTotal) || 0,
    unidadPeso: state.unidadPeso,
    distanciaRecorridaKm: Number(state.distanciaRecorridaKm) || 0,
    autotransporte: {
      permisoSct: state.autotransporte.permisoSct || undefined,
      numeroPermisoSct: state.autotransporte.numeroPermisoSct.trim() || undefined,
      configVehicular: state.autotransporte.configVehicular || undefined,
      placa: state.autotransporte.placa.trim() || undefined,
      pesoBrutoVehicular: state.autotransporte.pesoBrutoVehicular
        ? Number(state.autotransporte.pesoBrutoVehicular)
        : undefined,
      anioModeloVehiculo: state.autotransporte.anioModeloVehiculo.trim() || undefined,
      aseguradoraCarga: state.autotransporte.aseguradoraCarga.trim() || undefined,
      polizaCarga: state.autotransporte.polizaCarga.trim() || undefined,
      aseguradoraRespCivil: state.autotransporte.aseguradoraRespCivil.trim() || undefined,
      polizaRespCivil: state.autotransporte.polizaRespCivil.trim() || undefined,
      remolques: state.autotransporte.remolques.length > 0 ? state.autotransporte.remolques : undefined,
    },
    figurasTransporte: state.figuras.map((f) => ({
      tipoFigura: f.tipoFigura,
      nombreFigura: f.nombre,
      rfc: f.rfc || undefined,
      numeroLicencia: f.numeroLicencia || undefined,
    })),
    internacional: state.internacionalEnabled
      ? {
          entradaSalidaMerc: state.entradaSalidaMerc,
          paisOrigenDestino: state.paisOrigenDestino.trim().toUpperCase(),
          viaEntradaSalida: state.viaEntradaSalida,
        }
      : undefined,
  };
}

function validateUbicacion(u: UbicacionFields, label: string): string | null {
  if (!u.rfc.trim()) return `RFC de ${label} es requerido`;
  if (!u.fechaHoraSalidaLlegada) return `Fecha/hora de ${label} es requerida`;
  if (!u.estado.trim() || !u.pais.trim() || !u.codigoPostal.trim()) {
    return `Domicilio de ${label} requiere estado, país y código postal`;
  }
  return null;
}

export function validateCartaPorteState(state: CartaPorteFormState): string | null {
  const origenError = validateUbicacion(state.ubicacionOrigen, "origen");
  if (origenError) return origenError;
  const destinoError = validateUbicacion(state.ubicacionDestino, "destino");
  if (destinoError) return destinoError;

  if (state.mercancias.length === 0) return "Agrega al menos una mercancía";
  for (const m of state.mercancias) {
    if (!m.bienesTransp.trim() || !m.descripcion.trim() || !m.claveUnidad.trim()) {
      return "Cada mercancía requiere bienes transportados, descripción y clave de unidad";
    }
  }

  if (!state.autotransporte.placa.trim()) return "Selecciona o captura un vehículo (placa)";

  const distancia = state.distanciaRecorridaKm.trim();
  if (!distancia || !Number.isFinite(Number(distancia)) || Number(distancia) <= 0) {
    return "La distancia recorrida (km) debe ser mayor a 0";
  }

  const anioModelo = state.autotransporte.anioModeloVehiculo.trim();
  if (anioModelo) {
    const anioNum = Number(anioModelo);
    const maxYear = new Date().getFullYear() + 2;
    if (!/^\d{4}$/.test(anioModelo) || anioNum < 1900 || anioNum > maxYear) {
      return `El año modelo del vehículo debe ser un año de 4 dígitos entre 1900 y ${maxYear}`;
    }
  }

  const pesoBruto = state.autotransporte.pesoBrutoVehicular.trim();
  if (pesoBruto && (!Number.isFinite(Number(pesoBruto)) || Number(pesoBruto) <= 0)) {
    return "El peso bruto vehicular debe ser un número mayor a 0";
  }

  if (state.figuras.length === 0) return "Agrega al menos una figura de transporte (ej. el chofer operador)";
  for (const f of state.figuras) {
    if (!f.tipoFigura || !f.nombre.trim()) {
      return "Cada figura de transporte requiere tipo de figura y nombre";
    }
  }

  if (state.internacionalEnabled && !state.paisOrigenDestino.trim()) {
    return "Indica el país de origen/destino para transporte internacional";
  }

  return null;
}

function sumPesoEnKg(mercancias: MercanciaRow[]): number {
  return mercancias.reduce((acc, m) => acc + (Number(m.pesoEnKg) || 0), 0);
}

interface CartaPorteFieldsProps {
  value: CartaPorteFormState;
  onChange: (next: CartaPorteFormState) => void;
  vehiculos: VehiculoLite[];
  choferes: ChoferLite[];
  direcciones: DireccionLite[];
  // Called after a successful inline registry create so the parent can grow
  // its vehiculos/choferes/direcciones lists — this component doesn't own
  // that state, it's fetched once by the invoice dialog and shared with the
  // picker.
  onVehiculoCreated?: (v: VehiculoLite) => void;
  onChoferCreated?: (c: ChoferLite) => void;
  onDireccionCreated?: (d: DireccionLite) => void;
}

interface InlineVehiculoFormState {
  placa: string;
  configVehicular: string;
  permisoSct: string;
  numeroPermiso: string;
  aseguradoraCarga: string;
  polizaCarga: string;
  aseguradoraRespCivil: string;
  polizaRespCivil: string;
  pesoBrutoVehicular: string;
  anioModeloVehiculo: string;
}

function InlineVehiculoForm({
  onCancel,
  onCreated,
  showHeading = true,
}: {
  onCancel: () => void;
  onCreated: (v: VehiculoLite) => void;
  showHeading?: boolean;
}) {
  const [form, setForm] = useState<InlineVehiculoFormState>({
    placa: "",
    configVehicular: "",
    permisoSct: "",
    numeroPermiso: "",
    aseguradoraCarga: "",
    polizaCarga: "",
    aseguradoraRespCivil: "",
    polizaRespCivil: "",
    pesoBrutoVehicular: "",
    anioModeloVehiculo: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!form.placa.trim()) {
      setError("La placa es requerida");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/vehiculos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placa: form.placa.trim().toUpperCase(),
          config_vehicular: form.configVehicular || null,
          permiso_sct: form.permisoSct || null,
          numero_permiso: form.numeroPermiso.trim() || null,
          aseguradora_carga: form.aseguradoraCarga.trim() || null,
          poliza_carga: form.polizaCarga.trim() || null,
          aseguradora_resp_civil: form.aseguradoraRespCivil.trim() || null,
          poliza_resp_civil: form.polizaRespCivil.trim() || null,
          peso_bruto_vehicular: form.pesoBrutoVehicular.trim() || null,
          anio_modelo_vehiculo: form.anioModeloVehiculo.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al guardar");
        return;
      }
      onCreated(data as VehiculoLite);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-3 flex flex-col gap-2">
      {showHeading && <p className="text-xs font-semibold">Nuevo vehículo</p>}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground">Placa</label>
          <Input
            className="h-7 text-xs"
            value={form.placa}
            onChange={(e) => setForm((f) => ({ ...f, placa: e.target.value.toUpperCase() }))}
            autoFocus
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Config. vehicular</label>
          <select
            className="w-full rounded-md border border-input px-2 py-1 text-xs h-7"
            value={form.configVehicular}
            onChange={(e) => setForm((f) => ({ ...f, configVehicular: e.target.value }))}
          >
            <option value="">—</option>
            {CONFIG_VEHICULAR_OPTIONS.map(([code, label]) => (
              <option key={code} value={code}>
                {code} – {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground">Permiso SCT</label>
          <select
            className="w-full rounded-md border border-input px-2 py-1 text-xs h-7"
            value={form.permisoSct}
            onChange={(e) => setForm((f) => ({ ...f, permisoSct: e.target.value }))}
          >
            <option value="">—</option>
            {PERMISO_SCT_OPTIONS.map(([code, label]) => (
              <option key={code} value={code}>
                {code} – {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">No. Permiso</label>
          <Input
            className="h-7 text-xs"
            value={form.numeroPermiso}
            onChange={(e) => setForm((f) => ({ ...f, numeroPermiso: e.target.value }))}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground">Peso bruto vehicular</label>
          <Input
            className="h-7 text-xs"
            type="number"
            value={form.pesoBrutoVehicular}
            onChange={(e) => setForm((f) => ({ ...f, pesoBrutoVehicular: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Año modelo</label>
          <Input
            className="h-7 text-xs"
            type="number"
            value={form.anioModeloVehiculo}
            onChange={(e) => setForm((f) => ({ ...f, anioModeloVehiculo: e.target.value }))}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground">Aseguradora (carga)</label>
          <Input
            className="h-7 text-xs"
            value={form.aseguradoraCarga}
            onChange={(e) => setForm((f) => ({ ...f, aseguradoraCarga: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Póliza (carga)</label>
          <Input
            className="h-7 text-xs"
            value={form.polizaCarga}
            onChange={(e) => setForm((f) => ({ ...f, polizaCarga: e.target.value }))}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground">Aseguradora (resp. civil)</label>
          <Input
            className="h-7 text-xs"
            value={form.aseguradoraRespCivil}
            onChange={(e) => setForm((f) => ({ ...f, aseguradoraRespCivil: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Póliza (resp. civil)</label>
          <Input
            className="h-7 text-xs"
            value={form.polizaRespCivil}
            onChange={(e) => setForm((f) => ({ ...f, polizaRespCivil: e.target.value }))}
          />
        </div>
      </div>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
      <div className="flex items-center justify-end gap-1.5 mt-1">
        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button size="sm" className="h-6 px-2 text-xs" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
          Guardar y usar
        </Button>
      </div>
    </div>
  );
}

interface InlineChoferFormState {
  nombre: string;
  rfc: string;
  numeroLicencia: string;
}

function InlineChoferForm({
  onCancel,
  onCreated,
  showHeading = true,
}: {
  onCancel: () => void;
  onCreated: (c: ChoferLite) => void;
  showHeading?: boolean;
}) {
  const [form, setForm] = useState<InlineChoferFormState>({ nombre: "", rfc: "", numeroLicencia: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!form.nombre.trim() || !form.rfc.trim()) {
      setError("Nombre y RFC son requeridos");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/choferes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: form.nombre.trim(),
          rfc: form.rfc.trim().toUpperCase(),
          numero_licencia: form.numeroLicencia.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al guardar");
        return;
      }
      onCreated(data as ChoferLite);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-3 flex flex-col gap-2">
      {showHeading && <p className="text-xs font-semibold">Nuevo chofer</p>}
      <div>
        <label className="text-[10px] text-muted-foreground">Nombre</label>
        <Input
          className="h-7 text-xs"
          value={form.nombre}
          onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
          autoFocus
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground">RFC</label>
          <Input
            className="h-7 text-xs font-mono"
            value={form.rfc}
            onChange={(e) => setForm((f) => ({ ...f, rfc: e.target.value.toUpperCase() }))}
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Núm. Licencia</label>
          <Input
            className="h-7 text-xs"
            value={form.numeroLicencia}
            onChange={(e) => setForm((f) => ({ ...f, numeroLicencia: e.target.value }))}
          />
        </div>
      </div>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
      <div className="flex items-center justify-end gap-1.5 mt-1">
        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button size="sm" className="h-6 px-2 text-xs" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
          Guardar y usar
        </Button>
      </div>
    </div>
  );
}

function InlineDireccionForm({
  tipo,
  onCancel,
  onCreated,
  showHeading = true,
}: {
  tipo: "origen" | "destino";
  onCancel: () => void;
  onCreated: (d: DireccionLite) => void;
  showHeading?: boolean;
}) {
  const [form, setForm] = useState<DireccionFormState>(emptyDireccionForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!form.etiqueta.trim() || !form.rfc.trim()) {
      setError("Etiqueta y RFC son requeridos");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/direcciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          etiqueta: form.etiqueta.trim(),
          rfc: form.rfc.trim().toUpperCase(),
          nombre: form.nombre.trim() || null,
          calle: form.calle.trim() || null,
          numero_exterior: form.numeroExterior.trim() || null,
          numero_interior: form.numeroInterior.trim() || null,
          colonia: form.colonia.trim() || null,
          municipio: form.municipio.trim() || null,
          localidad: form.localidad.trim() || null,
          estado: form.estado.trim() || null,
          pais: form.pais.trim() || null,
          codigo_postal: form.codigoPostal.trim() || null,
          google_place_id: form.googlePlaceId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al guardar");
        return;
      }
      onCreated(data as DireccionLite);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-3 flex flex-col gap-2">
      {showHeading && <p className="text-xs font-semibold">Nueva dirección</p>}
      <DireccionForm value={form} onChange={setForm} />
      {error && <p className="text-[11px] text-red-600">{error}</p>}
      <div className="flex items-center justify-end gap-1.5 mt-1">
        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button size="sm" className="h-6 px-2 text-xs" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
          Guardar y usar
        </Button>
      </div>
    </div>
  );
}

// "pais" is excluded — defaultUbicacion() prefills it to "MEX", so it's
// present even on a never-touched ubicación and would otherwise make every
// section look "filled" from the moment the dialog opens.
function hasAddressData(u: UbicacionFields): boolean {
  return !!(u.rfc.trim() || u.nombre.trim() || u.calle.trim() || u.colonia.trim() || u.estado.trim() || u.codigoPostal.trim());
}

// Sized to content rather than stretched across a grid track (see the
// flex/justify-center wrappers around each pair) — a solid border + tinted
// fill + shadow reads as clickable, whereas the dashed-border/no-fill
// version it replaced looked more like an empty placeholder.
const cardButtonClass =
  "flex flex-1 sm:flex-none sm:w-44 flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-muted/30 p-3 text-center shadow-sm transition-all hover:border-primary hover:bg-muted/60 hover:shadow-md active:scale-[0.98]";

function AddressSummaryCard({ value }: { value: UbicacionFields }) {
  const calleLine = [value.calle, value.numeroExterior].filter(Boolean).join(" ");
  const restLine = [value.colonia, value.municipio, value.estado, value.codigoPostal].filter(Boolean).join(", ");
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium truncate">{value.nombre.trim() || value.rfc.trim() || "—"}</p>
          {value.rfc.trim() && <p className="text-[10px] text-muted-foreground font-mono">{value.rfc}</p>}
        </div>
        {value.googlePlaceId && (
          <Badge variant="outline" className="gap-1 shrink-0 border-emerald-200 bg-emerald-50 text-emerald-700">
            <BadgeCheck className="w-3 h-3" />
            Verificada
          </Badge>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mt-1">
        {calleLine || "Sin calle"}
        {restLine ? `, ${restLine}` : ""}
      </p>
    </div>
  );
}

function UbicacionSection({
  label,
  tipo,
  value,
  onChange,
  direcciones,
  onDireccionCreated,
}: {
  label: string;
  tipo: "origen" | "destino";
  value: UbicacionFields;
  onChange: (next: UbicacionFields) => void;
  direcciones: DireccionLite[];
  onDireccionCreated?: (d: DireccionLite) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  // "Agregar nueva" from the empty-state card opens this modal — it reuses
  // InlineDireccionForm so the address is actually persisted to the
  // direcciones registry (and shows up under "Usar dirección guardada"
  // afterward), not just filled into this invoice's ephemeral fields.
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  // Three states: "picker" (nothing entered yet — show the two choice
  // cards), "summary" (an address is resolved — show the compact card),
  // "manual" (hand-editing every domicilio field). Initialized from
  // whatever the caller passed in (e.g. reopening a draft) so we don't
  // regress an already-filled ubicación back to the empty picker.
  const [mode, setMode] = useState<"picker" | "summary" | "manual">(() => {
    if (value.googlePlaceId) return "summary";
    if (hasAddressData(value)) return "manual";
    return "picker";
  });

  function set<K extends keyof UbicacionFields>(key: K, v: UbicacionFields[K]) {
    onChange({ ...value, [key]: v });
  }

  // Any hand-edit to a domicilio field Google actually resolves invalidates
  // a place_id carried in from a verified dirección (issue #20) — the
  // edited address may no longer be the place Google resolved, so keep the
  // text-join distance-calc fallback instead of silently trusting a stale
  // place_id. Localidad and Número Interior are excluded — Google never
  // fills either, so editing them by hand isn't a sign the address changed.
  function setDomicilio<K extends keyof UbicacionFields>(key: K, v: UbicacionFields[K]) {
    onChange({ ...value, [key]: v, googlePlaceId: null });
  }

  function selectDireccion(d: DireccionLite) {
    onChange({
      ...value,
      rfc: d.rfc,
      nombre: d.nombre ?? value.nombre,
      calle: d.calle ?? value.calle,
      numeroExterior: d.numeroExterior ?? value.numeroExterior,
      numeroInterior: d.numeroInterior ?? value.numeroInterior,
      colonia: d.colonia ?? value.colonia,
      municipio: d.municipio ?? value.municipio,
      localidad: d.localidad ?? value.localidad,
      estado: d.estado ?? value.estado,
      pais: d.pais ?? value.pais,
      codigoPostal: d.codigoPostal ?? value.codigoPostal,
      googlePlaceId: d.googlePlaceId,
    });
    setPickerOpen(false);
    setMode("summary");
  }

  function handleDireccionCreated(d: DireccionLite) {
    onDireccionCreated?.(d);
    selectDireccion(d);
    setAdding(false);
  }

  const popoverBody = adding ? (
    <InlineDireccionForm tipo={tipo} onCancel={() => setAdding(false)} onCreated={handleDireccionCreated} />
  ) : (
    <Command>
      <CommandInput placeholder="Buscar dirección…" />
      <CommandList>
        <CommandEmpty>Sin direcciones guardadas.</CommandEmpty>
        <CommandGroup>
          {direcciones.map((d) => (
            <CommandItem key={d.id} value={`${d.etiqueta} ${d.rfc}`} onSelect={() => selectDireccion(d)}>
              <div className="flex items-center gap-1.5">
                <div>
                  <div className="text-xs">{d.etiqueta}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">{d.rfc}</div>
                </div>
                {d.googlePlaceId && <BadgeCheck className="w-3 h-3 text-emerald-600 shrink-0" />}
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
      <div className="border-t border-border p-1">
        <button
          type="button"
          className="w-full flex items-center gap-1.5 rounded px-2 py-1.5 text-xs hover:bg-muted"
          onClick={() => setAdding(true)}
        >
          <Plus className="w-3 h-3" />
          Nueva dirección
        </button>
      </div>
    </Command>
  );

  function closePicker(open: boolean) {
    setPickerOpen(open);
    if (!open) setAdding(false);
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold">{label}</p>
        {mode !== "picker" && (
          <div className="flex items-center gap-2">
            <Popover open={pickerOpen} onOpenChange={closePicker}>
              <PopoverTrigger className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                Cambiar
                <ChevronsUpDown className="w-3 h-3" />
              </PopoverTrigger>
              <PopoverContent className={adding ? "w-[420px] p-0" : "w-72 p-0"} align="end">
                {popoverBody}
              </PopoverContent>
            </Popover>
            {mode === "summary" ? (
              <button
                type="button"
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => setMode("manual")}
              >
                <Pencil className="w-3 h-3" />
                Editar
              </button>
            ) : (
              <button
                type="button"
                className="text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => setMode(hasAddressData(value) ? "summary" : "picker")}
              >
                Listo
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mb-2">
        <label className="text-[10px] text-muted-foreground">Fecha/hora estimada</label>
        <Input
          className="h-7 text-xs"
          type="datetime-local"
          value={value.fechaHoraSalidaLlegada}
          onChange={(e) => set("fechaHoraSalidaLlegada", e.target.value)}
        />
      </div>

      {mode === "picker" && (
        <div className="flex gap-2 justify-center">
          <Popover open={pickerOpen} onOpenChange={closePicker}>
            <PopoverTrigger className={cardButtonClass}>
              <Search className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-medium">Usar dirección guardada</span>
            </PopoverTrigger>
            <PopoverContent className={adding ? "w-[420px] p-0" : "w-72 p-0"} align="start">
              {popoverBody}
            </PopoverContent>
          </Popover>
          <button type="button" className={cardButtonClass} onClick={() => setAddDialogOpen(true)}>
            <Plus className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium">Agregar nueva</span>
          </button>
        </div>
      )}

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva dirección de {label.toLowerCase()}</DialogTitle>
          </DialogHeader>
          <InlineDireccionForm
            tipo={tipo}
            showHeading={false}
            onCancel={() => setAddDialogOpen(false)}
            onCreated={(d) => {
              handleDireccionCreated(d);
              setAddDialogOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>

      {mode === "summary" && <AddressSummaryCard value={value} />}

      {mode === "manual" && (
        <>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="text-[10px] text-muted-foreground">RFC</label>
              <Input
                className="h-7 text-xs"
                value={value.rfc}
                onChange={(e) => set("rfc", e.target.value.toUpperCase())}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Nombre</label>
              <Input className="h-7 text-xs" value={value.nombre} onChange={(e) => set("nombre", e.target.value)} />
            </div>
          </div>
          {value.googlePlaceId && (
            <Badge variant="outline" className="w-fit gap-1 mb-2 border-emerald-200 bg-emerald-50 text-emerald-700">
              <BadgeCheck className="w-3 h-3" />
              Verificada por Google
            </Badge>
          )}
          <div className="grid grid-cols-3 gap-2 mb-2">
            <div>
              <label className="text-[10px] text-muted-foreground">Calle</label>
              <Input
                className="h-7 text-xs"
                value={value.calle}
                onChange={(e) => setDomicilio("calle", e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">No. Ext.</label>
              <Input
                className="h-7 text-xs"
                value={value.numeroExterior}
                onChange={(e) => setDomicilio("numeroExterior", e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">No. Int.</label>
              <Input
                className="h-7 text-xs"
                value={value.numeroInterior}
                onChange={(e) => set("numeroInterior", e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <div>
              <label className="text-[10px] text-muted-foreground">Colonia</label>
              <Input
                className="h-7 text-xs"
                value={value.colonia}
                onChange={(e) => setDomicilio("colonia", e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Municipio</label>
              <Input
                className="h-7 text-xs"
                value={value.municipio}
                onChange={(e) => setDomicilio("municipio", e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Localidad</label>
              <Input
                className="h-7 text-xs"
                value={value.localidad}
                onChange={(e) => set("localidad", e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground">Estado</label>
              <Input
                className="h-7 text-xs"
                placeholder="ej. BCN"
                value={value.estado}
                onChange={(e) => setDomicilio("estado", e.target.value.toUpperCase())}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">País</label>
              <Input
                className="h-7 text-xs"
                value={value.pais}
                onChange={(e) => setDomicilio("pais", e.target.value.toUpperCase())}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">C.P.</label>
              <Input
                className="h-7 text-xs"
                value={value.codigoPostal}
                onChange={(e) => setDomicilio("codigoPostal", e.target.value)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// "configVehicular"/"permisoSct" use SAT codes (truthy strings once set), the
// rest are free text — any of them present means the user has started
// filling this in by hand rather than picking a saved vehículo.
function hasVehiculoData(a: AutotransporteFields): boolean {
  return !!(
    a.placa.trim() ||
    a.configVehicular ||
    a.permisoSct ||
    a.numeroPermisoSct.trim() ||
    a.pesoBrutoVehicular.trim() ||
    a.anioModeloVehiculo.trim()
  );
}

function VehiculoSummaryCard({ placa, configVehicular }: { placa: string; configVehicular: string }) {
  const configLabel = CONFIG_VEHICULAR_OPTIONS.find(([code]) => code === configVehicular)?.[1];
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2.5">
      <p className="text-xs font-mono font-medium">{placa || "—"}</p>
      {configLabel && <p className="text-[11px] text-muted-foreground mt-0.5">{configLabel}</p>}
    </div>
  );
}

function VehiculoSection({
  vehiculoId,
  autotransporte,
  vehiculos,
  onSelect,
  onAuto,
  onVehiculoCreated,
}: {
  vehiculoId: string;
  autotransporte: AutotransporteFields;
  vehiculos: VehiculoLite[];
  onSelect: (v: VehiculoLite) => void;
  onAuto: <K extends keyof AutotransporteFields>(key: K, v: AutotransporteFields[K]) => void;
  onVehiculoCreated?: (v: VehiculoLite) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  // Same picker/summary/manual pattern as UbicacionSection — see its
  // comment. "summary" only for a registry-backed pick (vehiculoId set);
  // hand-typed placas with no matching registry entry go straight to
  // "manual" since there's nothing to summarize.
  const [mode, setMode] = useState<"picker" | "summary" | "manual">(() => {
    if (vehiculoId) return "summary";
    if (hasVehiculoData(autotransporte)) return "manual";
    return "picker";
  });

  function closePicker(open: boolean) {
    setPickerOpen(open);
    if (!open) setAdding(false);
  }

  function handleSelect(v: VehiculoLite) {
    onSelect(v);
    setPickerOpen(false);
    setAddDialogOpen(false);
    setAdding(false);
    setMode("summary");
  }

  function handleCreated(v: VehiculoLite) {
    onVehiculoCreated?.(v);
    handleSelect(v);
  }

  const popoverBody = adding ? (
    <InlineVehiculoForm onCancel={() => setAdding(false)} onCreated={handleCreated} />
  ) : (
    <Command>
      <CommandInput placeholder="Buscar placa…" />
      <CommandList>
        <CommandEmpty>Sin vehículos activos.</CommandEmpty>
        <CommandGroup>
          {vehiculos.map((v) => (
            <CommandItem key={v.id} value={v.placa} onSelect={() => handleSelect(v)}>
              <div>
                <div className="font-mono text-xs">{v.placa}</div>
                {v.configVehicular && <div className="text-[10px] text-muted-foreground">{v.configVehicular}</div>}
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
      <div className="border-t border-border p-1">
        <button
          type="button"
          className="w-full flex items-center gap-1.5 rounded px-2 py-1.5 text-xs hover:bg-muted"
          onClick={() => setAdding(true)}
        >
          <Plus className="w-3 h-3" />
          Nuevo vehículo
        </button>
      </div>
    </Command>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-medium text-muted-foreground">Vehículo</label>
        {mode !== "picker" && (
          <div className="flex items-center gap-2">
            <Popover open={pickerOpen} onOpenChange={closePicker}>
              <PopoverTrigger className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                Cambiar
                <ChevronsUpDown className="w-3 h-3" />
              </PopoverTrigger>
              <PopoverContent className={adding ? "w-[440px] p-0" : "w-80 p-0"} align="end">
                {popoverBody}
              </PopoverContent>
            </Popover>
            {mode === "summary" ? (
              <button
                type="button"
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => setMode("manual")}
              >
                <Pencil className="w-3 h-3" />
                Editar
              </button>
            ) : (
              <button
                type="button"
                className="text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => setMode(vehiculoId || hasVehiculoData(autotransporte) ? "summary" : "picker")}
              >
                Listo
              </button>
            )}
          </div>
        )}
      </div>

      {mode === "picker" && (
        <div className="flex gap-2">
          <Popover open={pickerOpen} onOpenChange={closePicker}>
            <PopoverTrigger className={cardButtonClass}>
              <Search className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-medium">Usar vehículo guardado</span>
            </PopoverTrigger>
            <PopoverContent className={adding ? "w-[440px] p-0" : "w-80 p-0"} align="start">
              {popoverBody}
            </PopoverContent>
          </Popover>
          <button type="button" className={cardButtonClass} onClick={() => setAddDialogOpen(true)}>
            <Plus className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium">Agregar nuevo</span>
          </button>
        </div>
      )}

      {mode === "summary" && (
        <VehiculoSummaryCard placa={autotransporte.placa} configVehicular={autotransporte.configVehicular} />
      )}

      {mode === "manual" && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground">Permiso SCT</label>
            <select
              className="w-full rounded-md border border-input px-2 py-1 text-xs h-7"
              value={autotransporte.permisoSct}
              onChange={(e) => onAuto("permisoSct", e.target.value)}
            >
              <option value="">—</option>
              {PERMISO_SCT_OPTIONS.map(([code, label]) => (
                <option key={code} value={code}>
                  {code} – {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">No. Permiso</label>
            <Input
              className="h-7 text-xs"
              value={autotransporte.numeroPermisoSct}
              onChange={(e) => onAuto("numeroPermisoSct", e.target.value)}
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Config. vehicular</label>
            <select
              className="w-full rounded-md border border-input px-2 py-1 text-xs h-7"
              value={autotransporte.configVehicular}
              onChange={(e) => onAuto("configVehicular", e.target.value)}
            >
              <option value="">—</option>
              {CONFIG_VEHICULAR_OPTIONS.map(([code, label]) => (
                <option key={code} value={code}>
                  {code} – {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Placa</label>
            <Input className="h-7 text-xs" value={autotransporte.placa} onChange={(e) => onAuto("placa", e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Peso bruto vehicular</label>
            <Input
              className="h-7 text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              type="number"
              value={autotransporte.pesoBrutoVehicular}
              onChange={(e) => onAuto("pesoBrutoVehicular", e.target.value)}
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Año modelo</label>
            <Input
              className="h-7 text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              type="number"
              value={autotransporte.anioModeloVehiculo}
              onChange={(e) => onAuto("anioModeloVehiculo", e.target.value)}
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Aseguradora (carga)</label>
            <Input
              className="h-7 text-xs"
              value={autotransporte.aseguradoraCarga}
              onChange={(e) => onAuto("aseguradoraCarga", e.target.value)}
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Póliza (carga)</label>
            <Input
              className="h-7 text-xs"
              value={autotransporte.polizaCarga}
              onChange={(e) => onAuto("polizaCarga", e.target.value)}
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Aseguradora (resp. civil)</label>
            <Input
              className="h-7 text-xs"
              value={autotransporte.aseguradoraRespCivil}
              onChange={(e) => onAuto("aseguradoraRespCivil", e.target.value)}
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Póliza (resp. civil)</label>
            <Input
              className="h-7 text-xs"
              value={autotransporte.polizaRespCivil}
              onChange={(e) => onAuto("polizaRespCivil", e.target.value)}
            />
          </div>
        </div>
      )}

      {autotransporte.remolques.length > 0 && (
        <p className="text-[10px] text-muted-foreground mt-1">
          Remolques: {autotransporte.remolques.map((r) => r.placa).join(", ")}
        </p>
      )}

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo vehículo</DialogTitle>
          </DialogHeader>
          <InlineVehiculoForm showHeading={false} onCancel={() => setAddDialogOpen(false)} onCreated={handleCreated} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function CartaPorteFields({
  value,
  onChange,
  vehiculos,
  choferes,
  direcciones,
  onVehiculoCreated,
  onChoferCreated,
  onDireccionCreated,
}: CartaPorteFieldsProps) {
  const [choferPickerOpen, setChoferPickerOpen] = useState(false);
  const [addingChofer, setAddingChofer] = useState(false);
  // "Agregar nuevo" from the empty-state card, same pattern as
  // VehiculoSection's addDialogOpen — opens a modal instead of the inline
  // popover form.
  const [addChoferDialogOpen, setAddChoferDialogOpen] = useState(false);
  const [calculatingDistancia, setCalculatingDistancia] = useState(false);
  // True once the current distanciaRecorridaKm came from the auto-calc
  // effect below (both ubicaciones Google-verified) — drives the "Calculado
  // automáticamente" badge. Cleared as soon as the user hand-edits the km
  // field, since it's no longer necessarily accurate for the addresses shown.
  const [distanciaAuto, setDistanciaAuto] = useState(false);

  // Kept in sync with `value` on every render (see valueRef effect below) so
  // the async distance fetch can merge its result into whatever the form's
  // latest state is when the response arrives, instead of clobbering edits
  // made elsewhere while the request was in flight.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  async function fetchDistanciaKm(origen: UbicacionFields, destino: UbicacionFields): Promise<number> {
    const res = await fetch("/api/carta-porte/distance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origen: {
          placeId: origen.googlePlaceId,
          calle: origen.calle,
          numeroExterior: origen.numeroExterior,
          colonia: origen.colonia,
          municipio: origen.municipio,
          estado: origen.estado,
          codigoPostal: origen.codigoPostal,
          pais: origen.pais,
        },
        destino: {
          placeId: destino.googlePlaceId,
          calle: destino.calle,
          numeroExterior: destino.numeroExterior,
          colonia: destino.colonia,
          municipio: destino.municipio,
          estado: destino.estado,
          codigoPostal: destino.codigoPostal,
          pais: destino.pais,
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error al calcular la distancia");
    return data.distanciaKm;
  }

  async function handleCalcularDistancia() {
    setCalculatingDistancia(true);
    try {
      const km = await fetchDistanciaKm(value.ubicacionOrigen, value.ubicacionDestino);
      setDistanciaAuto(false);
      onChange({ ...valueRef.current, distanciaRecorridaKm: String(km) });
    } catch (e) {
      alertError("Distancia recorrida", e instanceof Error ? e.message : "Error al calcular la distancia");
    } finally {
      setCalculatingDistancia(false);
    }
  }

  // Auto-calculates as soon as both ubicaciones are Google-verified —
  // guarded by lastAutoPairRef so it only re-fetches when the actual
  // (origen, destino) place pair changes, not on every keystroke elsewhere
  // in the form. pairKey is re-checked against the ref when the response
  // arrives so a stale response from a superseded pair never overwrites a
  // newer one.
  const lastAutoPairRef = useRef<string | null>(null);
  useEffect(() => {
    const origenId = value.ubicacionOrigen.googlePlaceId;
    const destinoId = value.ubicacionDestino.googlePlaceId;
    if (!origenId || !destinoId) return;
    const pairKey = `${origenId}|${destinoId}`;
    if (lastAutoPairRef.current === pairKey) return;
    lastAutoPairRef.current = pairKey;
    setCalculatingDistancia(true);
    fetchDistanciaKm(value.ubicacionOrigen, value.ubicacionDestino)
      .then((km) => {
        if (lastAutoPairRef.current !== pairKey) return;
        setDistanciaAuto(true);
        onChange({ ...valueRef.current, distanciaRecorridaKm: String(km) });
      })
      .catch((e) => {
        if (lastAutoPairRef.current !== pairKey) return;
        alertError("Distancia recorrida", e instanceof Error ? e.message : "Error al calcular la distancia");
      })
      .finally(() => {
        if (lastAutoPairRef.current === pairKey) setCalculatingDistancia(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.ubicacionOrigen.googlePlaceId, value.ubicacionDestino.googlePlaceId]);

  // The "Calculado automáticamente" badge only means something while both
  // addresses are still the verified pair it was computed for, so it's
  // derived rather than tracked separately — no need to reset distanciaAuto
  // in an effect just because a place_id was invalidated.
  const distanciaAutoVisible =
    distanciaAuto && !!value.ubicacionOrigen.googlePlaceId && !!value.ubicacionDestino.googlePlaceId;

  function updateMercancia(key: string, patch: Partial<MercanciaRow>) {
    onChange({
      ...value,
      mercancias: value.mercancias.map((m) => (m.key === key ? { ...m, ...patch } : m)),
    });
  }

  function removeMercancia(key: string) {
    onChange({ ...value, mercancias: value.mercancias.filter((m) => m.key !== key) });
  }

  function selectVehiculo(v: VehiculoLite) {
    onChange({
      ...value,
      vehiculoId: v.id,
      autotransporte: {
        ...value.autotransporte,
        configVehicular: v.configVehicular ?? value.autotransporte.configVehicular,
        permisoSct: v.permisoSct ?? value.autotransporte.permisoSct,
        numeroPermisoSct: v.numeroPermiso ?? value.autotransporte.numeroPermisoSct,
        placa: v.placa,
        aseguradoraCarga: v.aseguradoraCarga ?? value.autotransporte.aseguradoraCarga,
        polizaCarga: v.polizaCarga ?? value.autotransporte.polizaCarga,
        aseguradoraRespCivil: v.aseguradoraRespCivil ?? value.autotransporte.aseguradoraRespCivil,
        polizaRespCivil: v.polizaRespCivil ?? value.autotransporte.polizaRespCivil,
        pesoBrutoVehicular: v.pesoBrutoVehicular ?? value.autotransporte.pesoBrutoVehicular,
        anioModeloVehiculo: v.anioModeloVehiculo ?? value.autotransporte.anioModeloVehiculo,
        remolques: v.remolques,
      },
    });
  }

  function addChofer(c: ChoferLite) {
    if (value.figuras.some((f) => f.choferId === c.id)) return;
    onChange({
      ...value,
      figuras: [
        ...value.figuras,
        {
          key: crypto.randomUUID(),
          choferId: c.id,
          nombre: c.nombre,
          rfc: c.rfc,
          numeroLicencia: c.numeroLicencia ?? "",
          tipoFigura: "01",
        },
      ],
    });
    setChoferPickerOpen(false);
  }

  function removeFigura(key: string) {
    onChange({ ...value, figuras: value.figuras.filter((f) => f.key !== key) });
  }

  function handleChoferCreated(c: ChoferLite) {
    onChoferCreated?.(c);
    addChofer(c);
    setAddingChofer(false);
  }

  // Shared between the header's "+ Agregar chofer" button (once figuras
  // exist) and the empty-state "Agregar chofer registrado" card — only one
  // of those two triggers is ever mounted at a time, so they can safely
  // share the choferPickerOpen/addingChofer state.
  const choferPopoverBody = addingChofer ? (
    <InlineChoferForm onCancel={() => setAddingChofer(false)} onCreated={handleChoferCreated} />
  ) : (
    <Command>
      <CommandInput placeholder="Buscar chofer…" />
      <CommandList>
        <CommandEmpty>Sin choferes activos.</CommandEmpty>
        <CommandGroup>
          {choferes.map((c) => (
            <CommandItem key={c.id} value={c.nombre} onSelect={() => addChofer(c)}>
              <div>
                <div className="text-xs">{c.nombre}</div>
                <div className="text-[10px] text-muted-foreground font-mono">{c.rfc}</div>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
      <div className="border-t border-border p-1">
        <button
          type="button"
          className="w-full flex items-center gap-1.5 rounded px-2 py-1.5 text-xs hover:bg-muted"
          onClick={() => setAddingChofer(true)}
        >
          <Plus className="w-3 h-3" />
          Nuevo chofer
        </button>
      </div>
    </Command>
  );

  const pesoSum = sumPesoEnKg(value.mercancias);
  const origenDirecciones = direcciones.filter((d) => d.tipo === "origen");
  const destinoDirecciones = direcciones.filter((d) => d.tipo === "destino");

  function setAuto<K extends keyof AutotransporteFields>(key: K, v: AutotransporteFields[K]) {
    onChange({ ...value, autotransporte: { ...value.autotransporte, [key]: v } });
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/20 p-3">
      <p className="text-xs font-semibold text-muted-foreground">Complemento Carta Porte</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <UbicacionSection
          label="Origen"
          tipo="origen"
          value={value.ubicacionOrigen}
          onChange={(u) => onChange({ ...value, ubicacionOrigen: u })}
          direcciones={origenDirecciones}
          onDireccionCreated={onDireccionCreated}
        />
        <UbicacionSection
          label="Destino"
          tipo="destino"
          value={value.ubicacionDestino}
          onChange={(u) => onChange({ ...value, ubicacionDestino: u })}
          direcciones={destinoDirecciones}
          onDireccionCreated={onDireccionCreated}
        />
      </div>

      <div className="flex items-center gap-2">
        <label className="text-[10px] text-muted-foreground">Distancia recorrida (km)</label>
        <Input
          className="h-7 w-24 text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          type="number"
          value={value.distanciaRecorridaKm}
          onChange={(e) => {
            setDistanciaAuto(false);
            onChange({ ...value, distanciaRecorridaKm: e.target.value });
          }}
        />
        {calculatingDistancia && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
            Calculando…
          </span>
        )}
        {!calculatingDistancia && distanciaAutoVisible && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Check className="w-3 h-3 text-emerald-600" />
            Calculado automáticamente
          </span>
        )}
        {!calculatingDistancia && !distanciaAutoVisible && (!value.ubicacionOrigen.googlePlaceId || !value.ubicacionDestino.googlePlaceId) && (
          <button
            type="button"
            className="flex items-center gap-1 text-[11px] text-muted-foreground border border-dashed border-border rounded px-2 py-0.5"
            onClick={handleCalcularDistancia}
          >
            Calcular con estas direcciones
          </button>
        )}
      </div>

      <div>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={value.internacionalEnabled}
            onChange={(e) => onChange({ ...value, internacionalEnabled: e.target.checked })}
          />
          Transporte internacional
        </label>
        {value.internacionalEnabled && (
          <div className="grid grid-cols-3 gap-2 mt-2">
            <div>
              <label className="text-[10px] text-muted-foreground">Entrada/Salida</label>
              <select
                className="w-full rounded-md border border-input px-2 py-1 text-xs h-7"
                value={value.entradaSalidaMerc}
                onChange={(e) => onChange({ ...value, entradaSalidaMerc: e.target.value as "Entrada" | "Salida" })}
              >
                {ENTRADA_SALIDA_OPTIONS.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">País origen/destino</label>
              <Input
                className="h-7 text-xs"
                placeholder="ej. USA"
                value={value.paisOrigenDestino}
                onChange={(e) => onChange({ ...value, paisOrigenDestino: e.target.value.toUpperCase() })}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Vía</label>
              <select
                className="w-full rounded-md border border-input px-2 py-1 text-xs h-7"
                value={value.viaEntradaSalida}
                onChange={(e) => onChange({ ...value, viaEntradaSalida: e.target.value })}
              >
                {VIA_ENTRADA_SALIDA_OPTIONS.map(([code, label]) => (
                  <option key={code} value={code}>
                    {code} – {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-muted-foreground">Mercancías</label>
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-xs"
            onClick={() => onChange({ ...value, mercancias: [...value.mercancias, newMercanciaRow()] })}
          >
            + Agregar mercancía
          </Button>
        </div>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-2 py-2 font-semibold w-32">Bienes transp.</th>
                <th className="text-left px-2 py-2 font-semibold">Descripción</th>
                <th className="text-right px-2 py-2 font-semibold w-16">Cant.</th>
                <th className="text-left px-2 py-2 font-semibold w-24">Clave unidad</th>
                <th className="text-right px-2 py-2 font-semibold w-20">Peso (kg)</th>
                <th className="text-left px-2 py-2 font-semibold w-24">Mat. peligroso</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {value.mercancias.map((m) => (
                <Fragment key={m.key}>
                  <tr>
                    <td className="px-2 py-1.5">
                      <SatComboBox
                        endpoint="/api/catalogs/products"
                        value={m.bienesTransp}
                        description={m.bienesTranspDescription}
                        hideDescription
                        mapped={!!m.bienesTransp}
                        placeholder="ej. 10101504"
                        onSelect={(key, description) =>
                          updateMercancia(m.key, { bienesTransp: key, bienesTranspDescription: description })
                        }
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        className="h-7 text-xs min-w-[160px]"
                        value={m.descripcion}
                        onChange={(e) => updateMercancia(m.key, { descripcion: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        className="h-7 text-xs text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        type="number"
                        value={m.cantidad}
                        onChange={(e) => updateMercancia(m.key, { cantidad: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <SatComboBox
                        endpoint="/api/catalogs/units"
                        value={m.claveUnidad}
                        description={m.claveUnidadDescription}
                        hideDescription
                        mapped={!!m.claveUnidad}
                        placeholder="ej. KGM"
                        onSelect={(key, description) =>
                          updateMercancia(m.key, { claveUnidad: key, claveUnidadDescription: description })
                        }
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        className="h-7 text-xs text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        type="number"
                        value={m.pesoEnKg}
                        onChange={(e) => updateMercancia(m.key, { pesoEnKg: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={m.materialPeligroso}
                          onChange={(e) => updateMercancia(m.key, { materialPeligroso: e.target.checked })}
                        />
                        Sí
                      </label>
                    </td>
                    <td className="px-1 py-1.5">
                      {value.mercancias.length > 1 && (
                        <button
                          className="text-muted-foreground hover:text-red-600"
                          onClick={() => removeMercancia(m.key)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                  {m.materialPeligroso && (
                    <tr className="bg-muted/20">
                      <td />
                      <td colSpan={6} className="px-2 py-1.5">
                        <div className="flex items-center gap-2">
                          <Input
                            className="h-7 text-xs w-32"
                            placeholder="Cve. material peligroso"
                            value={m.cveMaterialPeligroso}
                            onChange={(e) => updateMercancia(m.key, { cveMaterialPeligroso: e.target.value })}
                          />
                          <select
                            className="rounded-md border border-input px-2 py-1 text-xs h-7"
                            value={m.embalaje}
                            onChange={(e) => updateMercancia(m.key, { embalaje: e.target.value })}
                          >
                            <option value="">— Embalaje —</option>
                            {TIPO_EMBALAJE_OPTIONS.map(([code, label]) => (
                              <option key={code} value={code}>
                                {code} – {label}
                              </option>
                            ))}
                          </select>
                          <Input
                            className="h-7 text-xs flex-1"
                            placeholder="Descripción del embalaje"
                            value={m.descripEmbalaje}
                            onChange={(e) => updateMercancia(m.key, { descripEmbalaje: e.target.value })}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <label className="text-[10px] text-muted-foreground">Peso bruto total</label>
          <Input
            className="h-7 w-24 text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            type="number"
            value={value.pesoBrutoTotal}
            onChange={(e) => onChange({ ...value, pesoBrutoTotal: e.target.value })}
          />
          <select
            className="rounded-md border border-input px-2 py-1 text-xs h-7"
            value={value.unidadPeso}
            onChange={(e) => onChange({ ...value, unidadPeso: e.target.value })}
          >
            {UNIDAD_PESO_OPTIONS.map(([code, label]) => (
              <option key={code} value={code}>
                {code} – {label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="text-[11px] text-muted-foreground border border-dashed border-border rounded px-2 py-0.5"
            onClick={() => onChange({ ...value, pesoBrutoTotal: String(pesoSum) })}
          >
            Usar suma automática ({pesoSum})
          </button>
          <span className="text-[10px] text-muted-foreground">
            {value.mercancias.length} mercancía{value.mercancias.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <VehiculoSection
        vehiculoId={value.vehiculoId}
        autotransporte={value.autotransporte}
        vehiculos={vehiculos}
        onSelect={selectVehiculo}
        onAuto={setAuto}
        onVehiculoCreated={onVehiculoCreated}
      />

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-muted-foreground">Figuras de transporte</label>
          {value.figuras.length > 0 && (
            <Popover
              open={choferPickerOpen}
              onOpenChange={(open) => {
                setChoferPickerOpen(open);
                if (!open) setAddingChofer(false);
              }}
            >
              <PopoverTrigger className="h-6 px-2 text-xs rounded-md border border-input">
                + Agregar chofer
              </PopoverTrigger>
              <PopoverContent className={addingChofer ? "w-[420px] p-0" : "w-80 p-0"} align="end">
                {choferPopoverBody}
              </PopoverContent>
            </Popover>
          )}
        </div>
        {value.figuras.length === 0 ? (
          <div className="flex gap-2">
            <Popover
              open={choferPickerOpen}
              onOpenChange={(open) => {
                setChoferPickerOpen(open);
                if (!open) setAddingChofer(false);
              }}
            >
              <PopoverTrigger className={cardButtonClass}>
                <Search className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-medium">Usar chofer guardado</span>
              </PopoverTrigger>
              <PopoverContent className={addingChofer ? "w-[420px] p-0" : "w-80 p-0"} align="start">
                {choferPopoverBody}
              </PopoverContent>
            </Popover>
            <button type="button" className={cardButtonClass} onClick={() => setAddChoferDialogOpen(true)}>
              <Plus className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-medium">Agregar nuevo</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-2 py-2 font-semibold">Nombre</th>
                  <th className="text-left px-2 py-2 font-semibold w-32">RFC</th>
                  <th className="text-left px-2 py-2 font-semibold w-32">Licencia</th>
                  <th className="text-left px-2 py-2 font-semibold w-40">Tipo de figura</th>
                  <th className="w-6" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {value.figuras.map((f) => (
                  <tr key={f.key}>
                    <td className="px-2 py-1.5">{f.nombre}</td>
                    <td className="px-2 py-1.5 font-mono">{f.rfc}</td>
                    <td className="px-2 py-1.5 font-mono">{f.numeroLicencia || "—"}</td>
                    <td className="px-2 py-1.5">
                      <select
                        className="w-full rounded-md border border-input px-2 py-1 text-xs h-7"
                        value={f.tipoFigura}
                        onChange={(e) =>
                          onChange({
                            ...value,
                            figuras: value.figuras.map((row) =>
                              row.key === f.key ? { ...row, tipoFigura: e.target.value } : row
                            ),
                          })
                        }
                      >
                        {FIGURA_TRANSPORTE_OPTIONS.map(([code, label]) => (
                          <option key={code} value={code}>
                            {code} – {label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1.5">
                      <button className="text-muted-foreground hover:text-red-600" onClick={() => removeFigura(f.key)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={addChoferDialogOpen} onOpenChange={setAddChoferDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo chofer</DialogTitle>
          </DialogHeader>
          <InlineChoferForm
            showHeading={false}
            onCancel={() => setAddChoferDialogOpen(false)}
            onCreated={(c) => {
              handleChoferCreated(c);
              setAddChoferDialogOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
