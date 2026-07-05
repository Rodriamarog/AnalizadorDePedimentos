// Clerk's SignIn/SignUp widgets ship their own JS bundle and fetch instance
// config before they can paint anything, so first load has a visible blank
// gap. Shown inside <ClerkLoading>, sized to roughly match the real form so
// there's no layout jump when Clerk swaps in.
export function ClerkAuthSkeleton() {
  return (
    <div className="w-[360px]" aria-hidden="true">
      <div className="flex flex-col items-center gap-2">
        <div className="skeleton-bar h-5 w-40" />
        <div className="skeleton-bar h-3.5 w-52" />
      </div>

      <div className="skeleton-bar mt-6 h-9 w-full" />

      <div className="mt-5 flex items-center gap-3">
        <div className="skeleton-bar h-px flex-1" />
        <div className="skeleton-bar h-3 w-4" />
        <div className="skeleton-bar h-px flex-1" />
      </div>

      <div className="skeleton-bar mt-5 h-3 w-24" />
      <div className="skeleton-bar mt-1.5 h-9 w-full" />

      <div className="skeleton-bar mt-5 h-9 w-full" />

      <div className="mt-5 flex justify-center">
        <div className="skeleton-bar h-3 w-44" />
      </div>
    </div>
  );
}
