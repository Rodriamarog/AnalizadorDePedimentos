"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { IdCard, Plus, Loader2, Check, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { GridSearchInput } from "@/components/grid-search-input";
import { confirmDelete } from "@/lib/alerts";

interface Chofer {
  id: string;
  nombre: string;
  rfc: string;
  numeroLicencia: string | null;
  active: boolean;
}

interface FormState {
  nombre: string;
  rfc: string;
  numeroLicencia: string;
}

const emptyForm: FormState = { nombre: "", rfc: "", numeroLicencia: "" };
const NEW_ROW_ID = "__new__";

export default function ChoferesPage() {
  const [rows, setRows] = useState<Chofer[]>([]);
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
      r.nombre.toLowerCase().includes(query) ||
      r.rfc.toLowerCase().includes(query) ||
      (r.numeroLicencia ?? "").toLowerCase().includes(query)
    );
  });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/choferes");
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    if (!selectAllRef.current) return;
    const allChecked = filteredRows.length > 0 && filteredRows.every((r) => selected.has(r.id));
    selectAllRef.current.checked = allChecked;
    selectAllRef.current.indeterminate = !allChecked && filteredRows.some((r) => selected.has(r.id));
  }, [filteredRows, selected]);

  function toggleSelectAll(checked: boolean) {
    setSelected(checked ? new Set(filteredRows.map((r) => r.id)) : new Set());
  }

  function toggleSelected(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleDeactivateSelected() {
    if (selected.size === 0) return;
    const confirmed = await confirmDelete(
      `¿Desactivar ${selected.size} chofer${selected.size > 1 ? "es" : ""}?`,
      "Los choferes desactivados dejan de aparecer para nuevas asignaciones, pero se conservan para facturas ya emitidas.",
      "Desactivar"
    );
    if (!confirmed) return;
    setDeletingSelected(true);
    try {
      await Promise.all([...selected].map((id) => fetch(`/api/choferes/${id}`, { method: "DELETE" })));
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

  function startEdit(c: Chofer) {
    setEditingId(c.id);
    setForm({ nombre: c.nombre, rfc: c.rfc, numeroLicencia: c.numeroLicencia ?? "" });
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setError(null);
  }

  async function handleSave() {
    setError(null);
    if (!form.nombre || !form.rfc) {
      setError("Nombre y RFC son requeridos");
      return;
    }
    setSaving(true);
    try {
      const isNew = editingId === NEW_ROW_ID;
      const method = isNew ? "POST" : "PUT";
      const url = isNew ? "/api/choferes" : `/api/choferes/${editingId}`;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: form.nombre,
          rfc: form.rfc,
          numero_licencia: form.numeroLicencia || null,
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

  async function handleDeactivate(c: Chofer) {
    const confirmed = await confirmDelete(
      "¿Desactivar chofer?",
      `${c.nombre} dejará de aparecer para nuevas asignaciones, pero se conserva para facturas ya emitidas.`,
      "Desactivar"
    );
    if (!confirmed) return;
    const res = await fetch(`/api/choferes/${c.id}`, { method: "DELETE" });
    if (res.ok) await load();
  }

  const isAdding = editingId === NEW_ROW_ID;

  return (
    <div className="h-full flex flex-col min-h-0">
      <PageHeader title="Choferes" description="Registro de operadores para Carta Porte" icon={IdCard} />

      <Card className="border-border shadow-none flex-1 min-h-0 flex flex-col">
        <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
          <div className="overflow-auto flex-1 min-h-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="w-10 px-5 py-3 sticky top-0 z-10 bg-card">
                    <input ref={selectAllRef} type="checkbox" onChange={(e) => toggleSelectAll(e.target.checked)} />
                  </th>
                  <th className="text-left px-5 py-2.5 sticky top-0 z-10 bg-card">
                    <GridSearchInput
                      className="max-w-[220px]"
                      placeholder="Buscar por nombre, RFC o licencia…"
                      value={q}
                      onChange={setQ}
                    />
                  </th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-10 bg-card">RFC</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-10 bg-card">Núm. Licencia</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-10 bg-card">Estado</th>
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
                          onClick={handleDeactivateSelected}
                          disabled={deletingSelected}
                        >
                          {deletingSelected && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                          Desactivar seleccionados
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" className="gap-1.5 text-xs" onClick={startAdd} disabled={isAdding}>
                        <Plus className="w-3.5 h-3.5" />
                        Nuevo chofer
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
                        className="h-8 text-xs md:text-xs"
                        value={form.nombre}
                        onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                        placeholder="Nombre completo"
                        autoFocus
                      />
                    </td>
                    <td className="px-5 py-2.5">
                      <Input
                        className="h-8 text-xs md:text-xs font-mono"
                        value={form.rfc}
                        onChange={(e) => setForm((f) => ({ ...f, rfc: e.target.value.toUpperCase() }))}
                        placeholder="XAXX010101000"
                      />
                    </td>
                    <td className="px-5 py-2.5">
                      <Input
                        className="h-8 text-xs md:text-xs"
                        value={form.numeroLicencia}
                        onChange={(e) => setForm((f) => ({ ...f, numeroLicencia: e.target.value }))}
                        placeholder="Opcional"
                      />
                    </td>
                    <td className="px-5 py-2.5" />
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
                    <td colSpan={5} className="px-5 pb-2 text-xs text-red-600">
                      {error}
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground text-sm">
                      Cargando...
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && !isAdding && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground text-sm">
                      Sin choferes registrados.
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
                {filteredRows.map((c) => {
                  const isEditing = editingId === c.id;
                  if (isEditing) {
                    return (
                      <Fragment key={c.id}>
                        <tr className="bg-primary/5">
                          <td className="px-5 py-2.5" />
                          <td className="px-5 py-2.5">
                            <Input
                              className="h-8 text-xs md:text-xs"
                              value={form.nombre}
                              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                              autoFocus
                            />
                          </td>
                          <td className="px-5 py-2.5">
                            <Input
                              className="h-8 text-xs md:text-xs font-mono"
                              value={form.rfc}
                              onChange={(e) => setForm((f) => ({ ...f, rfc: e.target.value.toUpperCase() }))}
                            />
                          </td>
                          <td className="px-5 py-2.5">
                            <Input
                              className="h-8 text-xs md:text-xs"
                              value={form.numeroLicencia}
                              onChange={(e) => setForm((f) => ({ ...f, numeroLicencia: e.target.value }))}
                            />
                          </td>
                          <td className="px-5 py-2.5" />
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
                            <td colSpan={5} className="px-5 pb-2 text-xs text-red-600">
                              {error}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  }
                  return (
                    <tr key={c.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-5 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={(e) => toggleSelected(c.id, e.target.checked)}
                        />
                      </td>
                      <td className="px-5 py-2.5 font-medium text-foreground">{c.nombre}</td>
                      <td className="px-5 py-2.5 font-mono text-xs text-foreground/70">{c.rfc}</td>
                      <td className="px-5 py-2.5 text-muted-foreground text-xs">{c.numeroLicencia || "—"}</td>
                      <td className="px-5 py-2.5">
                        <Badge variant={c.active ? "outline" : "secondary"} className="text-[11px]">
                          {c.active ? "Activo" : "Inactivo"}
                        </Badge>
                      </td>
                      <td className="px-5 py-2.5 text-right whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-3 text-xs"
                          onClick={() => startEdit(c)}
                          disabled={editingId !== null}
                        >
                          Editar
                        </Button>
                        {c.active && (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 px-3 text-xs ml-2"
                            onClick={() => handleDeactivate(c)}
                            disabled={editingId !== null}
                          >
                            Desactivar
                          </Button>
                        )}
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
