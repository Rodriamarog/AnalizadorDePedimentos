import { useCallback, useEffect, useState } from "react";

interface RegistryRow {
  id: string;
  active: boolean;
}

interface UseRegistryListOptions<T extends RegistryRow> {
  endpoint: string;
  searchFields: (row: T) => (string | null | undefined)[];
}

export function useRegistryList<T extends RegistryRow>({
  endpoint,
  searchFields,
}: UseRegistryListOptions<T>) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(endpoint);
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }, [endpoint]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const query = q.trim().toLowerCase();
  const filteredRows = query
    ? rows.filter((row) =>
        searchFields(row).some((field) => (field ?? "").toLowerCase().includes(query))
      )
    : rows;

  const deactivate = useCallback(
    async (id: string) => {
      const res = await fetch(`${endpoint}/${id}`, { method: "DELETE" });
      if (res.ok) await load();
      return res.ok;
    },
    [endpoint, load]
  );

  const deactivateMany = useCallback(
    async (ids: string[]) => {
      await Promise.all(ids.map((id) => fetch(`${endpoint}/${id}`, { method: "DELETE" })));
      await load();
    },
    [endpoint, load]
  );

  // Permanently removes the row, as opposed to `deactivate`'s soft-delete.
  const hardDelete = useCallback(
    async (id: string) => {
      const res = await fetch(`${endpoint}/${id}?permanent=true`, { method: "DELETE" });
      if (res.ok) await load();
      return res.ok;
    },
    [endpoint, load]
  );

  return { rows, filteredRows, loading, q, setQ, load, deactivate, deactivateMany, hardDelete };
}
