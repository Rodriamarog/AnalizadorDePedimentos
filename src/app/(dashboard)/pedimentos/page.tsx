"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Upload, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GridSearchInput } from "@/components/grid-search-input";
import { confirmDelete } from "@/lib/alerts";

interface PedimentoRow {
  id: string;
  pedimentoNum: string;
  importador: string;
  tipoCambio: number;
  pdfFilename: string;
  fechaUpload: string;
  numPartidas: number;
}

export default function PedimentosPage() {
  const router = useRouter();
  const [rows, setRows] = useState<PedimentoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/pedimentos");
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }, []);

  const filteredRows = rows.filter((r) => {
    const query = q.trim().toLowerCase();
    if (!query) return true;
    return r.pedimentoNum.toLowerCase().includes(query) || r.importador.toLowerCase().includes(query);
  });

  useEffect(() => {
    // Standard fetch-on-mount pattern; same class of finding already present
    // (unaddressed) in src/hooks/use-mobile.ts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/parse", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al procesar el PDF");
        return;
      }
      router.push(`/pedimentos/${data.id}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(id: string, pedimentoNum: string) {
    const confirmed = await confirmDelete(
      "¿Eliminar pedimento?",
      `Pedimento ${pedimentoNum} — esta acción no se puede deshacer.`
    );
    if (!confirmed) return;
    const res = await fetch(`/api/pedimentos/${id}`, { method: "DELETE" });
    if (res.ok) setRows((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <PageHeader title="Pedimentos" description="Gestión de declaraciones aduanales" icon={FileText} />

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      <Card className="border-border shadow-none flex-1 min-h-0 flex flex-col">
        <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
          <div className="overflow-auto flex-1 min-h-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-10 bg-card">
                    Pedimento
                  </th>
                  <th className="text-left px-5 py-2.5 sticky top-0 z-10 bg-card">
                    <GridSearchInput
                      className="max-w-[220px]"
                      placeholder="Buscar por pedimento o importador…"
                      value={q}
                      onChange={setQ}
                    />
                  </th>
                  <th className="text-right px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-10 bg-card">
                    Partidas
                  </th>
                  <th className="text-right px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-10 bg-card">
                    T.C.
                  </th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-10 bg-card">
                    Fecha
                  </th>
                  <th className="px-5 py-2.5 text-right sticky top-0 z-10 bg-card">
                    <Button
                      size="sm"
                      className="gap-1.5 text-xs"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      {uploading ? "Procesando..." : "Subir pedimento"}
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
                      No hay pedimentos. Sube un PDF para empezar.
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
                {filteredRows.map((p) => (
                  <tr
                    key={p.id}
                    className="hover:bg-muted/40 transition-colors cursor-pointer"
                    onClick={() => router.push(`/pedimentos/${p.id}`)}
                  >
                    <td className="px-5 py-2.5 font-semibold text-foreground">{p.pedimentoNum}</td>
                    <td className="px-5 py-2.5 font-medium text-foreground">{p.importador}</td>
                    <td className="px-5 py-2.5 text-right text-muted-foreground">{p.numPartidas ?? "—"}</td>
                    <td className="px-5 py-2.5 text-right text-muted-foreground">
                      {p.tipoCambio ? p.tipoCambio.toFixed(4) : "—"}
                    </td>
                    <td className="px-5 py-2.5 text-muted-foreground text-xs">
                      {new Date(p.fechaUpload).toLocaleDateString("es-MX", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          className="h-7 px-3 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/pedimentos/${p.id}`);
                          }}
                        >
                          Ver
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 px-3 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(p.id, p.pedimentoNum);
                          }}
                        >
                          Eliminar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
