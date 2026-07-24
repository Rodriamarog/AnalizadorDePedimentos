import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Header,
  HeightRule,
  HorizontalPositionRelativeFrom,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  TextWrappingType,
  VerticalAlign,
  VerticalAlignTable,
  VerticalMergeType,
  VerticalPositionRelativeFrom,
  WidthType,
} from "docx";
import type { pedimentos, partidas } from "./db/schema";
import { paisToName } from "./paisOrigen";
import { regimenToName } from "./regimen";

// Letterhead ("hoja membretada") the client asked to have printed behind
// every generated report — logo/header + faint watermark + footer, supplied
// as public/pedimentos/logistic meginter hoja.docx. Pre-extracted to a
// smaller JPEG once (150dpi Letter, ~150KB vs. the original PNG's 4.7MB) so
// it doesn't bloat every generated docx.
//
// Read lazily (not at module load) via process.cwd(), not __dirname —
// __dirname points into the webpack-bundled server output, which doesn't
// contain this asset and breaks Next's build-time page-data collection.
// process.cwd() reliably resolves to the project root at request time, in
// both dev and production.
let letterheadImageCache: Buffer | null = null;
function getLetterheadImage(): Buffer {
  if (!letterheadImageCache) {
    letterheadImageCache = readFileSync(
      join(process.cwd(), "public", "pedimentos", "logistic-meginter-hoja.jpg")
    );
  }
  return letterheadImageCache;
}

// Letter page at 96 DPI (the pixel convention docx.js's ImageRun uses for
// `transformation`), so the floating image exactly covers one page.
const LETTERHEAD_WIDTH_PX = 816;
const LETTERHEAD_HEIGHT_PX = 1056;

function letterheadHeader(): Header {
  return new Header({
    children: [
      new Paragraph({
        children: [
          new ImageRun({
            type: "jpg",
            data: getLetterheadImage(),
            transformation: { width: LETTERHEAD_WIDTH_PX, height: LETTERHEAD_HEIGHT_PX },
            floating: {
              horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
              verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
              wrap: { type: TextWrappingType.NONE },
              behindDocument: true,
            },
          }),
        ],
      }),
    ],
  });
}

type Pedimento = typeof pedimentos.$inferSelect;
type Partida = typeof partidas.$inferSelect;

// Fixed values for every "Solicitud de Servicios de Inspección" this org
// files with this inspection unit — not derived from the pedimento.
const CONTRATO = "25040UCS000355";
const SERVICIO_SOLICITADO = "DICTAMEN";
const NUM_SOLICITUD = "0402500XXXX";
const TELEFONO = "664 624 8324 ext 112";
const DOMICILIO_INSPECCION =
  "CALLE CINCO NORTE No.805 CD.INDUSTRIAL TIJUANA, BAJA CALIFORNIA, C.P 22444 MEXICO";
const YELLOW_HIGHLIGHT = "FFFF00";

const MESES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

function isoToDayMonthYear(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `MÉXICO A ${String(d).padStart(2, "0")} DE ${MESES[m - 1]} DE ${y}`;
}

function isoToSlash(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

function isoPlusDays(iso: string | null, days: number): string {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoToSlash(date.toISOString().slice(0, 10));
}

function formatCantidad(cantidad: number): string {
  return Number.isInteger(cantidad) ? String(cantidad) : String(cantidad);
}

const LABEL_WIDTH = 4000;
const VALUE_WIDTH = 5528;

interface LabelRowOptions {
  // Every other section bolds its values; the top "FECHA DE ELABORACIÓN" ...
  // "SERVICIO SOLICITADO" block doesn't.
  valueBold?: boolean;
  // Yellow-highlights the value cell — used to flag FECHA DE ELABORACIÓN and
  // NORMA OFICIAL MEXICANA for the person filling in NO. DE SOLICITUD by hand.
  highlight?: boolean;
}

function labelRow(label: string, value: string, options: LabelRowOptions = {}): TableRow {
  const { valueBold = true, highlight = false } = options;
  return new TableRow({
    cantSplit: true,
    children: [
      new TableCell({
        width: { size: LABEL_WIDTH, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: label, bold: true, size: 16, font: "Arial", color: "000000" })],
          }),
        ],
      }),
      new TableCell({
        width: { size: VALUE_WIDTH, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        shading: highlight ? { fill: YELLOW_HIGHLIGHT } : undefined,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: value, bold: valueBold, size: 16, font: "Arial", color: "000000" })],
          }),
        ],
      }),
    ],
  });
}

