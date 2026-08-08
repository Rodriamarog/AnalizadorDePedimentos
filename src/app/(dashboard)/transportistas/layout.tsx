"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Truck, IdCard, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { title: "Vehículos", href: "/transportistas/vehiculos", icon: Truck },
  { title: "Choferes", href: "/transportistas/choferes", icon: IdCard },
  { title: "Direcciones", href: "/transportistas/direcciones", icon: MapPin },
];

export default function TransportistasLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1 border-b border-border mb-3 shrink-0">
        {tabs.map((tab) => {
          const isActive = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors",
                isActive
                  ? "border-primary text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.title}
            </Link>
          );
        })}
      </div>
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </div>
  );
}
