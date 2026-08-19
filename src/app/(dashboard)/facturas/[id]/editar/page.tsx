"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Receipt } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { FacturaForm, type DocumentType, type FacturaDraftDetail } from "@/components/factura-form";

export default function EditarFacturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [draft, setDraft] = useState<FacturaDraftDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [documentType, setDocumentType] = useState<DocumentType>("factura");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/facturas/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: FacturaDraftDetail | null) => {
        if (cancelled) return;
        if (!data) {
          setNotFound(true);
          return;
        }
        setDraft(data);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  function handleDone() {
    router.push("/facturas");
  }

  return (
    <div>
      <PageHeader title="Editar borrador" icon={Receipt} />
      <Link
        href="/facturas"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Facturas
      </Link>

      {notFound ? (
        <div className="py-16 text-center text-muted-foreground">
          Borrador no encontrado.{" "}
          <Link href="/facturas" className="text-primary hover:underline">
            Volver
          </Link>
        </div>
      ) : !draft ? (
        <div className="py-16 text-center text-muted-foreground">Cargando...</div>
      ) : (
        <Card>
          <CardContent>
            <FacturaForm
              documentType={documentType}
              onDocumentTypeChange={setDocumentType}
              draft={draft}
              onCancel={handleDone}
              onSaved={handleDone}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
