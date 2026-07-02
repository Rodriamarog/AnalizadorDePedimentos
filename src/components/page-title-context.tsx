"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export interface PageTitleValue {
  title: string;
  description?: string;
  icon?: LucideIcon;
}

interface PageTitleContextValue {
  value: PageTitleValue | null;
  setValue: (v: PageTitleValue | null) => void;
}

const PageTitleContext = createContext<PageTitleContextValue | null>(null);

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<PageTitleValue | null>(null);
  return <PageTitleContext.Provider value={{ value, setValue }}>{children}</PageTitleContext.Provider>;
}

// Registers the current page's title/description/icon with the top bar.
// Cleared on unmount so navigating to a page without a title doesn't leave
// a stale one behind.
export function usePageTitle(title: string, description?: string, icon?: LucideIcon) {
  const ctx = useContext(PageTitleContext);
  if (!ctx) throw new Error("usePageTitle must be used within PageTitleProvider");
  const { setValue } = ctx;

  useEffect(() => {
    setValue({ title, description, icon });
    return () => setValue(null);
  }, [setValue, title, description, icon]);
}

export function useCurrentPageTitle(): PageTitleValue | null {
  const ctx = useContext(PageTitleContext);
  if (!ctx) throw new Error("useCurrentPageTitle must be used within PageTitleProvider");
  return ctx.value;
}
