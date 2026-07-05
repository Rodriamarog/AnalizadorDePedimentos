import { ClerkLoaded, ClerkLoading, SignUp } from "@clerk/nextjs";
import { ClerkAuthSkeleton } from "@/components/clerk-auth-skeleton";
import { NeurocrowLockup } from "@/components/neurocrow-lockup";
import { clerkFlushAppearance } from "@/lib/clerk-flush-appearance";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 lg:flex-row lg:items-stretch lg:justify-start lg:gap-0">
      <div className="lg:hidden">
        <NeurocrowLockup variant="compact" />
      </div>

      <div className="hidden lg:flex lg:w-[46%] relative bg-sidebar bg-blueprint-lines overflow-hidden flex-col justify-center px-16 xl:px-20">
        <NeurocrowLockup variant="hero" />
        <div className="mt-8 flex items-center gap-3">
          <span className="h-px w-10 bg-sidebar-border" />
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-sidebar-foreground/70">
            Sistema de gestión aduanal
          </p>
        </div>
      </div>

      <div className="flex lg:flex-1 items-center justify-center bg-background px-4">
        <ClerkLoading>
          <ClerkAuthSkeleton />
        </ClerkLoading>
        <ClerkLoaded>
          <SignUp appearance={clerkFlushAppearance} />
        </ClerkLoaded>
      </div>
    </div>
  );
}
