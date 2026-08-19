"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { alertError } from "@/lib/alerts";

export interface ResolvedAddress {
  placeId: string;
  formattedAddress: string;
  calle: string;
  numeroExterior: string;
  colonia: string;
  municipio: string;
  estado: string;
  codigoPostal: string;
  pais: string;
}

interface Suggestion {
  placeId: string;
  text: string;
}

// Google address-suggestion search box backing issue #19. Typing surfaces
// Places Autocomplete suggestions under a single session token (regenerated
// after each resolved selection, per Google's session-billing model); picking
// one resolves structured fields via Place Details and hands them to the
// caller. Purely additive — it never touches the surrounding form's fields
// itself, so manual free-text entry alongside it keeps working untouched.
export function GoogleAddressAutocomplete({ onResolved }: { onResolved: (address: ResolvedAddress) => void }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [open, setOpen] = useState(false);
  const sessionTokenRef = useRef(crypto.randomUUID());

  useEffect(() => {
    const trimmed = query.trim();
    // `cancelled` guards against a slower earlier request's response landing
    // after a newer one (or after the query was cleared below 3 chars) and
    // clobbering the suggestions currently on screen with stale results.
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (trimmed.length < 3) {
        setSuggestions([]);
        return;
      }
      setSearching(true);
      try {
        const res = await fetch("/api/places/autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: trimmed, sessionToken: sessionTokenRef.current }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setSuggestions(data.suggestions ?? []);
          setOpen(true);
        }
      } catch {
        // Silent: a dropped keystroke-driven search shouldn't interrupt typing.
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  async function selectSuggestion(s: Suggestion) {
    setResolving(true);
    try {
      const res = await fetch("/api/places/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: s.placeId, sessionToken: sessionTokenRef.current }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al resolver la dirección");
      onResolved(data as ResolvedAddress);
      setQuery("");
      setSuggestions([]);
      setOpen(false);
      sessionTokenRef.current = crypto.randomUUID();
    } catch (e) {
      alertError("Dirección de Google", e instanceof Error ? e.message : "Error al resolver la dirección");
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          className="h-7 pl-7 text-xs"
          placeholder="Buscar dirección en Google…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {(searching || resolving) && (
          <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />
        )}
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-48 overflow-auto">
          {suggestions.map((s) => (
            <button
              key={s.placeId}
              type="button"
              className="block w-full text-left px-2.5 py-1.5 text-xs hover:bg-muted"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectSuggestion(s)}
            >
              {s.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