function sectionHeader(text: string): Paragraph {
  // Plain bold paragraph rather than a HeadingLevel style — Word's built-in
  // Heading 3 style carries its own (blue-ish) theme color, which would
  // override an explicit color unless we opt out of the heading style
  // entirely like this.
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 40, after: 20 },
    children: [new TextRun({ text, bold: true, size: 16, font: "Arial", color: "000000" })],
  });
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

interface FooterCellOptions {
  width: number;
  columnSpan?: number;
  align?: (typeof AlignmentType)[keyof typeof AlignmentType];
  verticalAlign?: (typeof VerticalAlignTable)[keyof typeof VerticalAlignTable];
  // 13 = 6.5pt (the Obs. column), 16 = 8pt (everything else in this table) —
  // both smaller than the 20 (10pt) used throughout the rest of the document.
  size?: number;
  // Suppresses the top and/or bottom border — used for the ELABORO / spacer
  // / NOMBRE trio of rows, which must read as one undivided box even though
  // they're 3 separate physical table rows.
  noBorderTop?: boolean;
  noBorderBottom?: boolean;
}

// A cell with one or more stacked lines, for the footer table's non-uniform
// layout (ELABORO/NOMBRE spanning two columns, FECHA PROG/MAX 30 DÍAS/
// FORMATO each stacking a label and a value).
function footerCell(
  lines: { text: string; bold?: boolean; highlight?: boolean }[],
  options: FooterCellOptions
): TableCell {
  return new TableCell({
    width: { size: options.width, type: WidthType.DXA },
    columnSpan: options.columnSpan,
    verticalAlign: options.verticalAlign ?? VerticalAlignTable.CENTER,
    borders: {
      top: options.noBorderTop ? NO_BORDER : undefined,
      bottom: options.noBorderBottom ? NO_BORDER : undefined,
    },
    children: lines.map(
      (line) =>
        new Paragraph({
          alignment: options.align ?? AlignmentType.CENTER,
          shading: line.highlight ? { fill: YELLOW_HIGHLIGHT } : undefined,
          children: [
            new TextRun({
              text: line.text,
              bold: line.bold ?? true,
              size: options.size ?? 14,
              font: "Arial",
              color: "000000",
            }),
          ],
        })
    ),
  });
}

// Builds the `rowCount` physical cells for a column that visually spans
// multiple rows (Obs. text, "SELLO Y/O FIRMA DIGITAL"). We manage the
// vertical merge by hand — one RESTART cell with the real content followed
// by empty CONTINUE cells — instead of using TableCell's `rowSpan` shorthand,
// because `docx`'s auto-generated continuation cells only copy over
// rowSpan/columnSpan/borders, not verticalAlign. Left to the shorthand, a
// bottom-anchored merged cell renders at the wrong height in Word/LibreOffice
// since the un-set continuation cells default to top-aligned. Setting
// verticalAlign explicitly on every physical cell here fixes that.
function verticalMergeCells(
  lines: { text: string; bold?: boolean }[],
  options: { width: number; rowCount: number; align?: FooterCellOptions["align"]; verticalAlign?: FooterCellOptions["verticalAlign"]; size?: number }
): TableCell[] {
  return Array.from({ length: options.rowCount }, (_, i) => {
    const isFirst = i === 0;
    return new TableCell({
      width: { size: options.width, type: WidthType.DXA },
      verticalAlign: options.verticalAlign ?? VerticalAlignTable.CENTER,
      verticalMerge: isFirst ? VerticalMergeType.RESTART : VerticalMergeType.CONTINUE,
      children: isFirst
        ? lines.map(
            (line) =>
              new Paragraph({
                alignment: options.align ?? AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: line.text,
                    bold: line.bold ?? true,
                    size: options.size ?? 14,
                    font: "Arial",
                    color: "000000",
                  }),
                ],
              })
          )
        : [],
    });
  });
}

