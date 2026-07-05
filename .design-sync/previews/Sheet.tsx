import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  Button,
} from "pedimentos-v2-ds";

export function Default() {
  return (
    <Sheet defaultOpen>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Detalle del pedimento</SheetTitle>
          <SheetDescription>24384521901 · Comercial del Norte SA</SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <Button>Cerrar</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
