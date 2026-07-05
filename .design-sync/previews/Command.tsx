import {
  Command,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "pedimentos-v2-ds";

export function Default() {
  return (
    <Command style={{ width: 320, border: "1px solid var(--border)" }}>
      <CommandInput placeholder="Buscar pedimento…" />
      <CommandList>
        <CommandGroup heading="Pedimentos recientes">
          <CommandItem>
            24384521901
            <CommandShortcut>⌘1</CommandShortcut>
          </CommandItem>
          <CommandItem>
            24384519204
            <CommandShortcut>⌘2</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Acciones">
          <CommandItem>Subir nuevo pedimento</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