// `columnWidths` builds the table's `w:tblGrid` — when rows have a uniform
// shape (every labelRow-based table: 2 cells per row, every row) `docx`'s
// default (split the table width evenly across however many cells the
// widest row has) happens to match each cell's own `tcW` anyway. The footer
// table's rows are NOT uniform (3 cells in the ELABORO/spacer/NOMBRE rows vs
// 4 in the FECHA PROG/FORMATO rows), and left to the default, Word/LibreOffice
// fall back to that even 100/100/100/100 grid and ignore the real per-cell
// widths entirely — so it must be passed explicitly there.
function table(rows: TableRow[], columnWidths?: number[]): Table {
  return new Table({
    width: { size: LABEL_WIDTH + VALUE_WIDTH, type: WidthType.DXA },
    columnWidths,
    // Tighter than Word's default cell padding (~115 twips top/bottom) —
    // needed to fit everything above the letterhead's pre-printed footer on
    // a single real US Letter page (shorter than the A4 this was previously,
    // accidentally, being measured against).
    margins: { top: 20, bottom: 20, left: 80, right: 80 },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
    },
    rows,
  });
}

const OBS_LINES = [
  "Obs. 1. Documento con vigencia de 60 días naturales a partir de su fecha de expedición.",
  "Obs. 2 Logistic Meginter SA de CV no tienen relación comercial ni profesional diferente de la establecida para los " +
    "trabajos de inspección y mantiene de manera confidencial la información considerada propiedad del cliente, " +
    "proporcionada para dichos efectos.",
  "Obs. 3. Logistic Meginter SA de CV es una Unidad de Inspección Acreditada y Aprobada por las autoridades competentes.",
  "Obs. 4. El titular deberá solicitar su visita de inspección dentro de los treinta días naturales siguientes a la fecha " +
    "en que se active el mecanismo de selección automatizado de acuerdo con el ordenamiento legal aplicable.",
];

const FOOTER_OBS_WIDTH = 4400;
const FOOTER_SELLO_WIDTH = 1700;
const FOOTER_COL3_WIDTH = 1350;
const FOOTER_COL4_WIDTH = LABEL_WIDTH + VALUE_WIDTH - FOOTER_OBS_WIDTH - FOOTER_SELLO_WIDTH - FOOTER_COL3_WIDTH;

