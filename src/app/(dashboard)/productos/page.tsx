"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Package, Plus, Loader2, Check, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SatComboBox } from "@/components/sat-combobox";
import { GridSearchInput } from "@/components/grid-search-input";
import { confirmDelete } from "@/lib/alerts";

interface Producto {
  id: string;
  fraccion: string;
  descripcion: string;
  claveProdServ: string;
  descripcionSat: string | null;
  unitKey: string;
  confidence: string | null;
}

interface FormState {
  fraccion: string;
  descripcion: string;
  claveProdServ: string;
  descripcionSat: string;
  unitKey: string;
}

const emptyForm: FormState = { fraccion: "", descripcion: "", claveProdServ: "", descripcionSat: "", unitKey: "" };
const NEW_ROW_ID = "__new__";

export default function ProductosPage() {
  const [rows, setRows] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [q, setQ] = useState("");
  const selectAllRef = useRef<HTMLInputElement>(null);

  const filteredRows = rows.filter((r) => {
    const query = q.trim().toLowerCase();
    if (!query) return true;
    return (
      r.fraccion.toLowerCase().includes(query) ||
      r.descripcion.toLowerCase().includes(query) ||
      r.claveProdServ.toLowerCase().includes(query)
    );
  });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/productos");
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    if (!selectAllRef.current) return;
    const allChecked = filteredRows.length > 0 && filteredRows.every((r) => selected.has(r.fraccion));
    selectAllRef.current.checked = allChecked;
    selectAllRef.current.indeterminate = !allChecked && filteredRows.some((r) => selected.has(r.fraccion));
  }, [filteredRows, selected]);

  function toggleSelectAll(checked: boolean) {
    setSelected(checked ? new Set(filteredRows.map((r) => r.fraccion)) : new Set());
  }

  function toggleSelected(fraccion: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(fraccion);
      else next.delete(fraccion);
      return next;
    });
  }

  async function handleDeleteSelected() {
    if (selected.size === 0) return;
    const confirmed = await confirmDelete(
      `¿Eliminar ${selected.size} producto${selected.size > 1 ? "s" : ""}?`,
      "Esta acción no se puede deshacer."
    );
    if (!confirmed) return;
    setDeletingSelected(true);
    try {
      await Promise.all([...selected].map((fraccion) => fetch(`/api/productos/${fraccion}`, { method: "DELETE" })));
      setSelected(new Set());
      await load();
    } finally {
      setDeletingSelected(false);
    }
  }

  function startAdd() {
    setEditingId(NEW_ROW_ID);
    setForm(emptyForm);
    setError(null);
  }

  function startEdit(p: Producto) {
    setEditingId(p.id);
    setForm({
      fraccion: p.fraccion,
      descripcion: p.descripcion,
      claveProdServ: p.claveProdServ,
      descripcionSat: p.descripcionSat ?? "",
      unitKey: p.unitKey,
    });
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setError(null);
  }

  async function handleSave() {
    setError(null);
    if (!form.fraccion || !form.descripcion || !form.claveProdServ) {
      setError("Fracción, descripción y ClaveProdServ son requeridos");
      return;
    }
    setSaving(true);
    try {
      const isNew = editingId === NEW_ROW_ID;
      const method = isNew ? "POST" : "PUT";
      const url = isNew ? "/api/productos" : `/api/productos/${form.fraccion}`;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fraccion: form.fraccion,
          descripcion: form.descripcion,
          clave_prod_serv: form.claveProdServ,
          descripcion_sat: form.descripcionSat || null,
          unit_key: form.unitKey || "H87",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al guardar");
        return;
      }
      setEditingId(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(fraccion: string) {
    const confirmed = await confirmDelete("¿Eliminar producto?", `Fracción ${fraccion}`);
    if (!confirmed) return;
    const res = await fetch(`/api/productos/${fraccion}`, { method: "DELETE" });
    if (res.ok) {
      setRows((prev) => prev.filter((r) => r.fraccion !== fraccion));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(fraccion);
        return next;
      });
    }
  }

  const isAdding = editingId === NEW_ROW_ID;

  return (
    <div className="h-full flex flex-col min-h-0">
      <PageHeader title="Productos" description="Mapeo de fracción a ClaveProdServ / Unidad SAT" icon={Package} />

      <Card className="border-border shadow-none flex-1 min-h-0 flex flex-col">
        <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
          <div className="overflow-auto flex-1 min-h-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="w-10 px-5 py-3 sticky top-0 z-10 bg-card">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                    />
                  </th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-10 bg-card">Fracción</th>
                  <th className="text-left px-5 py-2.5 sticky top-0 z-10 bg-card">
                    <GridSearchInput
                      className="max-w-[220px]"
                      placeholder="Buscar por descripción, fracción o clave…"
                      value={q}
                      onChange={setQ}
                    />
                  </th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-10 bg-card">ClaveProdServ</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-10 bg-card">Descripción SAT</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-10 bg-card">Unidad</th>
                  <th className="px-5 py-2.5 text-right sticky top-0 z-10 bg-card">
                    {selected.size > 0 ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-[11px] font-normal normal-case text-muted-foreground">
                          {selected.size} seleccionado{selected.size > 1 ? "s" : ""}
                        </span>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 px-2.5 text-xs"
                          onClick={handleDeleteSelected}
                          disabled={deletingSelected}
                        >
                          {deletingSelected && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                          Eliminar seleccionados
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" className="gap-1.5 text-xs" onClick={startAdd} disabled={isAdding}>
                        <Plus className="w-3.5 h-3.5" />
                        Nuevo producto
                      </Button>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isAdding && (
                  <tr className="bg-primary/5">
                    <td className="px-5 py-2.5" />
                    <td className="px-5 py-2.5">
                      <Input
                        className="h-8 text-xs font-mono"
                        value={form.fraccion}
                        onChange={(e) => setForm((f) => ({ ...f, fraccion: e.target.value }))}
                        placeholder="76151002"
                        autoFocus
                      />
                    </td>
                    <td className="px-5 py-2.5">
                      <Input
                        className="h-8 text-xs"
                        value={form.descripcion}
                        onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                        placeholder="Descripción"
                      />
                    </td>
                    <td className="px-5 py-2.5 min-w-[160px]">
                      <SatComboBox
                        endpoint="/api/catalogs/products"
                        value={form.claveProdServ}
                        mapped={!!form.claveProdServ}
                        placeholder="Buscar clave SAT…"
                        onSelect={(key, description) =>
                          setForm((f) => ({ ...f, claveProdServ: key, descripcionSat: description }))
                        }
                      />
                    </td>
                    <td className="px-5 py-2.5 text-muted-foreground text-xs">{form.descripcionSat || "—"}</td>
                    <td className="px-5 py-2.5 min-w-[110px]">
                      <SatComboBox
                        endpoint="/api/catalogs/units"
                        value={form.unitKey}
                        mapped={!!form.unitKey}
                        placeholder="H87"
                        onSelect={(key) => setForm((f) => ({ ...f, unitKey: key }))}
                      />
                    </td>
                    <td className="px-5 py-2.5 text-right whitespace-nowrap">
                      <Button size="sm" className="h-7 px-2.5 text-xs" onClick={handleSave} disabled={saving}>
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 text-xs ml-1.5"
                        onClick={cancelEdit}
                        disabled={saving}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                )}
                {isAdding && error && (
                  <tr>
                    <td />
                    <td colSpan={6} className="px-5 pb-2 text-xs text-red-600">
                      {error}
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-muted-foreground text-sm">
                      Cargando...
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && !isAdding && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-muted-foreground text-sm">
                      Sin productos registrados. Los mapeos que hagas en Pedimentos aparecerán aquí.
                    </td>
                  </tr>
                )}
                {!loading && rows.length > 0 && filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-muted-foreground text-sm">
                      Sin resultados para &quot;{q}&quot;.
                    </td>
                  </tr>
                )}
                {filteredRows.map((p) => {
                  const isEditing = editingId === p.id;
                  if (isEditing) {
                    return (
                      <Fragment key={p.id}>
                        <tr className="bg-primary/5">
                          <td className="px-5 py-2.5" />
                          <td className="px-5 py-2.5 font-mono text-xs text-muted-foreground">{p.fraccion}</td>
                          <td className="px-5 py-2.5">
                            <Input
                              className="h-8 text-xs"
                              value={form.descripcion}
                              onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                            />
                          </td>
                          <td className="px-5 py-2.5 min-w-[160px]">
                            <SatComboBox
                              endpoint="/api/catalogs/products"
                              value={form.claveProdServ}
                              mapped={!!form.claveProdServ}
                              placeholder="Buscar clave SAT…"
                              onSelect={(key, description) =>
                                setForm((f) => ({ ...f, claveProdServ: key, descripcionSat: description }))
                              }
                            />
                          </td>
                          <td className="px-5 py-2.5 text-muted-foreground text-xs">{form.descripcionSat || "—"}</td>
                          <td className="px-5 py-2.5 min-w-[110px]">
                            <SatComboBox
                              endpoint="/api/catalogs/units"
                              value={form.unitKey}
                              mapped={!!form.unitKey}
                              placeholder="H87"
                              onSelect={(key) => setForm((f) => ({ ...f, unitKey: key }))}
                            />
                          </td>
                          <td className="px-5 py-2.5 text-right whitespace-nowrap">
                            <Button size="sm" className="h-7 px-2.5 text-xs" onClick={handleSave} disabled={saving}>
                              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2.5 text-xs ml-1.5"
                              onClick={cancelEdit}
                              disabled={saving}
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        </tr>
                        {error && (
                          <tr>
                            <td />
                            <td colSpan={6} className="px-5 pb-2 text-xs text-red-600">
                              {error}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  }
                  return (
                    <tr key={p.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-5 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(p.fraccion)}
                          onChange={(e) => toggleSelected(p.fraccion, e.target.checked)}
                        />
                      </td>
                      <td className="px-5 py-2.5 font-mono text-xs text-foreground/70">{p.fraccion}</td>
                      <td className="px-5 py-2.5 font-medium text-foreground max-w-xs truncate" title={p.descripcion}>
                        {p.descripcion}
                      </td>
                      <td className="px-5 py-2.5 font-mono text-xs">{p.claveProdServ}</td>
                      <td className="px-5 py-2.5 text-muted-foreground text-xs">{p.descripcionSat || "—"}</td>
                      <td className="px-5 py-2.5 text-muted-foreground">{p.unitKey}</td>
                      <td className="px-5 py-2.5 text-right whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-3 text-xs"
                          onClick={() => startEdit(p)}
                          disabled={editingId !== null}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 px-3 text-xs ml-2"
                          onClick={() => handleDelete(p.fraccion)}
                          disabled={editingId !== null}
                        >
                          Eliminar
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
