"use client";

import { useRef, useState } from "react";

const AUTOMAP_MESSAGES = [
  "Iniciando análisis…",
  "Buscando claves SAT…",
  "Consultando catálogo…",
  "La IA está pensando…",
  "Verificando resultados…",
  "Refinando búsqueda…",
  "Casi listo…",
];

// Stepped progress simulation matching the old app's timing — automap calls
// a real LLM and can take up to ~2 minutes, so this gives the user a sense of
// motion without pretending to track real progress.
const AUTOMAP_STEPS: Array<[number, number]> = [
  [400, 8],
  [3000, 22],
  [8000, 40],
  [18000, 55],
  [32000, 67],
  [50000, 77],
  [68000, 84],
  [85000, 88],
];

// Shared "AI is working" progress state driving the automap overlay — one
// copy of the stepped-progress/message-cycling timers used by both the
// pedimento-derived automap flow and the manual factura autofill (#15-#17),
// so the two stay visually and behaviorally identical.
export function useAutomapProgress() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState(AUTOMAP_MESSAGES[0]);
  const [done, setDone] = useState<"success" | "error" | null>(null);
  const timers = useRef<Array<ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>>>([]);

  function clearTimers() {
    timers.current.forEach((t) => {
      clearTimeout(t as ReturnType<typeof setTimeout>);
      clearInterval(t as ReturnType<typeof setInterval>);
    });
    timers.current = [];
  }

  function show() {
    clearTimers();
    setDone(null);
    setProgress(0);
    setStatusText(AUTOMAP_MESSAGES[0]);
    setRunning(true);

    AUTOMAP_STEPS.forEach(([delay, pct]) => {
      timers.current.push(setTimeout(() => setProgress(pct), delay));
    });

    let msgIdx = 0;
    timers.current.push(
      setInterval(() => {
        msgIdx = (msgIdx + 1) % AUTOMAP_MESSAGES.length;
        setStatusText(AUTOMAP_MESSAGES[msgIdx]);
      }, 5000)
    );
  }

  function hide(success: boolean) {
    clearTimers();
    setProgress(100);
    setDone(success ? "success" : "error");
    setTimeout(() => setRunning(false), 700);
  }

  return { running, progress, statusText, done, show, hide };
}
