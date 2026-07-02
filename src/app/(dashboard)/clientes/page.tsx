"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, Plus, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GridSearchInput } from "@/components/grid-search-input";
import { confirmDelete } from "@/lib/alerts";

const TAX_SYSTEMS = [
  { value: "601", label: "601 – General de Ley Personas Morales" },
  { value: "612", label: "612 – Personas Físicas con Act. Empresariales" },
  { value: "626", label: "626 – Régimen Simplificado de Confianza (RESICO)" },
  { value: "616", label: "616 – Sin obligaciones fiscales" },
  { value: "621", label: "621 – Incorporación Fiscal" },
  { value: "603", label: "603 – Personas Morales sin Fines de Lucro" },
  { value: "606", label: "606 – Arrendamiento" },
  { value: "610", label: "610 – Residentes en el Extranjero" },
  { value: "625", label: "625 – Plataformas Tecnológicas" },
];

interface Cliente {
  id: string;
  legal_name: string;
  tax_id?: string;
  tax_system?: string;
  email?: string;
  address?: { zip?: string };
}

interface FormState {
  legalName: string;
  taxId: string;
  taxSystem: string;
  zip: string;
  email: string;
}

const emptyForm: FormState = { legalName: "", taxId: "", taxSystem: "601", zip: "", email: "" };

export default function ClientesPage() {
  const [rows, setRows] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (query: string) => {
    setLoading(true);
    const res = await fetch(`/api/clientes?q=${encodeURIComponent(query)}&limit=50`);
    if (res.ok) {
      const data = await res.json();
      setRows(data.data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => load(q), 300);
    return () => clearTimeout(timer);
  }, [q, load]);

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setDialogOpen(true);
  }

  function openEdit(c: Cliente) {
    setEditingId(c.id);
    setForm({
      legalName: c.legal_name,
      taxId: c.tax_id ?? "",
      taxSystem: c.tax_system ?? "601",
      zip: c.address?.zip ?? "",
      email: c.email ?? "",
    });
    setError(null);
    setDialogOpen(true);
  }

  async function handleSave() {
    setError(null);
    if (!form.legalName || !form.taxId) {
      setError("Nombre fiscal y RFC son requeridos");
      return;
    }
    setSaving(true);
    try {
      const body = {
        legal_name: form.legalName,
        tax_id: form.taxId.toUpperCase(),
        tax_system: form.taxSystem,
        address: { zip: form.zip },
        email: form.email || undefined,
      };
      const res = await fetch(editingId ? `/api/clientes/${editingId}` : "/api/clientes", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al guardar");
        return;
      }
      setDialogOpen(false);
      await load(q);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    const confirmed = await confirmDelete("¿Eliminar cliente?", `Se eliminará "${name}" permanentemente de FacturAPI.`);
    if (!confirmed) return;
    const res = await fetch(`/api/clientes/${id}`, { method: "DELETE" });
    if (res.ok) setRows((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <PageHeader title="Clientes" description="Directorio de clientes (FacturAPI)" icon={Users} />

      <Card className="border-border shadow-none flex-1 min-h-0 flex flex-col">
        <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
          <div className="overflow-auto flex-1 min-h-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-2.5 sticky top-0 z-10 bg-card">
                    <GridSearchInput
                      className="max-w-[220px]"
                      placeholder="Buscar por nombre o RFC…"
                      value={q}
                      onChange={setQ}
                    />
                  </th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-10 bg-card">RFC</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-10 bg-card">Régimen</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-10 bg-card">Email</th>
                  <th className="px-5 py-2.5 text-right sticky top-0 z-10 bg-card">
                    <Button size="sm" className="gap-1.5 text-xs" onClick={openAdd}>
                      <Plus className="w-3.5 h-3.5" />
                      Nuevo cliente
                    </Button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground text-sm">Cargando...</td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground text-sm">
                      No se encontraron clientes.
                    </td>
                  </tr>
                )}
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-5 py-2.5 font-medium text-foreground">{c.legal_name}</td>
                    <td className="px-5 py-2.5 font-mono text-xs text-muted-foreground">{c.tax_id || "—"}</td>
                    <td className="px-5 py-2.5 text-muted-foreground text-xs">{c.tax_system || "—"}</td>
                    <td className="px-5 py-2.5 text-xs">{c.email || "—"}</td>
                    <td className="px-5 py-2.5 text-right whitespace-nowrap">
                      <Button size="sm" variant="outline" className="h-7 px-3 text-xs" onClick={() => openEdit(c)}>
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 px-3 text-xs ml-2"
                        onClick={() => handleDelete(c.id, c.legal_name)}
                      >
                        Eliminar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Nombre fiscal</label>
              <Input
                value={form.legalName}
                onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))}
                placeholder="Ej. Empresa Importadora SA de CV"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">RFC</label>
              <Input
                value={form.taxId}
                disabled={!!editingId}
                onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value.toUpperCase() }))}
                placeholder="XAXX010101000"
                maxLength={13}
                className="uppercase"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Régimen fiscal</label>
              <select
                className="w-full rounded-md border border-input px-3 py-2 text-sm"
                value={form.taxSystem}
                onChange={(e) => setForm((f) => ({ ...f, taxSystem: e.target.value }))}
              >
                {TAX_SYSTEMS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Código postal</label>
              <Input
                value={form.zip}
                onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
                placeholder="01234"
                maxLength={5}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="cliente@empresa.com"
              />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
