import type { ReactNode } from "react";

// Shared outer canvas for every demo clip: deep navy background with the
// app's blueprint-hairline texture, framing a centered "app window" card so
// each clip reads as a real screen, not a bare component floating in space.
export function Stage({ children }: { children: ReactNode }) {
  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{
        background: "oklch(0.114 0.024 264)",
        backgroundImage:
          "repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 44px)",
      }}
    >
      <div className="w-[1680px] h-[920px] rounded-2xl border border-white/10 bg-background shadow-2xl overflow-hidden flex flex-col">
        {children}
      </div>
    </div>
  );
}

export function AppTopBar({ title }: { title: string }) {
  return (
    <div
      className="h-14 flex items-center justify-between px-6 border-b border-border shrink-0"
      style={{ background: "oklch(0.114 0.024 264)" }}
    >
      <div className="flex items-center gap-2">
        <span className="text-white font-black uppercase tracking-tighter text-lg leading-none">
          Neurocrow
        </span>
        <span
          style={{ fontFamily: "Meddon, cursive" }}
          className="text-primary text-2xl leading-none -ml-1 -mt-1"
        >
          Pedimentos
        </span>
      </div>
      <span className="text-white/50 text-sm">{title}</span>
    </div>
  );
}
