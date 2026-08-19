import { useCallback, useEffect, useState } from "react";

interface RegistryRow {
  id: string;
  active: boolean;
}

interface UseRegistryListOptions<T extends RegistryRow> {
  endpoint: string;
  searchFields: (row: T) => (string | null | undefined)[];
  // Query string (no leading "?") appended to `endpoint` for the list fetch
  // only — mutation calls (deactivate/hardDelete) still address rows via
  // `${endpoint}/${id}`. Must be a primitive string, not an object, so it's
  // stable across renders as a useCallback dependency.
  listQuery?: string;
}

export function useRegistryList<T extends RegistryRow>({
  endpoint,
  searchFields,
  listQuery,
}: UseRegistryListOptions<T>) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(listQuery ? `${endpoint}?${listQuery}` : endpoint);
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }, [endpoint, listQuery]);

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
