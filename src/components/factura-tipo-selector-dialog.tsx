"use client";

import { FileText, Landmark, Undo2, Truck, PackageSearch } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { type DocumentType } from "@/components/crear-factura-dialog";

const FACTURA_TIPO_CARDS: {
  type: DocumentType;
  title: string;
  description: string;
  icon: typeof FileText;
}[] = [
  {
    type: "factura",
    title: "Factura",
    description: "Factura estándar de venta, con las partidas del pedimento como conceptos.",
    icon: FileText,
  },
  {
    type: "recibo_honorarios",
    title: "Recibo de Honorarios",
    description: "Cobra honorarios de agencia aduanal o comercializadora.",
    icon: Landmark,
  },
  {
    type: "nota_credito",
    title: "Nota de Crédito",
    description: "Corrige o cancela el importe de una factura ya timbrada.",
    icon: Undo2,
  },
  {
    type: "carta_porte",
    title: "Carta Porte",
    description: "Ampara el traslado de las mercancías. No factura ningún importe.",
    icon: Truck,
  },
  {
    type: "carta_porte_ingreso",
    title: "Carta Porte Ingreso",
    description: "Factura la cuota del transportista (flete); las mercancías se declaran en el complemento.",
    icon: PackageSearch,
  },
];

interface FacturaTipoSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (type: DocumentType) => void;
}

export function FacturaTipoSelectorDialog({ open, onOpenChange, onSelect }: FacturaTipoSelectorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Elige el tipo de factura</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FACTURA_TIPO_CARDS.map(({ type, title, description, icon: Icon }) => (
            <Card
              key={type}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(type)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(type);
                }
              }}
              className="cursor-pointer ring-1 ring-foreground/10 transition hover:ring-foreground/30 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <CardHeader className="flex-row items-start gap-3">
                <div className="rounded-md bg-muted p-2 shrink-0">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <CardTitle>{title}</CardTitle>
                  <CardDescription className="mt-1 text-xs">{description}</CardDescription>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
