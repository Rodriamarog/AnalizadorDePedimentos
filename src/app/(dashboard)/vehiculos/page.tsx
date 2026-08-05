"use client";

import { useCallback, useEffect, useState } from "react";
import { Truck, Plus, Loader2, PlusCircle, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GridSearchInput } from "@/components/grid-search-input";
import { confirmDelete } from "@/lib/alerts";
import type { Remolque } from "@/lib/db/schema";

interface Vehiculo {
  id: string;
  placa: string;
  configVehicular: string | null;
  permisoSct: string | null;
  numeroPermiso: string | null;
  aseguradora: string | null;
  poliza: string | null;
  remolques: Remolque[];
  active: boolean;
}

interface FormState {
  placa: string;
  configVehicular: string;
  permisoSct: string;
  numeroPermiso: string;
  aseguradora: string;
  poliza: string;
  remolques: Remolque[];
}

const emptyForm: FormState = {
  placa: "",
  configVehicular: "",
  permisoSct: "",
  numeroPermiso: "",
  aseguradora: "",
  poliza: "",
  remolques: [],
};

export default function VehiculosPage() {
  const [rows, setRows] = useState<Vehiculo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const filteredRows = rows.filter((r) => {
    const query = q.trim().toLowerCase();
    if (!query) return true;
    return (
      r.placa.toLowerCase().includes(query) ||
      (r.configVehicular ?? "").toLowerCase().includes(query) ||
      (r.numeroPermiso ?? "").toLowerCase().includes(query)
    );
  });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/vehiculos");
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function startAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setDialogOpen(true);
  }

  function startEdit(v: Vehiculo) {
    setEditingId(v.id);
    setForm({
      placa: v.placa,
      configVehicular: v.configVehicular ?? "",
      permisoSct: v.permisoSct ?? "",
      numeroPermiso: v.numeroPermiso ?? "",
      aseguradora: v.aseguradora ?? "",
      poliza: v.poliza ?? "",
      remolques: v.remolques,
    });
    setError(null);
    setDialogOpen(true);
  }

  function addRemolque() {
    setForm((f) => ({ ...f, remolques: [...f.remolques, { subTipoRemolque: "", placa: "" }] }));
  }

  function updateRemolque(index: number, patch: Partial<Remolque>) {
    setForm((f) => ({
      ...f,
      remolques: f.remolques.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    }));
  }

  function removeRemolque(index: number) {
    setForm((f) => ({ ...f, remolques: f.remolques.filter((_, i) => i !== index) }));
  }

  async function handleSave() {
    setError(null);
    if (!form.placa) {
      setError("La placa es requerida");
      return;
    }
    setSaving(true);
    try {
      const isNew = editingId === null;
      const method = isNew ? "POST" : "PUT";
      const url = isNew ? "/api/vehiculos" : `/api/vehiculos/${editingId}`;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placa: form.placa,
          config_vehicular: form.configVehicular || null,
          permiso_sct: form.permisoSct || null,
          numero_permiso: form.numeroPermiso || null,
          aseguradora: form.aseguradora || null,
          poliza: form.poliza || null,
          remolques: form.remolques.filter((r) => r.subTipoRemolque || r.placa),
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

  async function handleDeactivate(v: Vehiculo) {
    const confirmed = await confirmDelete(
      "¿Desactivar vehículo?",
      `${v.placa} dejará de aparecer para nuevas asignaciones, pero se conserva para facturas ya emitidas.`,
      "Desactivar"
    );
    if (!confirmed) return;
    const res = await fetch(`/api/vehiculos/${v.id}`, { method: "DELETE" });
    if (res.ok) await load();
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <PageHeader title="Vehículos" description="Registro de la flota para Carta Porte" icon={Truck} />

      <Card className="border-border shadow-none flex-1 min-h-0 flex flex-col">
        <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
          <div className="overflow-auto flex-1 min-h-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-2.5 sticky top-0 z-10 bg-card">
                    <GridSearchInput
                      className="max-w-[220px]"
                      placeholder="Buscar por placa, config. o permiso…"
                      value={q}
                      onChange={setQ}
                    />
                  </th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-10 bg-card">Config. vehicular</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-10 bg-card">Permiso SCT</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-10 bg-card">Remolques</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-10 bg-card">Estado</th>
                  <th className="px-5 py-2.5 text-right sticky top-0 z-10 bg-card">
                    <Button size="sm" className="gap-1.5 text-xs" onClick={startAdd}>
                      <Plus className="w-3.5 h-3.5" />
                      Nuevo vehículo
                    </Button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground text-sm">
                      Cargando...
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground text-sm">
                      Sin vehículos registrados.
                    </td>
                  </tr>
                )}
                {!loading && rows.length > 0 && filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground text-sm">
                      Sin resultados para &quot;{q}&quot;.
                    </td>
                  </tr>
                )}
                {filteredRows.map((v) => (
                  <tr key={v.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-5 py-2.5 font-mono text-xs text-foreground/70">{v.placa}</td>
                    <td className="px-5 py-2.5 text-muted-foreground text-xs">{v.configVehicular || "—"}</td>
                    <td className="px-5 py-2.5 text-muted-foreground text-xs">
                      {v.permisoSct || "—"}
                      {v.numeroPermiso ? <span className="ml-1 text-foreground/50">({v.numeroPermiso})</span> : null}
                    </td>
                    <td className="px-5 py-2.5 text-muted-foreground text-xs">
                      {v.remolques.length > 0 ? v.remolques.map((r) => r.placa).join(", ") : "—"}
                    </td>
                    <td className="px-5 py-2.5">
                      <Badge variant={v.active ? "outline" : "secondary"} className="text-[11px]">
                        {v.active ? "Activo" : "Inactivo"}
                      </Badge>
                    </td>
                    <td className="px-5 py-2.5 text-right whitespace-nowrap">
                      <Button size="sm" variant="outline" className="h-7 px-3 text-xs" onClick={() => startEdit(v)}>
                        Editar
                      </Button>
                      {v.active && (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 px-3 text-xs ml-2"
                          onClick={() => handleDeactivate(v)}
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
            <DialogTitle>{editingId ? "Editar vehículo" : "Nuevo vehículo"}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Placa</label>
                <Input
                  className="mt-1"
                  value={form.placa}
                  onChange={(e) => setForm((f) => ({ ...f, placa: e.target.value.toUpperCase() }))}
                  placeholder="ABC1234"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Config. vehicular</label>
                <Input
                  className="mt-1"
                  value={form.configVehicular}
                  onChange={(e) => setForm((f) => ({ ...f, configVehicular: e.target.value }))}
                  placeholder="Clave SAT"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Permiso SCT</label>
                <Input
                  className="mt-1"
                  value={form.permisoSct}
                  onChange={(e) => setForm((f) => ({ ...f, permisoSct: e.target.value }))}
                  placeholder="Clave SAT"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Número de permiso</label>
                <Input
                  className="mt-1"
                  value={form.numeroPermiso}
                  onChange={(e) => setForm((f) => ({ ...f, numeroPermiso: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Aseguradora</label>
                <Input
                  className="mt-1"
                  value={form.aseguradora}
                  onChange={(e) => setForm((f) => ({ ...f, aseguradora: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Póliza</label>
                <Input
                  className="mt-1"
                  value={form.poliza}
                  onChange={(e) => setForm((f) => ({ ...f, poliza: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Remolques</label>
                <Button size="sm" variant="outline" className="h-6 px-2 text-xs gap-1" onClick={addRemolque}>
                  <PlusCircle className="w-3 h-3" />
                  Agregar
                </Button>
              </div>
              {form.remolques.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-1.5">Sin remolques registrados.</p>
              ) : (
                <div className="flex flex-col gap-2 mt-1.5">
                  {form.remolques.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        className="h-8 text-xs flex-1"
                        value={r.subTipoRemolque}
                        onChange={(e) => updateRemolque(i, { subTipoRemolque: e.target.value })}
                        placeholder="Subtipo (clave SAT)"
                      />
                      <Input
                        className="h-8 text-xs flex-1 font-mono"
                        value={r.placa}
                        onChange={(e) => updateRemolque(i, { placa: e.target.value.toUpperCase() })}
                        placeholder="Placa"
                      />
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeRemolque(i)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
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
