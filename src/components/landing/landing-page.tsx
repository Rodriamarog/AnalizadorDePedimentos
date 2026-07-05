import Link from "next/link";
import { Building2, FileText, ScanLine, ShieldCheck, Table2, Zap } from "lucide-react";
import { NeurocrowLockup } from "@/components/neurocrow-lockup";
import { DemoUploader } from "@/components/landing/demo-uploader";
import { AsiLoHacesHoy } from "@/components/landing/asi-lo-haces-hoy";
import { ConNeurocrow } from "@/components/landing/con-neurocrow";

const TICKER_ITEMS = [
  "8471.30.01 EQUIPO DE CÓMPUTO PORTÁTIL",
  "2914.19.99 CETONAS",
  "9018.90.99 INSTRUMENTAL DE MEDICINA",
  "8517.62.01 APARATOS DE TELECOMUNICACIÓN",
  "3926.90.99 MANUFACTURAS DE PLÁSTICO",
  "8708.99.99 PARTES Y ACCESORIOS DE VEHÍCULOS",
];

const STEPS = [
  {
    n: "01",
    title: "Sube el pedimento",
    body: "Arrastra el PDF completo o selecciona el archivo. Sin plantillas, sin recortar páginas.",
  },
  {
    n: "02",
    title: "Extracción automática",
    body: "Cada partida, fracción arancelaria y valor se lee directo del documento.",
  },
  {
    n: "03",
    title: "Cotejo contra el SAT",
    body: "Cada fracción se valida contra los catálogos vigentes. Si algo no cuadra, te lo señala antes que la aduana.",
  },
  {
    n: "04",
    title: "Factura en PDF y XML",
    body: "La factura sale lista para timbrar, con cada partida ya conciliada.",
  },
];

const FEATURES = [
  {
    casilla: "01",
    icon: Building2,
    title: "Multi-organización",
    body: "Una cuenta, varios clientes y equipos — cada quien con lo suyo, sin mezclarse.",
  },
  {
    casilla: "02",
    icon: Table2,
    title: "Cotejo con catálogos SAT",
    body: "Cada fracción arancelaria se valida contra el catálogo vigente, automáticamente.",
  },
  {
    casilla: "03",
    icon: ScanLine,
    title: "Extracción de partidas",
    body: "Lee el pedimento completo — partidas, cantidades, valores — sin captura manual.",
  },
  {
    casilla: "04",
    icon: FileText,
    title: "Facturas PDF y XML",
    body: "Genera la factura lista para timbrar directo desde las partidas extraídas.",
  },
  {
    casilla: "05",
    icon: ShieldCheck,
    title: "Trazabilidad completa",
    body: "Cada pedimento, cada partida y cada cambio queda registrado y es consultable.",
  },
  {
    casilla: "06",
    icon: Zap,
    title: "Segundos, no horas",
    body: "Lo que tomaba una tarde de captura ahora toma el tiempo de subir un archivo.",
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-sidebar bg-blueprint-lines">
        <div className="mx-auto max-w-6xl px-6 md:px-10">
          <div className="flex items-center justify-end pt-6">
            <Link href="/sign-in" className="text-sm font-medium text-white/60 hover:text-white transition-colors">
              Iniciar sesión
            </Link>
          </div>

          <div className="grid gap-14 pt-10 pb-16 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:pt-14 lg:pb-24">
            <div>
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
                Para agentes aduanales · México
              </span>
              <div className="mt-5">
                <NeurocrowLockup variant="hero" />
              </div>
              <h1 className="mt-8 max-w-xl font-sans text-4xl font-black leading-[1.08] text-white md:text-5xl">
                Del PDF a la factura, <span className="text-primary">sin capturar una sola partida.</span>
              </h1>
              <p className="mt-5 max-w-md text-base text-white/70 md:text-lg">
                Sube el pedimento. Neurocrow extrae cada fracción arancelaria, la coteja contra los
                catálogos del SAT y arma la factura en PDF y XML — antes de que se enfríe el café.
              </p>
            </div>

            <div className="flex justify-center lg:justify-end">
              <DemoUploader />
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden border-t border-white/10 bg-black/20 py-3">
          <div className="flex w-max whitespace-nowrap nc-ticker-track font-mono text-xs tracking-wide text-white/40">
            {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
              <span key={i} className="px-4">
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <AsiLoHacesHoy />

      <ConNeurocrow />

      {/* ── Cómo funciona ────────────────────────────────────────── */}
      <section className="bg-muted/40">
        <div className="mx-auto max-w-6xl px-6 py-20 md:px-10 md:py-28">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Cómo funciona</span>
          <h2 className="mt-3 max-w-2xl font-sans text-3xl font-black text-foreground md:text-4xl">
            Cuatro pasos, un solo trámite.
          </h2>

          <div className="relative mt-14 grid gap-10 md:grid-cols-4">
            <div className="absolute top-6 left-0 right-0 hidden border-t border-dashed border-border md:block" />
            {STEPS.map((step) => (
              <div key={step.n} className="relative">
                <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary bg-background font-mono text-sm font-bold text-primary">
                  {step.n}
                </div>
                <h3 className="mt-4 font-sans text-lg font-bold text-foreground">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Características ──────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-20 md:px-10 md:py-28">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Características</span>
        <h2 className="mt-3 max-w-2xl font-sans text-3xl font-black text-foreground md:text-4xl">
          Cada casilla, cubierta.
        </h2>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.casilla} className="relative rounded-md border border-border p-5">
              <span className="absolute top-3 right-3 font-mono text-[10px] text-muted-foreground/60">
                CASILLA {feature.casilla}
              </span>
              <feature.icon className="h-5 w-5 text-primary" strokeWidth={2.25} />
              <h3 className="mt-4 font-sans text-base font-bold text-foreground">{feature.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA final ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-sidebar bg-blueprint-lines">
        <span
          aria-hidden
          className="pointer-events-none absolute -right-16 top-1/2 -translate-y-1/2 rotate-[-8deg] select-none font-sans text-[13rem] font-black leading-none text-white/[0.04]"
        >
          APROBADO
        </span>
        <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-10 px-6 py-24 text-center md:px-10 lg:flex-row lg:items-center lg:justify-between lg:text-left">
          <div>
            <h2 className="max-w-lg font-sans text-3xl font-black text-white md:text-4xl">
              Deja de capturar pedimentos a mano.
            </h2>
            <p className="mt-4 max-w-md text-white/70">
              Sube uno ahora mismo — sin cuenta, sin tarjeta, sin compromiso.
            </p>
          </div>
          <DemoUploader />
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="border-t border-white/10 bg-sidebar">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-6 py-8 text-center font-mono text-[11px] text-white/40 md:flex-row md:justify-between md:px-10 md:text-left">
          <span>NEUROCROW PEDIMENTOS · FOLIO NC-2026-000001</span>
          <div className="flex gap-5">
            <Link href="/sign-in" className="hover:text-white/70 transition-colors">
              Iniciar sesión
            </Link>
            <Link href="/sign-up" className="hover:text-white/70 transition-colors">
              Crear cuenta
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
