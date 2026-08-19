"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Receipt } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { FacturaForm, DOCUMENT_TYPE_OPTIONS, type DocumentType, type PedimentoForFactura } from "@/components/factura-form";

function isDocumentType(value: string | null): value is DocumentType {
  return DOCUMENT_TYPE_OPTIONS.some(([code]) => code === value);
}

// Shape of GET /api/pedimentos/[id] — only the fields FacturaForm needs to
// prefill from a linked pedimento.
interface PedimentoDetailResponse {
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

function NuevaFacturaPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pedimentoId = searchParams.get("pedimentoId");
  const tipoParam = searchParams.get("tipo");

  const [documentType, setDocumentType] = useState<DocumentType>(isDocumentType(tipoParam) ? tipoParam : "factura");
  // undefined: not linked to a pedimento. null: linked, still loading (or
  // failed to load). An object once the pedimento's own data has arrived.
  const [pedimento, setPedimento] = useState<PedimentoForFactura | null | undefined>(pedimentoId ? null : undefined);
  const [pedimentoNotFound, setPedimentoNotFound] = useState(false);

  const backHref = pedimentoId ? `/pedimentos/${pedimentoId}` : "/facturas";

  useEffect(() => {
    if (!pedimentoId) return;
    let cancelled = false;
    fetch(`/api/pedimentos/${pedimentoId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: PedimentoDetailResponse | null) => {
        if (cancelled) return;
        if (!data) {
          setPedimentoNotFound(true);
          return;
        }
        setPedimento({
          id: data.id,
          pedimentoNum: data.pedimentoNum,
          importador: data.importador,
          tipoCambio: data.tipoCambio,
          fechaPago: data.fechaPago,
          claveAduana: data.claveAduana,
          dta: data.dta,
          igi: data.igi,
          prv: data.prv,
          partidas: data.partidas.map((p) => ({
            fraccion: p.fraccion,
            descripcion: p.descripcion,
            cantidad: p.cantidad,
            precioUnitario: p.precioUnitario,
            umc: p.umc,
            tipoCambio: p.tipoCambio,
          })),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [pedimentoId]);

  function handleDone() {
    router.push(backHref);
  }

  return (
    <div>
      <PageHeader title="Nueva factura" icon={Receipt} />
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {pedimentoId ? "Volver al pedimento" : "Facturas"}
      </Link>

      {pedimentoNotFound ? (
        <div className="py-16 text-center text-muted-foreground">
          Pedimento no encontrado.{" "}
          <Link href="/facturas" className="text-primary hover:underline">
            Volver
          </Link>
        </div>
      ) : pedimentoId && !pedimento ? (
        <div className="py-16 text-center text-muted-foreground">Cargando...</div>
      ) : (
        <Card>
          <CardContent>
            <FacturaForm
              documentType={documentType}
              onDocumentTypeChange={setDocumentType}
              pedimento={pedimento ?? undefined}
              onCancel={handleDone}
              onSaved={handleDone}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function NuevaFacturaPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-muted-foreground">Cargando...</div>}>
      <NuevaFacturaPageContent />
    </Suspense>
  );
}
