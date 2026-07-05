import { useState } from "react";
import { GridSearchInput } from "pedimentos-v2-ds";

export function WithValue() {
  const [value, setValue] = useState("24384521901");
  return <GridSearchInput value={value} onChange={setValue} />;
}

export function Empty() {
  const [value, setValue] = useState("");
  return <GridSearchInput value={value} onChange={setValue} placeholder="Buscar pedimento o importador…" />;
}
