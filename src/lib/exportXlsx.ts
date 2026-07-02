import ExcelJS from "exceljs";
import type { pedimentos, partidas } from "./db/schema";

type Pedimento = typeof pedimentos.$inferSelect;
type Partida = typeof partidas.$inferSelect;

const NUM_FMT_MONEY = "#,##0.00";
const NUM_FMT_PRECISE = "#,##0.00000";
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0C1E35" } };
const AMBER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF8EC" } };
const THIN_BOTTOM_BORDER: Partial<ExcelJS.Borders> = { bottom: { style: "thin", color: { argb: "FFE2E6ED" } } };

export async function buildExportWorkbook(pedimento: Pedimento, partidaRows: Partida[]): Promise<ExcelJS.Workbook> {
  const tc = pedimento.tipoCambio || 0;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Partidas");

  ws.mergeCells("A1:H1");
  ws.getCell("A1").value = `Pedimento: ${pedimento.pedimentoNum}`;
  ws.getCell("A1").font = { bold: true, size: 12 };
  ws.mergeCells("A2:H2");
  ws.getCell("A2").value = `Importador: ${pedimento.importador}`;
  ws.getCell("A2").font = { size: 10, color: { argb: "FF64748B" } };

  const headers = [
    "Partida",
    "Valor de Aduana",
    "Piezas",
    "Tipo de Cambio",
    "P.U USD",
    "Valor Dlls",
    "P.U MN",
    "Incrementables",
  ];
  headers.forEach((h, i) => {
    const cell = ws.getCell(4, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  partidaRows.forEach((p, i) => {
    const row = 5 + i;
    const puMn = p.cantidad ? p.valAduana / p.cantidad : 0;
    const puUsd = tc ? puMn / tc : 0;
    const valorDlls = tc ? p.valAduana / tc : 0;
    const hasInc = p.tieneIncrementables;

    ws.getCell(row, 1).value = p.sec;
    ws.getCell(row, 2).value = p.valAduana;
    ws.getCell(row, 2).numFmt = NUM_FMT_MONEY;
    ws.getCell(row, 3).value = p.cantidad;
    ws.getCell(row, 4).value = tc || null;
    ws.getCell(row, 4).numFmt = NUM_FMT_PRECISE;
    ws.getCell(row, 5).value = tc ? puUsd : null;
    ws.getCell(row, 5).numFmt = NUM_FMT_PRECISE;
    ws.getCell(row, 6).value = tc ? valorDlls : null;
    ws.getCell(row, 6).numFmt = NUM_FMT_MONEY;
    ws.getCell(row, 7).value = puMn;
    ws.getCell(row, 7).numFmt = NUM_FMT_PRECISE;
    ws.getCell(row, 8).value = hasInc ? "Sí" : "No";

    if (hasInc) {
      for (let col = 1; col <= 8; col++) {
        ws.getCell(row, col).fill = AMBER_FILL;
        ws.getCell(row, col).border = THIN_BOTTOM_BORDER;
      }
    }
  });

  const colWidths = [10, 16, 10, 16, 16, 14, 16, 16];
  colWidths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  return wb;
}