// The footer is 3 top-level columns: Obs. text (6.5pt, undivided, spans every
// row), "SELLO Y/O FIRMA DIGITAL" (8pt, undivided, spans every row, text
// anchored to the bottom of the box), and a third column subdivided into
// rows — ELABORO (top-anchored) / a blank spacer / NOMBRE (bottom-anchored)
// are 3 separate physical rows with the border between them suppressed so
// they read as one undivided box, followed by FECHA PROG/MAX 30 DÍAS and
// FORMATO/F-LM-03 (each split into the 2 sub-columns visible below).
function buildFooterTable(pedimento: Pedimento): Table {
  const ROW_COUNT = 5;
  const obsCells = verticalMergeCells(
    OBS_LINES.map((text) => ({ text, bold: true })),
    { width: FOOTER_OBS_WIDTH, rowCount: ROW_COUNT, align: AlignmentType.LEFT, size: 12 }
  );
  const selloCells = verticalMergeCells([{ text: "SELLO Y/O FIRMA DIGITAL" }], {
    width: FOOTER_SELLO_WIDTH,
    rowCount: ROW_COUNT,
    verticalAlign: VerticalAlignTable.BOTTOM,
  });

  return table([
    new TableRow({
      cantSplit: true,
      height: { value: 200, rule: HeightRule.ATLEAST },
      children: [
        obsCells[0],
        selloCells[0],
        footerCell([{ text: "ELABORO" }], {
          width: FOOTER_COL3_WIDTH + FOOTER_COL4_WIDTH,
          columnSpan: 2,
          verticalAlign: VerticalAlignTable.TOP,
          noBorderBottom: true,
        }),
      ],
    }),
    new TableRow({
      cantSplit: true,
      height: { value: 400, rule: HeightRule.ATLEAST },
      children: [
        obsCells[1],
        selloCells[1],
        footerCell([{ text: "" }], {
          width: FOOTER_COL3_WIDTH + FOOTER_COL4_WIDTH,
          columnSpan: 2,
          noBorderTop: true,
          noBorderBottom: true,
        }),
      ],
    }),
    new TableRow({
      cantSplit: true,
      height: { value: 200, rule: HeightRule.ATLEAST },
      children: [
        obsCells[2],
        selloCells[2],
        footerCell([{ text: "NOMBRE" }], {
          width: FOOTER_COL3_WIDTH + FOOTER_COL4_WIDTH,
          columnSpan: 2,
          verticalAlign: VerticalAlignTable.BOTTOM,
          noBorderTop: true,
        }),
      ],
    }),
    new TableRow({
      cantSplit: true,
      children: [
        obsCells[3],
        selloCells[3],
        footerCell(
          [
            { text: "FECHA PROG. PARA LA INSPECCION", bold: false },
            { text: isoToSlash(pedimento.fechaPedimento), bold: false, highlight: true },
          ],
          { width: FOOTER_COL3_WIDTH }
        ),
        footerCell(
          [
            { text: "MAX. 30 DÍAS POSTERIOR A LA FECHA DE DESADUANAMIENTO", bold: false },
            { text: isoPlusDays(pedimento.fechaEntrada, 30), bold: false, highlight: true },
          ],
          { width: FOOTER_COL4_WIDTH }
        ),
      ],
    }),
    new TableRow({
      cantSplit: true,
      height: { value: 300, rule: HeightRule.ATLEAST },
      children: [
        obsCells[4],
        selloCells[4],
        footerCell([{ text: "FORMATO", bold: false }], { width: FOOTER_COL3_WIDTH }),
        footerCell([{ text: "F-LM-03" }, { text: "REV.03" }], { width: FOOTER_COL4_WIDTH }),
      ],
    }),
  ], [FOOTER_OBS_WIDTH, FOOTER_SELLO_WIDTH, FOOTER_COL3_WIDTH, FOOTER_COL4_WIDTH]);
}

export interface InspeccionOptions {
  // Resolved from partida.umc via umcToUnitKey + the sat_unidades catalog —
  // resolved by the caller (a DB lookup), not computed here.
  unidadMedida: string;
  // Overrides pedimento.facturaNumero for the "FACTURA (S):" field — that
  // column is parsed from the COVE and often isn't the factura number that
  // actually belongs there, so the user can type the correct one(s) in the
  // inspección modal before generating. Not persisted; supplied fresh on
  // each request.
  facturaOverride?: string | null;
}

