import { Skeleton } from "pedimentos-v2-ds";

export function Default() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 220 }}>
      <Skeleton style={{ height: 14, width: "60%" }} />
      <Skeleton style={{ height: 14, width: "90%" }} />
      <Skeleton style={{ height: 14, width: "75%" }} />
    </div>
  );
}
