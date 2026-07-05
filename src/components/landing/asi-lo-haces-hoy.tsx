"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { CheckIcon, MousePointer2, Receipt, SearchIcon, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Partida {
  partida: string;
  fraccion: string;
  descripcion: string;
  cantidad: string;
  valor: string;
  claveSat: string;
  claveSatDesc: string;
  box: { x: number; y: number; w: number; h: number };
}

const PARTIDAS: Partida[] = [
  {
    partida: "2",
    fraccion: "8517.62.01",
    descripcion: "Módulos de telecomunicación",
    cantidad: "340",
    valor: "212,500.00",
    claveSat: "43222612",
    claveSatDesc: "Equipo de radiocomunicación",
    box: { x: 1, y: 30, w: 98, h: 18 },
  },
  {
    partida: "3",
    fraccion: "3926.90.99",
    descripcion: "Componentes plásticos moldeados",
    cantidad: "600",
    valor: "58,200.00",
    claveSat: "31201500",
    claveSatDesc: "Componentes plásticos industriales",
    box: { x: 1, y: 55, w: 98, h: 18 },
  },
  {
    partida: "4",
    fraccion: "9018.90.99",
    descripcion: "Instrumental médico desechable",
    cantidad: "85",
    valor: "94,750.00",
    claveSat: "42182200",
    claveSatDesc: "Instrumental médico desechable",
    box: { x: 1, y: 79, w: 98, h: 9 },
  },
];

const DWELL_MS = 7000;
const TRANSITION_MS = 1400;

type Phase = "transitioning" | "dwelling";

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function useTimeline() {
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("transitioning");

  useEffect(() => {
    let cancelled = false;
    async function loop() {
      while (!cancelled) {
        setPhase("transitioning");
        await wait(TRANSITION_MS);
        if (cancelled) return;
        setPhase("dwelling");
        await wait(DWELL_MS);
        if (cancelled) return;
        setStepIndex((i) => (i + 1) % PARTIDAS.length);
      }
    }
    loop();
    return () => {
      cancelled = true;
    };
  }, []);

  return { stepIndex, phase };
}

export function AsiLoHacesHoy() {
  const { stepIndex, phase } = useTimeline();
  const partida = PARTIDAS[stepIndex];

  return (
    <section className="mx-auto max-w-6xl px-6 py-20 md:px-10 md:py-28">
      <span className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Así lo haces hoy</span>
      <h2 className="mt-3 max-w-2xl font-sans text-3xl font-black text-foreground md:text-4xl">
        Un pedimento, tres capturas manuales del mismo dato.
      </h2>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
        Copias la partida del PDF a una hoja de cálculo, y de ahí la vuelves a capturar en el
        sistema de facturación — buscando la clave SAT a mano en cada línea.
      </p>

      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        <div className="h-[380px] md:h-[440px]">
          <DocumentPanel box={partida.box} />
        </div>
        <div className="h-[380px] md:h-[440px]">
          <ExcelPanel stepIndex={stepIndex} phase={phase} />
        </div>
        <div className="h-[380px] md:h-[440px]">
          <InvoicePanel partida={partida} phase={phase} />
        </div>
      </div>
    </section>
  );
}

