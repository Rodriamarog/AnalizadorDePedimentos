"use client";

import type { LucideIcon } from "lucide-react";
import { usePageTitle } from "@/components/page-title-context";

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  children?: React.ReactNode;
}

// Registers the page's title/description in the top bar (rendered centered
// there via <TopBarTitle>) instead of taking up vertical space in the main
// content area. Only renders something here if the page also has action
// buttons (children) to show.
export function PageHeader({ title, description, icon, children }: PageHeaderProps) {
  usePageTitle(title, description, icon);

  if (!children) return null;

  return (
    <div className="flex items-center justify-end mb-6">
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