export function buildInspeccionDocx(
  pedimento: Pedimento,
  partida: Partida,
  options: InspeccionOptions
): Promise<Buffer> {
  const fraccionCompleta = `${partida.fraccion}${partida.subd ?? ""}`;
  const unidadMedida = options.unidadMedida.toUpperCase();
  const cantidad = formatCantidad(partida.cantidad);
  const factura = options.facturaOverride || pedimento.facturaNumero || "";

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            // Explicit US Letter ("tamaño carta") — required for this
            // document in Mexico, and also what the letterhead image is
            // sized for. `docx`'s own default page size is A4, which is
            // taller than Letter; left implicit, the letterhead image (sized
            // to exactly one Letter page) fell short of the real page
            // bottom, and our own margins — tuned for a Letter-height page —
            // ended up overlapping the letterhead's pre-printed footer text,
            // which sits higher up on the taller A4 page.
            size: { width: 12240, height: 15840 },
            // Extra top/bottom margin so our own content clears the
            // letterhead's pre-printed logo/header and contact-info footer,
            // which the background image doesn't leave room for otherwise.
            margin: { top: 2700, bottom: 1400, left: 1080, right: 1080 },
          },
        },
        headers: { default: letterheadHeader() },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 },
            children: [
              new TextRun({ text: "SOLICITUD DE SERVICIOS DE INSPECCION", bold: true, size: 22, font: "Arial" }),
            ],
          }),
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({
                text:
                  "En cumplimiento con lo dispuesto en los artículos; 6, 53 y 56 de la LEY DE INFRAESTUCTURA DE LA CALIDAD. " +
                  "Así como en la Norma Oficial Mexicana especificada posteriormente, me permito solicitar la inspección de:",
                size: 16,
                font: "Arial",
              }),
            ],
          }),
          table([
            labelRow("FECHA DE ELABORACIÓN:", isoToDayMonthYear(pedimento.fechaPedimento), {
              valueBold: false,
              highlight: true,
            }),
            labelRow("NO. DE SOLICITUD (S.E):", NUM_SOLICITUD, { valueBold: false }),
            labelRow("NORMA OFICIAL MEXICANA:", partida.nomClave ?? "", {
              valueBold: false,
              highlight: true,
            }),
            labelRow("NO. DE CONTRATO:", CONTRATO, { valueBold: false }),
            labelRow("SERVICIO SOLICITADO:", SERVICIO_SOLICITADO, { valueBold: false }),
          ]),
          sectionHeader("INFORMACION DEL CLIENTE"),
          table([
            labelRow("NOMBRE O RAZÓN SOCIAL:", pedimento.importador),
            labelRow("R.F.C:", pedimento.rfc ?? ""),
            labelRow("DOMICILIO FISCAL:", pedimento.domicilioFiscal ?? ""),
            labelRow("REP. O APODERADO LEGAL:", pedimento.importador),
            labelRow("SOLICITANTE:", pedimento.importador),
            labelRow("TELÉFONOS:", TELEFONO),
          ]),
          sectionHeader("INFORMACION COMERCIAL"),
          table([
            labelRow("REGIMEN ADUANERO:", regimenToName(pedimento.regimen)),
            labelRow("MARCA DEL PRODUCTO:", partida.marca ?? ""),
            labelRow("DESCRIPCION DEL PRODUCTO:", partida.descripcion),
            labelRow("FRACCIÓN ARANCELARIA:", fraccionCompleta),
            labelRow("MODELO (S):", "SIN MODELO"),
            labelRow("UNIDAD DE MEDIDA:", unidadMedida),
            labelRow("TAMAÑO DE LOTE:", cantidad),
            labelRow("NUMERO DE ETIQUETAS A INSPECCIONAR:", cantidad),
            labelRow("PRESENTACION Y CONTENIDO:", unidadMedida),
            labelRow("PAÍS DE ORIGEN:", paisToName(partida.paisOrigen)),
            labelRow("FACTURA (S):", factura),
            labelRow("No. PEDIMENTO:", pedimento.pedimentoNum),
            labelRow("CONTROL:", `PARTIDA ${partida.sec}`),
            labelRow("DOMICILIO DE LA INSPECCIÓN:", DOMICILIO_INSPECCION),
          ]),
          new Paragraph({ spacing: { before: 20 }, children: [] }),
          buildFooterTable(pedimento),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
