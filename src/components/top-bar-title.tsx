"use client";

import { useCurrentPageTitle } from "@/components/page-title-context";

export function TopBarTitle() {
  const value = useCurrentPageTitle();
  if (!value) return null;
  const Icon = value.icon;

  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none max-w-[45%]">
      {Icon && <Icon className="w-4 h-4 text-primary shrink-0" />}
      <div className="leading-tight min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{value.title}</p>
        {value.description && (
          <p className="text-[11px] text-muted-foreground truncate">{value.description}</p>
        )}
      </div>
    </div>
  );
}
