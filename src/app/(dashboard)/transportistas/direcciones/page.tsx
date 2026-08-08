"use client";

import { useState } from "react";
import { MapPin, Plus, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GridSearchInput } from "@/components/grid-search-input";
import { confirmDelete } from "@/lib/alerts";
import { useRegistryList } from "@/hooks/use-registry-list";

interface Direccion {
  id: string;
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
  active: boolean;
}

interface FormState {
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
}

const emptyForm: FormState = {
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
};

export default function DireccionesPage() {
  const { rows, filteredRows, loading, q, setQ, load, deactivate } = useRegistryList<Direccion>({
    endpoint: "/api/direcciones",
    searchFields: (r) => [r.etiqueta, r.rfc, r.municipio],
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setDialogOpen(true);
  }

  function startEdit(d: Direccion) {
    setEditingId(d.id);
    setForm({
      etiqueta: d.etiqueta,
      rfc: d.rfc,
      nombre: d.nombre ?? "",
      calle: d.calle ?? "",
      numeroExterior: d.numeroExterior ?? "",
      numeroInterior: d.numeroInterior ?? "",
      colonia: d.colonia ?? "",
      municipio: d.municipio ?? "",
      localidad: d.localidad ?? "",
      estado: d.estado ?? "",
      pais: d.pais ?? "MEX",
      codigoPostal: d.codigoPostal ?? "",
    });
    setError(null);
    setDialogOpen(true);
  }

  async function handleSave() {
    setError(null);
    if (!form.etiqueta.trim()) {
      setError("La etiqueta es requerida");
      return;
    }
    if (!form.rfc.trim()) {
      setError("El RFC es requerido");
      return;
    }
    setSaving(true);
    try {
      const isNew = editingId === null;
      const method = isNew ? "POST" : "PUT";
      const url = isNew ? "/api/direcciones" : `/api/direcciones/${editingId}`;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          etiqueta: form.etiqueta.trim(),
          rfc: form.rfc.trim().toUpperCase(),
          nombre: form.nombre.trim() || null,
          calle: form.calle.trim() || null,
          numero_exterior: form.numeroExterior.trim() || null,
          numero_interior: form.numeroInterior.trim() || null,
          colonia: form.colonia.trim() || null,
          municipio: form.municipio.trim() || null,
          localidad: form.localidad.trim() || null,
          estado: form.estado.trim().toUpperCase() || null,
          pais: form.pais.trim().toUpperCase() || null,
          codigo_postal: form.codigoPostal.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al guardar");
        return;
      }
      setDialogOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(d: Direccion) {
    const confirmed = await confirmDelete(
      "¿Desactivar dirección?",
      `${d.etiqueta} dejará de aparecer para nuevas asignaciones, pero se conserva para facturas ya emitidas.`,
      "Desactivar"
    );
    if (!confirmed) return;
    await deactivate(d.id);
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <PageHeader title="Direcciones" description="Ubicaciones frecuentes de Origen/Destino para Carta Porte" icon={MapPin} />

      <Card className="border-border shadow-none flex-1 min-h-0 flex flex-col">
        <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
          <div className="overflow-auto flex-1 min-h-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-2.5 sticky top-0 z-10 bg-card">
                    <GridSearchInput
                      className="max-w-[220px]"
                      placeholder="Buscar por etiqueta, RFC o municipio…"
                      value={q}
                      onChange={setQ}
                    />
                  </th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-10 bg-card">RFC</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-10 bg-card">Ubicación</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-10 bg-card">Estado</th>
                  <th className="px-5 py-2.5 text-right sticky top-0 z-10 bg-card">
                    <Button size="sm" className="gap-1.5 text-xs" onClick={startAdd}>
                      <Plus className="w-3.5 h-3.5" />
                      Nueva dirección
                    </Button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground text-sm">
                      Cargando...
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground text-sm">
                      Sin direcciones registradas.
                    </td>
                  </tr>
                )}
                {!loading && rows.length > 0 && filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground text-sm">
                      Sin resultados para &quot;{q}&quot;.
                    </td>
                  </tr>
                )}
                {filteredRows.map((d) => (
                  <tr key={d.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-5 py-2.5 text-xs text-foreground/70">{d.etiqueta}</td>
                    <td className="px-5 py-2.5 font-mono text-muted-foreground text-xs">{d.rfc}</td>
                    <td className="px-5 py-2.5 text-muted-foreground text-xs">
                      {[d.municipio, d.estado].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-5 py-2.5">
                      <Badge variant={d.active ? "outline" : "secondary"} className="text-[11px]">
                        {d.active ? "Activo" : "Inactivo"}
                      </Badge>
                    </td>
                    <td className="px-5 py-2.5 text-right whitespace-nowrap">
                      <Button size="sm" variant="outline" className="h-7 px-3 text-xs" onClick={() => startEdit(d)}>
                        Editar
                      </Button>
                      {d.active && (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 px-3 text-xs ml-2"
                          onClick={() => handleDeactivate(d)}
                        >
                          Desactivar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar dirección" : "Nueva dirección"}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Etiqueta</label>
                <Input
                  className="mt-1"
                  value={form.etiqueta}
                  onChange={(e) => setForm((f) => ({ ...f, etiqueta: e.target.value }))}
                  placeholder="ej. Bodega CDMX"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">RFC</label>
                <Input
                  className="mt-1"
                  value={form.rfc}
                  onChange={(e) => setForm((f) => ({ ...f, rfc: e.target.value.toUpperCase() }))}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Nombre</label>
              <Input
                className="mt-1"
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Calle</label>
                <Input
                  className="mt-1"
                  value={form.calle}
                  onChange={(e) => setForm((f) => ({ ...f, calle: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">No. Ext.</label>
                <Input
                  className="mt-1"
                  value={form.numeroExterior}
                  onChange={(e) => setForm((f) => ({ ...f, numeroExterior: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">No. Int.</label>
                <Input
                  className="mt-1"
                  value={form.numeroInterior}
                  onChange={(e) => setForm((f) => ({ ...f, numeroInterior: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Colonia</label>
                <Input
                  className="mt-1"
                  value={form.colonia}
                  onChange={(e) => setForm((f) => ({ ...f, colonia: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Municipio</label>
                <Input
                  className="mt-1"
                  value={form.municipio}
                  onChange={(e) => setForm((f) => ({ ...f, municipio: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Localidad</label>
                <Input
                  className="mt-1"
                  value={form.localidad}
                  onChange={(e) => setForm((f) => ({ ...f, localidad: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Estado</label>
                <Input
                  className="mt-1"
                  placeholder="ej. BCN"
                  value={form.estado}
                  onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value.toUpperCase() }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">País</label>
                <Input
                  className="mt-1"
                  value={form.pais}
                  onChange={(e) => setForm((f) => ({ ...f, pais: e.target.value.toUpperCase() }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">C.P.</label>
                <Input
                  className="mt-1"
                  value={form.codigoPostal}
                  onChange={(e) => setForm((f) => ({ ...f, codigoPostal: e.target.value }))}
                />
              </div>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
