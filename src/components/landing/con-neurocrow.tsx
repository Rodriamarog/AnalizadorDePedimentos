"use client";

import { Player } from "@remotion/player";
import { SolutionDemo, SOLUTION_DEMO_DURATION, SOLUTION_DEMO_FPS } from "./remotion/SolutionDemo";

export function ConNeurocrow() {
  return (
    <section className="mx-auto max-w-6xl px-6 pt-4 pb-20 md:px-10 md:pb-28">
      <div className="mx-auto max-w-2xl text-center">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Con Neurocrow</span>
        <h2 className="mt-3 font-sans text-3xl font-black text-foreground md:text-4xl">
          Un clic. Cero capturas.
        </h2>
        <p className="mt-3 text-sm text-muted-foreground md:text-base">
          Sube el pedimento, deja que Neurocrow calcule cada partida y factura con un clic — sin
          tocar una hoja de cálculo.
        </p>
      </div>

      <div className="mx-auto mt-12 max-w-4xl overflow-hidden rounded-xl shadow-xl ring-1 ring-black/10">
        <Player
          component={SolutionDemo}
          durationInFrames={SOLUTION_DEMO_DURATION}
          compositionWidth={1600}
          compositionHeight={900}
          fps={SOLUTION_DEMO_FPS}
          style={{ width: "100%" }}
          autoPlay
          loop
          initiallyMuted
          controls={false}
          clickToPlay={false}
          doubleClickToFullscreen={false}
          spaceKeyToPlayOrPause={false}
          showVolumeControls={false}
          allowFullscreen={false}
        />
      </div>
    </section>
  );
}
