"use client";

import { useEffect, useRef, useState } from "react";

// The signature moment: a row "gets stamped" as it's read, like an
// inspector marking each partida off on the physical document. Triggers
// once via IntersectionObserver, then stays stamped.
export function ScrollStamp({
  children,
  delayMs = 0,
  className = "",
}: {
  children: React.ReactNode;
  delayMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [stamped, setStamped] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          const timer = setTimeout(() => setStamped(true), delayMs);
          observer.disconnect();
          return () => clearTimeout(timer);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [delayMs]);

  return (
    <div ref={ref} className={`${className} ${stamped ? "nc-stamped" : "nc-unstamped"}`}>
      {children}
    </div>
  );
}
