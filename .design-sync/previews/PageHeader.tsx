import { PageHeader, PageTitleProvider, Button } from "pedimentos-v2-ds";

export function WithActions() {
  return (
    <PageTitleProvider>
      <PageHeader title="Pedimentos" description="14 registrados">
        <Button size="sm">Subir pedimento</Button>
      </PageHeader>
    </PageTitleProvider>
  );
}
