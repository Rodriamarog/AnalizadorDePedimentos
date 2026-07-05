import { Meddon } from "next/font/google";

// A genuine signature script, not a rounded "casual cursive" — the pedimento
// itself is a document that gets hand-signed and stamped, so the wordmark
// borrows that vocabulary: NEUROCROW is the sharp, engineered company mark;
// "Pedimentos" is the human signature stamped underneath it.
const meddon = Meddon({ subsets: ["latin"], weight: "400" });

interface NeurocrowLockupProps {
  variant?: "hero" | "compact";
  animate?: boolean;
  className?: string;
}

export function NeurocrowLockup({ variant = "hero", animate = true, className = "" }: NeurocrowLockupProps) {
  const isHero = variant === "hero";

  return (
    <div className={`inline-flex flex-col ${isHero ? "items-start" : "items-center"} ${className}`}>
      <span
        className={`font-sans font-black uppercase leading-none tracking-tighter ${
          isHero ? "text-5xl md:text-6xl text-white" : "text-2xl text-foreground"
        }`}
      >
        Neurocrow
      </span>
      <span
        className={`${meddon.className} select-none text-primary ${
          isHero ? "-mt-3 md:-mt-4 ml-8 md:ml-12 text-6xl md:text-7xl" : "-mt-1.5 ml-4 text-3xl"
        } ${animate ? "signature-reveal" : ""}`}
        aria-hidden={isHero ? undefined : true}
      >
        Pedimentos
      </span>
      {!isHero && <span className="sr-only">Neurocrow Pedimentos</span>}
    </div>
  );
}
