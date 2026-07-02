"use client";

import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface SatComboBoxProps {
  endpoint: "/api/catalogs/products" | "/api/catalogs/units";
  value: string;
  description?: string | null;
  placeholder?: string;
  mapped?: boolean;
  confidence?: "medium" | "low" | null;
  // Still accepts/uses `description` internally (so passing it continues to
  // avoid the self-resolve fetch below) but skips rendering the label —
  // matches the old app's Facturar item table, which never showed
  // description labels under Clave/Unidad, unlike the main pedimento grid
  // and Productos table.
  hideDescription?: boolean;
  onSelect: (key: string, description: string) => void;
}

interface CatalogItem {
  key: string;
  description: string;
}

export function SatComboBox({
  endpoint,
  value,
  description,
  placeholder,
  mapped,
  confidence,
  hideDescription,
  onSelect,
}: SatComboBoxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [resolved, setResolved] = useState<{ value: string; description: string | null } | null>(null);

  useEffect(() => {
    if (!query) return;
    const timer = setTimeout(async () => {
      const res = await fetch(`${endpoint}?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const { data } = await res.json();
        setResults(data);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, endpoint]);

  // Callers don't always know the description for an already-mapped value
  // (e.g. a unit_key loaded from the DB with no description column) — in
  // that case resolve it ourselves by looking the exact key up, same as the
  // old app's per-key lookup against /catalogs/units.
  useEffect(() => {
    if (!mapped || !value || description !== undefined) return;
    let cancelled = false;
    fetch(`${endpoint}?q=${encodeURIComponent(value)}`).then(async (res) => {
      if (!res.ok || cancelled) return;
      const { data } = await res.json();
      const match = (data as CatalogItem[]).find((d) => d.key === value);
      if (!cancelled) setResolved({ value, description: match?.description ?? null });
    });
    return () => {
      cancelled = true;
    };
  }, [endpoint, value, mapped, description]);

  // Stale-value case (e.g. value changed while the fetch above was still in
  // flight, or mapped/description flipped) is derived here at render time
  // instead of clearing `resolved` synchronously inside the effect.
  const resolvedDescription = resolved?.value === value ? resolved.description : null;
  const displayDescription = description !== undefined ? description : resolvedDescription;

  const confClass =
    confidence === "medium"
      ? "border-amber-300 bg-amber-50 text-amber-800"
      : confidence === "low"
        ? "border-red-300 bg-red-50 text-red-800"
        : mapped
          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
          : "";

  return (
    <div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={cn(
            "w-full rounded-md border border-input px-2 py-1 text-left text-xs truncate",
            confClass
          )}
        >
          {value || <span className="text-muted-foreground">{placeholder ?? "Buscar…"}</span>}
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={placeholder ?? "Buscar…"}
            />
            <CommandList>
              <CommandEmpty>{query ? "Sin resultados." : "Escribe para buscar…"}</CommandEmpty>
              <CommandGroup>
                {(query ? results : []).map((r) => (
                  <CommandItem
                    key={r.key}
                    value={r.key}
                    onSelect={() => {
                      onSelect(r.key, r.description);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <span className="font-mono text-xs mr-2">{r.key}</span>
                    <span className="truncate text-xs text-muted-foreground">{r.description}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {!hideDescription && mapped && displayDescription && (
        <div className="text-[10px] text-muted-foreground truncate mt-0.5">{displayDescription}</div>
      )}
    </div>
  );
}
