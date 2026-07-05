"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { CrowMascot } from "@/components/landing/crow-mascot";

interface DemoPartida {
  sec: number;
  fraccion: string;
  descripcion: string;
  cantidad: number;
  valAduana: number;
}

interface DemoResult {
  pedimentoNum: string;
  importador: string;
  totalPartidas: number;
  partidas: DemoPartida[];
}

type Status = "idle" | "loading" | "success" | "error";

export function DemoUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DemoResult | null>(null);

  async function handleFile(file: File) {
    setStatus("loading");
    setError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/demo-parse", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo procesar el pedimento.");
        setStatus("error");
        return;
      }
      setResult(data);
      setStatus("success");
    } catch {
      setError("No se pudo conectar con el servidor. Intenta de nuevo.");
      setStatus("error");
    }
  }

  return (
    <div className="relative w-full max-w-sm">
      <CrowMascot className="absolute -top-11 left-1/2 -translate-x-1/2 w-20 h-auto z-10 drop-shadow-[0_6px_10px_rgba(0,0,0,0.4)]" />

      <div className="relative rounded-lg border border-white/15 bg-white/[0.04] px-6 pt-9 pb-5 text-center backdrop-blur-sm">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />

        {status !== "success" && (
          <>
            <button
              type="button"
              disabled={status === "loading"}
              onClick={() => inputRef.current?.click()}
              className="w-full rounded-md bg-primary px-5 py-3.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {status === "loading" ? "Leyendo tu pedimento…" : "Sube un pedimento — 1 escaneo gratis"}
            </button>
            <p className="mt-2.5 font-mono text-[11px] tracking-wide text-white/50">
              sin cuenta · limitado a 1 por día
            </p>
          </>
        )}

        {status === "error" && (
          <p className="mt-3 text-xs text-destructive">{error}</p>
        )}

        {status === "success" && result && (
          <div className="text-left">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-white/50">
                PEDIMENTO {result.pedimentoNum}
              </span>
              <span className="rounded border border-primary/50 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wide text-primary rotate-[-4deg]">
                EXTRAÍDO ✓
              </span>
            </div>
            <p className="mt-1 font-sans text-sm font-semibold text-white">
              {result.importador}
            </p>
            <ul className="mt-3 space-y-1.5 max-h-40 overflow-y-auto">
              {result.partidas.map((p) => (
                <li
                  key={p.sec}
                  className="flex items-baseline justify-between gap-3 border-t border-white/10 pt-1.5 first:border-t-0 first:pt-0"
                >
                  <span className="font-mono text-[11px] text-primary shrink-0">{p.fraccion}</span>
                  <span className="flex-1 truncate text-xs text-white/70">{p.descripcion}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 font-mono text-[11px] text-white/50">
              {result.totalPartidas} partida{result.totalPartidas === 1 ? "" : "s"} en total
            </p>
            <Link
              href="/sign-up"
              className="mt-4 block rounded-md bg-primary px-4 py-2.5 text-center text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Crea tu cuenta para generar la factura →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
