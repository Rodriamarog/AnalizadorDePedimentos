import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
  Button,
} from "pedimentos-v2-ds";

export function Default() {
  return (
    <Popover defaultOpen>
      <PopoverTrigger render={<Button variant="outline">Ver detalle</Button>} />
      <PopoverContent>
        <PopoverHeader>
          <PopoverTitle>Pedimento 24384521901</PopoverTitle>
          <PopoverDescription>Comercial del Norte SA · 14 partidas</PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}
