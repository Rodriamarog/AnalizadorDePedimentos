import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
  Button,
  Badge,
} from "pedimentos-v2-ds";

export function PedimentoCard() {
  return (
    <Card style={{ width: 320 }}>
      <CardHeader>
        <CardTitle>Pedimento 24384521901</CardTitle>
        <CardDescription>Comercial del Norte SA</CardDescription>
        <CardAction>
          <Badge variant="secondary">14 partidas</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: 0 }}>
          Tipo de cambio $17.42 · Aduana Nuevo Laredo
        </p>
      </CardContent>
      <CardFooter>
        <Button size="sm">Ver detalle</Button>
      </CardFooter>
    </Card>
  );
}