function DocumentPanel({ box }: { box: Partida["box"] }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/60 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
        <span className="ml-2 truncate font-mono text-[11px] text-muted-foreground">
          pedimento.pdf — página 3 de 14
        </span>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-hidden bg-neutral-100 p-3">
        <div className="relative h-full aspect-[1275/1650]">
          <Image
            src="/marketing/pedimento-partidas.png"
            alt="Página de partidas de un pedimento aduanal"
            fill
            className="object-contain"
            sizes="(max-width: 1024px) 90vw, 30vw"
            priority
          />
          <div
            className="absolute rounded-md border-2 border-primary bg-primary/10 transition-[top,left,width,height] duration-[1400ms] ease-in-out"
            style={{
              top: `${box.y}%`,
              left: `${box.x}%`,
              width: `${box.w}%`,
              height: `${box.h}%`,
              boxShadow: "0 0 16px 2px color-mix(in oklch, var(--primary) 55%, transparent)",
            }}
          >
            <MousePointer2
              className="absolute -right-2 -top-2 h-5 w-5 text-primary drop-shadow"
              fill="white"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ExcelPanel({ stepIndex, phase }: { stepIndex: number; phase: Phase }) {
  const [filledCount, setFilledCount] = useState(0);
  const [flashKey, setFlashKey] = useState(0);

  useEffect(() => {
    if (phase === "dwelling") {
      setFilledCount(stepIndex + 1);
      setFlashKey((k) => k + 1);
    } else if (phase === "transitioning" && stepIndex === 0) {
      setFilledCount(0);
    }
  }, [phase, stepIndex]);

  const gridCols = "grid-cols-[28px_92px_1fr_64px_88px]";
  const rowHeight = 28;
  const activeCellRef = phase === "dwelling" ? `B${stepIndex + 2}` : "A1";
  const activeCellValue = phase === "dwelling" ? PARTIDAS[stepIndex].fraccion : "";

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-white shadow-sm">
      <div className="flex items-center gap-2 bg-[#1D6F42] px-3 py-2 text-white">
        <Table2 className="h-3.5 w-3.5" />
        <span className="truncate font-sans text-[11px] font-semibold">partidas.xlsx — Excel</span>
      </div>

      <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-2 py-1">
        <span className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 font-mono text-[10px] text-neutral-600">
          {activeCellRef}
        </span>
        <span className="font-mono text-[10px] italic text-neutral-400">fx</span>
        <span className="truncate font-mono text-[10px] text-neutral-500">{activeCellValue}</span>
      </div>

      <div className="relative flex-1 overflow-hidden text-[11px]">
        <div className={cn("grid border-b border-neutral-200 bg-neutral-100 text-center font-mono text-[10px] text-neutral-500", gridCols)}>
          <div className="border-r border-neutral-200 py-1" />
          {["A", "B", "C", "D"].map((letter) => (
            <div key={letter} className="border-r border-neutral-200 py-1 last:border-r-0">
              {letter}
            </div>
          ))}
        </div>

        <div className={cn("grid border-b border-neutral-200 bg-neutral-50 font-semibold text-neutral-600", gridCols)}>
          <div className="flex items-center justify-center border-r border-neutral-200 text-neutral-400">1</div>
          {["Fracción", "Descripción", "Cantidad", "Valor Aduana"].map((label) => (
            <div key={label} className="truncate border-r border-neutral-200 px-1.5 py-1.5 last:border-r-0">
              {label}
            </div>
          ))}
        </div>

        <div className="relative">
          {PARTIDAS.map((p, i) => {
            const filled = i < filledCount;
            const justPasted = i === filledCount - 1;
            const flash = justPasted ? `${flashKey}` : "static";
            return (
              <div key={p.partida} className={cn("grid border-b border-neutral-200 text-neutral-700", gridCols)} style={{ height: rowHeight }}>
                <div className="flex items-center justify-center border-r border-neutral-200 bg-neutral-50 text-neutral-400">
                  {i + 2}
                </div>
                <div key={`f-${flash}`} className={cn("truncate border-r border-neutral-200 px-1.5 py-1 font-mono", justPasted && "nc-cell-paste")}>
                  {filled ? p.fraccion : ""}
                </div>
                <div key={`d-${flash}`} className={cn("truncate border-r border-neutral-200 px-1.5 py-1", justPasted && "nc-cell-paste")}>
                  {filled ? p.descripcion : ""}
                </div>
                <div key={`c-${flash}`} className={cn("border-r border-neutral-200 px-1.5 py-1 text-right font-mono", justPasted && "nc-cell-paste")}>
                  {filled ? p.cantidad : ""}
                </div>
                <div key={`v-${flash}`} className={cn("px-1.5 py-1 text-right font-mono", justPasted && "nc-cell-paste")}>
                  {filled ? `$${p.valor}` : ""}
                </div>
              </div>
            );
          })}

          {[0, 1, 2].map((i) => (
            <div key={`empty-${i}`} className={cn("grid border-b border-neutral-100 text-neutral-300", gridCols)} style={{ height: rowHeight }}>
              <div className="flex items-center justify-center border-r border-neutral-200 bg-neutral-50 text-neutral-400">
                {PARTIDAS.length + 2 + i}
              </div>
              <div className="border-r border-neutral-200" />
              <div className="border-r border-neutral-200" />
              <div className="border-r border-neutral-200" />
              <div />
            </div>
          ))}

          <MousePointer2
            className="pointer-events-none absolute h-4 w-4 -translate-x-1 -translate-y-1 text-neutral-700 drop-shadow transition-[top,left] duration-[1400ms] ease-in-out"
            style={{ top: stepIndex * rowHeight + rowHeight / 2, left: 34 }}
            fill="white"
          />
        </div>
      </div>
    </div>
  );
}

