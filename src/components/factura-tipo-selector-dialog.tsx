"use client";

import { FileText, Landmark, Undo2, Truck, PackageSearch } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { type DocumentType } from "@/components/crear-factura-dialog";

// Tailwind needs each color's full class names spelled out statically (no
// `bg-${color}-100` interpolation) for its JIT scanner to pick them up.
const ACCENTS = {
  sky: {
    ring: "hover:ring-sky-300 dark:hover:ring-sky-700",
    badge: "bg-sky-100 dark:bg-sky-500/15",
    icon: "text-sky-600 dark:text-sky-400",
    title: "group-hover:text-sky-700 dark:group-hover:text-sky-400",
  },
  emerald: {
    ring: "hover:ring-emerald-300 dark:hover:ring-emerald-700",
    badge: "bg-emerald-100 dark:bg-emerald-500/15",
    icon: "text-emerald-600 dark:text-emerald-400",
    title: "group-hover:text-emerald-700 dark:group-hover:text-emerald-400",
  },
  rose: {
    ring: "hover:ring-rose-300 dark:hover:ring-rose-700",
    badge: "bg-rose-100 dark:bg-rose-500/15",
    icon: "text-rose-600 dark:text-rose-400",
    title: "group-hover:text-rose-700 dark:group-hover:text-rose-400",
  },
  amber: {
    ring: "hover:ring-amber-300 dark:hover:ring-amber-700",
    badge: "bg-amber-100 dark:bg-amber-500/15",
    icon: "text-amber-600 dark:text-amber-400",
    title: "group-hover:text-amber-700 dark:group-hover:text-amber-400",
  },
  violet: {
    ring: "hover:ring-violet-300 dark:hover:ring-violet-700",
    badge: "bg-violet-100 dark:bg-violet-500/15",
    icon: "text-violet-600 dark:text-violet-400",
    title: "group-hover:text-violet-700 dark:group-hover:text-violet-400",
  },
} as const;

const FACTURA_TIPO_CARDS: {
  type: DocumentType;
  title: string;
  description: string;
  icon: typeof FileText;
  accent: keyof typeof ACCENTS;
}[] = [
  {
    type: "factura",
    title: "Factura",
    description: "Factura estándar de venta, con las partidas del pedimento como conceptos.",
    icon: FileText,
    accent: "sky",
  },
  {
    type: "recibo_honorarios",
    title: "Recibo de Honorarios",
    description: "Cobra honorarios de agencia aduanal o comercializadora.",
    icon: Landmark,
    accent: "emerald",
  },
  {
    type: "nota_credito",
    title: "Nota de Crédito",
    description: "Corrige o cancela el importe de una factura ya timbrada.",
    icon: Undo2,
    accent: "rose",
  },
  {
    type: "carta_porte",
    title: "Carta Porte",
    description: "Ampara el traslado de las mercancías. No factura ningún importe.",
    icon: Truck,
    accent: "amber",
  },
  {
    type: "carta_porte_ingreso",
    title: "Carta Porte Ingreso",
    description: "Factura la cuota del transportista (flete); las mercancías se declaran en el complemento.",
    icon: PackageSearch,
    accent: "violet",
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
          {FACTURA_TIPO_CARDS.map(({ type, title, description, icon: Icon, accent }) => {
            const a = ACCENTS[accent];
            return (
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
                className={`group cursor-pointer ring-1 ring-foreground/10 transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${a.ring}`}
              >
                <CardHeader className="flex-row items-start gap-3">
                  <div
                    className={`rounded-lg p-2.5 shrink-0 transition-transform duration-300 ease-out group-hover:scale-110 group-hover:-rotate-6 ${a.badge}`}
                  >
                    <Icon className={`w-4 h-4 ${a.icon}`} />
                  </div>
                  <div>
                    <CardTitle className={`transition-colors duration-200 ${a.title}`}>{title}</CardTitle>
                    <CardDescription className="mt-1 text-xs">{description}</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
