"use client";

import { useEffect, useRef } from "react";

/**
 * Runs once per dashboard load: if the current org has no FacturAPI account
 * yet (and isn't using a manually-entered key), provisions one silently so a
 * brand-new org can start using the app immediately without a trip to
 * /configuracion. Provisioning is idempotent server-side, so this is safe to
 * fire on every load.
 */
export function AutoProvisionFacturapi() {
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    (async () => {
      try {
        const res = await fetch("/api/settings/facturapi-key");
        if (!res.ok) return;
        const status = await res.json();
        if (!status.manualFacturapiKey && !status.facturapiOrgId) {
          await fetch("/api/settings/facturapi-provision", { method: "POST" });
        }
      } catch {
        // Silent: the user can still provision manually from /configuracion.
      }
    })();
  }, []);

  return null;
}
