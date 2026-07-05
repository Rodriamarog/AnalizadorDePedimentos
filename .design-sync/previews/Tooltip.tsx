import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, Button } from "pedimentos-v2-ds";

export function Default() {
  return (
    <TooltipProvider>
      <Tooltip defaultOpen>
        <TooltipTrigger render={<Button variant="outline">Exportar</Button>} />
        <TooltipContent>Exportar a Excel</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
