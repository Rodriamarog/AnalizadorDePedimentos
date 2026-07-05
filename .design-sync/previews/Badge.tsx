import { Badge } from "pedimentos-v2-ds";

export function Variants() {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Badge>Facturado</Badge>
      <Badge variant="secondary">Pendiente</Badge>
      <Badge variant="destructive">Vencido</Badge>
      <Badge variant="outline">Borrador</Badge>
    </div>
  );
}
