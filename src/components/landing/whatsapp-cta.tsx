import { MessageCircle } from "lucide-react";
import { CrowMascot } from "@/components/landing/crow-mascot";

const WHATSAPP_NUMBER = "16197612314";

function whatsappHref(message: string) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

interface WhatsappCtaProps {
  label: string;
  message: string;
  helperText?: string;
}

export function WhatsappCta({ label, message, helperText }: WhatsappCtaProps) {
  return (
    <div className="relative w-full max-w-sm">
      <CrowMascot className="absolute -top-11 left-1/2 -translate-x-1/2 w-20 h-auto z-10 drop-shadow-[0_6px_10px_rgba(0,0,0,0.4)]" />

      <div className="relative rounded-lg border border-white/15 bg-white/[0.04] px-6 pt-9 pb-5 text-center backdrop-blur-sm">
        <a
          href={whatsappHref(message)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-5 py-3.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <MessageCircle className="h-4 w-4" strokeWidth={2.5} />
          {label}
        </a>
        {helperText && (
          <p className="mt-2.5 font-mono text-[11px] tracking-wide text-white/50">{helperText}</p>
        )}
      </div>
    </div>
  );
}
