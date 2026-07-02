// One-off: exercises the XLSX export path against real DB data and inspects
// the generated file structurally (not just "it didn't throw").
import ExcelJS from "exceljs";
import { pedimentos, partidas } from "../src/lib/db/schema";
import { withOrg } from "../src/lib/db/withOrg";

const ORG = "org_export_test";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main() {
  const pedimentoId = await withOrg(ORG, async (tx) => {
    const [ped] = await tx
      .insert(pedimentos)
      .values({
        orgId: ORG,
        pedimentoNum: "24 12 3456 1234567",
        importador: "IMPORTADORA DE PRUEBA SA DE CV",
        tipoCambio: 18.5,
        pdfFilename: "test.pdf",
      })
      .returning();

    await tx.insert(partidas).values([
      {
        orgId: ORG,
        pedimentoId: ped.id,
        sec: 1,
        fraccion: "87089999",
        descripcion: "PARTES PARA VEHICULOS",
        cantidad: 100,
        valAduana: 5000,
        valComercial: 5000,
        precioUnitario: 50,
        tieneIncrementables: true,
      },
      {
        orgId: ORG,
        pedimentoId: ped.id,
        sec: 2,
        fraccion: "39235000",
        descripcion: "TAPAS DE PLASTICO",
        cantidad: 200,
        valAduana: 2000,
        valComercial: 2000,
        precioUnitario: 10,
        tieneIncrementables: false,
      },
    ]);

    return ped.id;
  });

  // Hits the actual route logic by importing the same building blocks the
  // route uses — avoids needing a running HTTP server + Clerk session for
  // this one-off script, same pattern as the other integration tests here.
  const { eq } = await import("drizzle-orm");
  const data = await withOrg(ORG, async (tx) => {
    const [pedimento] = await tx.select().from(pedimentos).where(eq(pedimentos.id, pedimentoId)).limit(1);
    const rows = await tx.select().from(partidas).where(eq(partidas.pedimentoId, pedimentoId));
    return { pedimento, partidas: rows };
  });

  const { buildExportWorkbook } = await import("../src/lib/exportXlsx");
  const wb = await buildExportWorkbook(data.pedimento, data.partidas);
  const buf = await wb.xlsx.writeBuffer();

  // Re-read the generated buffer to verify actual file structure, not just
  // the in-memory workbook object.
  const readBack = new ExcelJS.Workbook();
  await readBack.xlsx.load(buf as ArrayBuffer);
  const ws = readBack.getWorksheet("Partidas")!;

  assert(ws.getCell("A1").value === "Pedimento: 24 12 3456 1234567", "title row has pedimento number");
  assert(ws.getCell("A2").value === "Importador: IMPORTADORA DE PRUEBA SA DE CV", "title row has importador");

  const headerRow = ws.getRow(4).values as unknown[];
  assert(headerRow[1] === "Partida", "header row 1 is Partida");
  assert(headerRow[8] === "Incrementables", "header row 8 is Incrementables");

  const row5 = ws.getRow(5);
  assert(row5.getCell(1).value === 1, "row 5 sec = 1");
  assert(row5.getCell(2).value === 5000, "row 5 val_aduana = 5000");
  assert(Math.abs((row5.getCell(7).value as number) - 50) < 1e-9, "row 5 P.U MN = 50");
  assert(Math.abs((row5.getCell(5).value as number) - 50 / 18.5) < 1e-9, "row 5 P.U USD computed correctly");
  assert(row5.getCell(8).value === "Sí", "row 5 (has incrementables) marked Sí");
  assert(
    (row5.getCell(1).fill as ExcelJS.Fill & { fgColor?: { argb?: string } })?.fgColor?.argb === "FFFEF8EC",
    "row 5 has amber fill for incrementables"
  );

  const row6 = ws.getRow(6);
  assert(row6.getCell(8).value === "No", "row 6 (no incrementables) marked No");
  assert(!row6.getCell(1).fill || row6.getCell(1).fill.type !== "pattern", "row 6 has no amber fill");

  assert(ws.rowCount === 6, "sheet has exactly 2 data rows (rows 5-6)");

  await withOrg(ORG, async (tx) => {
    await tx.delete(partidas).where(eq(partidas.pedimentoId, pedimentoId));
    await tx.delete(pedimentos).where(eq(pedimentos.id, pedimentoId));
  });

  console.log("Export integration test passed: real data -> real xlsx buffer -> structural verification.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
