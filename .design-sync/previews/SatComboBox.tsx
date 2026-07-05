import { SatComboBox } from "pedimentos-v2-ds";

export function Mapped() {
  return (
    <div style={{ width: 220 }}>
      <SatComboBox
        endpoint="/api/catalogs/products"
        value="84713001"
        description="Máquinas automáticas para tratamiento de datos"
        mapped
        onSelect={() => {}}
      />
    </div>
  );
}

export function Empty() {
  return (
    <div style={{ width: 220 }}>
      <SatComboBox endpoint="/api/catalogs/products" value="" onSelect={() => {}} />
    </div>
  );
}