type FieldName = "descripcion" | "sat" | "cantidad" | "precio";

function InvoicePanel({ partida, phase }: { partida: Partida; phase: Phase }) {
  const [descripcion, setDescripcion] = useState("");
  const [claveSat, setClaveSat] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [precio, setPrecio] = useState("");
  const [satOpen, setSatOpen] = useState(false);
  const [satHighlight, setSatHighlight] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeField, setActiveField] = useState<FieldName | null>(null);

  useEffect(() => {
    if (phase !== "dwelling") {
      setDescripcion("");
      setClaveSat("");
      setCantidad("");
      setPrecio("");
      setSatOpen(false);
      setSatHighlight(false);
      setSaved(false);
      setActiveField(null);
      return;
    }

    let cancelled = false;
    async function type(setter: (v: string) => void, text: string, msPerChar: number) {
      for (let i = 1; i <= text.length; i++) {
        if (cancelled) return;
        setter(text.slice(0, i));
        await wait(msPerChar);
      }
    }

    async function run() {
      setActiveField("descripcion");
      await type(setDescripcion, partida.descripcion, 75);
      if (cancelled) return;

      setActiveField("sat");
      setSatOpen(true);
      await wait(900);
      if (cancelled) return;
      setSatHighlight(true);
      await wait(950);
      if (cancelled) return;
      setClaveSat(partida.claveSat);
      setSatOpen(false);
      setSatHighlight(false);
      await wait(400);
      if (cancelled) return;

      setActiveField("cantidad");
      await type(setCantidad, partida.cantidad, 200);
      if (cancelled) return;

      setActiveField("precio");
      await type(setPrecio, partida.valor, 140);
      if (cancelled) return;

      setActiveField(null);
      setSaved(true);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [phase, partida]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border bg-muted/60 px-3 py-2">
        <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="truncate font-mono text-[11px] text-muted-foreground">
          Sistema de facturación — nueva partida
        </span>
      </div>

      <div className="relative flex-1 space-y-3 p-4">
        <Field label="Descripción" active={activeField === "descripcion"}>
          <span className="truncate font-mono text-xs text-foreground">{descripcion}</span>
          {activeField === "descripcion" && <Caret />}
        </Field>

        <div className="relative">
          <Field label="Clave SAT" active={activeField === "sat"}>
            <span className="font-mono text-xs text-foreground">{claveSat}</span>
            {activeField === "sat" && !claveSat && <Caret />}
          </Field>

          {satOpen && (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-border bg-popover p-1 text-xs shadow-md ring-1 ring-foreground/10">
              <div className="flex items-center gap-1.5 px-2 py-1.5 text-muted-foreground">
                <SearchIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{partida.claveSatDesc.toLowerCase()}</span>
              </div>
              <div className={cn("flex items-center justify-between gap-2 rounded-md px-2 py-1.5", satHighlight && "bg-accent")}>
                <span className="shrink-0 font-mono text-[11px]">{partida.claveSat}</span>
                <span className="truncate text-[11px] text-muted-foreground">{partida.claveSatDesc}</span>
                {satHighlight && <CheckIcon className="h-3.5 w-3.5 shrink-0 text-primary" />}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Cantidad" active={activeField === "cantidad"}>
            <span className="font-mono text-xs text-foreground">{cantidad}</span>
            {activeField === "cantidad" && <Caret />}
          </Field>
          <Field label="Precio unitario" active={activeField === "precio"}>
            <span className="truncate font-mono text-xs text-foreground">{precio ? `$${precio}` : ""}</span>
            {activeField === "precio" && <Caret />}
          </Field>
        </div>

        {saved && (
          <span className="absolute bottom-3 right-3 rotate-[-4deg] rounded border border-primary/50 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wide text-primary">
            GUARDADO ✓
          </span>
        )}
      </div>
    </div>
  );
}

function Field({ label, active, children }: { label: string; active: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
        {active && <MousePointer2 className="h-3 w-3 text-primary" fill="currentColor" />}
      </span>
      <div
        className={cn(
          "mt-1 flex h-8 items-center rounded-md border bg-background px-2.5 transition-colors",
          active ? "border-primary ring-1 ring-primary/40" : "border-input"
        )}
      >
        {children}
      </div>
    </label>
  );
}

function Caret() {
  return <span className="nc-caret ml-px inline-block h-3.5 w-px align-middle bg-foreground" />;
}
