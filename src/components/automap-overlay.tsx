import { Sparkles } from "lucide-react";

interface AutomapOverlayProps {
  running: boolean;
  progress: number;
  statusText: string;
  done: "success" | "error" | null;
}

// Renders nothing while `running` is false — same "AI is working" overlay
// used by both the pedimento-derived automap flow and the manual factura
// autofill, driven by useAutomapProgress.
export function AutomapOverlay({ running, progress, statusText, done }: AutomapOverlayProps) {
  if (!running) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background border border-border rounded-lg shadow-lg p-8 w-full max-w-sm text-center">
        <Sparkles className="w-8 h-8 text-primary mx-auto mb-3" />
        <h3 className="text-base font-semibold mb-2">Autocompletar SAT con IA</h3>
        <p className="text-sm text-muted-foreground mb-4 min-h-[1.25rem]">
          {done ? (done === "success" ? "¡Listo!" : "Ocurrió un error.") : statusText}
        </p>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-[2000ms] ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        {!done && <p className="text-[11px] text-muted-foreground mt-3">Esto puede tomar hasta 2 minutos</p>}
      </div>
    </div>
  );
}
