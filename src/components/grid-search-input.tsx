"use client";

import { Search, X } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";

interface GridSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

// The nicer, shared search field used in every grid's header row — a search
// icon, a rounded pill on focus, and a clear (×) button once there's text.
export function GridSearchInput({ value, onChange, placeholder, className }: GridSearchInputProps) {
  return (
    <InputGroup className={className}>
      <InputGroupAddon>
        <Search className="w-3.5 h-3.5" />
      </InputGroupAddon>
      <InputGroupInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Buscar…"}
        className="text-xs"
      />
      {value && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" onClick={() => onChange("")} aria-label="Limpiar búsqueda">
            <X className="w-3 h-3" />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}
