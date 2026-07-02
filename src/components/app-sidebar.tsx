"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileText,
  Users,
  Receipt,
  Package,
  Settings,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Pedimentos", href: "/pedimentos", icon: FileText },
  { title: "Clientes", href: "/clientes", icon: Users },
  { title: "Facturas", href: "/facturas", icon: Receipt },
  { title: "Productos", href: "/productos", icon: Package },
  { title: "Configuración", href: "/configuracion", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader className="px-5 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded bg-sidebar-primary flex items-center justify-center shrink-0">
            <span className="text-[11px] font-bold text-sidebar-primary-foreground tracking-tight">
              PV
            </span>
          </div>
          <div className="leading-none">
            <p className="text-[13px] font-semibold text-sidebar-accent-foreground tracking-tight">
              Pedimentos
            </p>
            <p className="text-[11px] text-sidebar-foreground mt-0.5">v2.0</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-4">
        <SidebarGroup className="p-0">
          <SidebarGroupLabel className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-sidebar-foreground/60">
            Módulos
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {navItems.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={<Link href={item.href} />}
                      isActive={isActive}
                      className="h-9 px-3 gap-3 text-[13px] text-sidebar-foreground hover:text-sidebar-accent-foreground transition-colors"
                    >
                      <item.icon
                        className={
                          isActive
                            ? "text-sidebar-primary"
                            : "text-sidebar-foreground/70"
                        }
                      />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-5 py-4 border-t border-sidebar-border">
        <p className="text-[11px] text-sidebar-foreground/40 tracking-wide">
          © 2026 Pedimentos MX
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
