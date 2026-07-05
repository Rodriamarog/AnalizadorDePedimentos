import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupButton, InputGroupText } from "pedimentos-v2-ds";

export function WithIconAndClear() {
  return (
    <InputGroup style={{ width: 280 }}>
      <InputGroupAddon>
        <InputGroupText>🔍</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="Buscar pedimento…" defaultValue="24384521901" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-xs">✕</InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
