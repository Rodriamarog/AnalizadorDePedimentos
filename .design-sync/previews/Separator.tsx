import { Separator } from "pedimentos-v2-ds";

export function Horizontal() {
  return (
    <div style={{ width: 200 }}>
      <p style={{ fontSize: 13, margin: 0 }}>Arriba</p>
      <Separator style={{ margin: "8px 0" }} />
      <p style={{ fontSize: 13, margin: 0 }}>Abajo</p>
    </div>
  );
}

export function Vertical() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, height: 32 }}>
      <span style={{ fontSize: 13 }}>Editar</span>
      <Separator orientation="vertical" />
      <span style={{ fontSize: 13 }}>Eliminar</span>
    </div>
  );
}
