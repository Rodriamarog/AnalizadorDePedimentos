"use client";

import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Parses/builds the native <input type="datetime-local"> string format
// ("YYYY-MM-DDTHH:mm") directly against local Date fields (no UTC
// conversion) so the picker round-trips exactly what a plain
// datetime-local input would have produced.
function parseValue(value: string): { date: Date | undefined; time: string } {
  if (!value) return { date: undefined, time: "" };
  const [datePart, timePart] = value.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  if (!y || !m || !d) return { date: undefined, time: "" };
  return { date: new Date(y, m - 1, d), time: timePart ?? "" };
}

function toValue(date: Date, time: string): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}T${time || "12:00"}`;
}

const dateFormatter = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" });

export function DateTimePicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { date, time } = parseValue(value);

  function handleSelectDate(next: Date | undefined) {
    if (!next) return;
    onChange(toValue(next, time));
    setOpen(false);
  }

  function handleTimeChange(nextTime: string) {
    onChange(toValue(date ?? new Date(), nextTime));
  }

  function handleNow() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    onChange(toValue(now, `${hh}:${mm}`));
    setOpen(false);
  }

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={cn(
            "flex h-8 flex-1 items-center gap-1.5 rounded-md border border-input px-2.5 text-xs text-left",
            !date && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="w-3.5 h-3.5 shrink-0" />
          {date ? dateFormatter.format(date) : "Selecciona fecha"}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={date} onSelect={handleSelectDate} autoFocus />
          <div className="border-t border-border p-2">
            <Button type="button" variant="outline" size="sm" className="w-full" onClick={handleNow}>
              Ahora
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <Input type="time" className="h-8 w-24 text-xs" value={time} onChange={(e) => handleTimeChange(e.target.value)} />
    </div>
  );
}
