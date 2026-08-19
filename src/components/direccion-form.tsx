"use client";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BadgeCheck } from "lucide-react";
import { GoogleAddressAutocomplete, type ResolvedAddress } from "@/components/google-address-autocomplete";

// Shared by both the Direcciones page grids (issue #22) — the tipo
// (origen/destino) is set by the caller from which grid opened the dialog,
// never picked here, so this form only carries the fields common to any
// dirección regardless of tipo.
export interface DireccionFormState {
  etiqueta: string;
  rfc: string;
  nombre: string;
  calle: string;
  numeroExterior: string;
  numeroInterior: string;
  colonia: string;
  municipio: string;
  localidad: string;
  estado: string;
  pais: string;
  codigoPostal: string;
  googlePlaceId: string | null;
}

export const emptyDireccionForm: DireccionFormState = {
  etiqueta: "",
  rfc: "",
  nombre: "",
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

export function DireccionForm({
  value,
  onChange,
}: {
  value: DireccionFormState;
  onChange: (next: DireccionFormState) => void;
}) {
  function set<K extends keyof DireccionFormState>(key: K, v: DireccionFormState[K]) {
    onChange({ ...value, [key]: v });
  }

  // Manual edits to a domicilio field Google actually resolves invalidate a
  // previously-resolved place_id (same rule as issue #20's Carta Porte
  // ubicaciones). Localidad and Número Interior are excluded — Google never
  // populates either, so editing them by hand isn't a sign the address
  // changed (see mapAddressComponents in googlePlaces.ts).
  function setDomicilio<K extends keyof DireccionFormState>(key: K, v: DireccionFormState[K]) {
    onChange({ ...value, [key]: v, googlePlaceId: null });
  }

  function applyResolvedAddress(a: ResolvedAddress) {
    onChange({
      ...value,
      calle: a.calle || value.calle,
      numeroExterior: a.numeroExterior || value.numeroExterior,
      colonia: a.colonia || value.colonia,
      municipio: a.municipio || value.municipio,
      estado: a.estado || value.estado,
      codigoPostal: a.codigoPostal || value.codigoPostal,
      pais: a.pais || value.pais,
      googlePlaceId: a.placeId,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <GoogleAddressAutocomplete onResolved={applyResolvedAddress} />
        {value.googlePlaceId && (
          <Badge variant="outline" className="mt-1.5 w-fit gap-1 border-emerald-200 bg-emerald-50 text-emerald-700">
            <BadgeCheck className="w-3 h-3" />
            Verificada por Google
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Etiqueta</label>
          <Input
            className="mt-1"
            value={value.etiqueta}
            onChange={(e) => set("etiqueta", e.target.value)}
            placeholder="ej. Bodega CDMX"
            autoFocus
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">RFC</label>
          <Input className="mt-1" value={value.rfc} onChange={(e) => set("rfc", e.target.value.toUpperCase())} />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground">Nombre</label>
        <Input className="mt-1" value={value.nombre} onChange={(e) => set("nombre", e.target.value)} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Calle</label>
          <Input className="mt-1" value={value.calle} onChange={(e) => setDomicilio("calle", e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">No. Ext.</label>
          <Input
            className="mt-1"
            value={value.numeroExterior}
            onChange={(e) => setDomicilio("numeroExterior", e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">No. Int.</label>
          <Input
            className="mt-1"
            value={value.numeroInterior}
            onChange={(e) => set("numeroInterior", e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Colonia</label>
          <Input className="mt-1" value={value.colonia} onChange={(e) => setDomicilio("colonia", e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Municipio</label>
          <Input
            className="mt-1"
            value={value.municipio}
            onChange={(e) => setDomicilio("municipio", e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Localidad</label>
          <Input className="mt-1" value={value.localidad} onChange={(e) => set("localidad", e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Estado</label>
          <Input
            className="mt-1"
            placeholder="ej. BCN"
            value={value.estado}
            onChange={(e) => setDomicilio("estado", e.target.value.toUpperCase())}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">País</label>
          <Input
            className="mt-1"
            value={value.pais}
            onChange={(e) => setDomicilio("pais", e.target.value.toUpperCase())}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">C.P.</label>
          <Input
            className="mt-1"
            value={value.codigoPostal}
            onChange={(e) => setDomicilio("codigoPostal", e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
