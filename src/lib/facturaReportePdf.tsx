import { Document, Page, View, Text, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { MonthlyReportData, ReporteCurrencyGroup, ReporteInvoiceRow } from "./facturaReporteMensual";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function money(n: number): string {
  return n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
}

// "XXX" is the literal ISO 4217 code FacturAPI stamps on complementos de
// pago (no currency involved in a payment complement) — shown under a
// friendlier label here rather than the raw code.
function currencyLabel(currency: string): string {
  return currency === "XXX" ? "Complementos de pago" : currency;
}

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 8, fontFamily: "Helvetica" },
  title: { fontSize: 12, textAlign: "center", marginBottom: 2 },
  subtitle: { fontSize: 9, textAlign: "center", marginBottom: 8, color: "#444" },
  meta: { fontSize: 8, marginBottom: 8, color: "#444" },
  currencyHeader: { fontSize: 10, fontWeight: 700, marginTop: 10, marginBottom: 4 },
  table: { display: "flex", flexDirection: "column", borderTop: "1pt solid #ccc", borderLeft: "1pt solid #ccc" },
  row: { flexDirection: "row" },
  headerRow: { flexDirection: "row", backgroundColor: "#f2f2f2" },
  cell: {
    borderRight: "1pt solid #ccc",
    borderBottom: "1pt solid #ccc",
    padding: 3,
  },
  headerCell: {
    borderRight: "1pt solid #ccc",
    borderBottom: "1pt solid #ccc",
    padding: 3,
    fontWeight: 700,
  },
  right: { textAlign: "right" },
  footer: { marginTop: 6, fontSize: 8 },
  footerLine: { marginBottom: 1 },
  noData: { textAlign: "center", marginTop: 20, color: "#666" },
});

const COLS = [
  { key: "folio", label: "Folio", width: "5%" },
  { key: "uuid", label: "UUID", width: "20%" },
  { key: "fecha", label: "Fecha", width: "8%" },
  { key: "rfc", label: "RFC", width: "8%" },
  { key: "receptor", label: "Receptor", width: "12%" },
  { key: "domicilio", label: "Domicilio", width: "15%" },
  { key: "estado", label: "Estado", width: "7%" },
  { key: "subtotal", label: "Subtotal", width: "8%" },
  { key: "impuesto", label: "Impuesto", width: "9%" },
  { key: "total", label: "Total", width: "8%" },
] as const;

function Header({ data }: { data: MonthlyReportData }) {
  return (
    <>
      <Text style={styles.title}>Reporte de emisión de comprobantes fiscales digitales</Text>
      <Text style={styles.subtitle}>{data.orgName}</Text>
      <Text style={styles.meta}>
        Mes contemplado: {MESES[data.month - 1]} {data.year}
      </Text>
    </>
  );
}

function InvoiceRow({ row }: { row: ReporteInvoiceRow }) {
  const isCancelado = row.estado === "cfdiCancelado";
  const impuestoLines: string[] = [];
  if (!isCancelado) {
    if (row.retenido > 0) impuestoLines.push(`Retenido: ${money(row.retenido)}`);
    if (row.trasladado > 0) impuestoLines.push(`Trasladado: ${money(row.trasladado)}`);
    if (row.esComplemento) impuestoLines.push("Complemento de pago");
  }
  return (
    <View style={styles.row}>
      <Text style={[styles.cell, { width: COLS[0].width }]}>{row.folio}</Text>
      <Text style={[styles.cell, { width: COLS[1].width }]}>{row.uuid}</Text>
      <Text style={[styles.cell, { width: COLS[2].width }]}>{fecha(row.fecha)}</Text>
      <Text style={[styles.cell, { width: COLS[3].width }]}>{row.rfc}</Text>
      <Text style={[styles.cell, { width: COLS[4].width }]}>{row.receptor}</Text>
      <Text style={[styles.cell, { width: COLS[5].width }]}>{row.domicilio}</Text>
      <Text style={[styles.cell, { width: COLS[6].width }]}>{row.estado}</Text>
      <Text style={[styles.cell, styles.right, { width: COLS[7].width }]}>
        {isCancelado || row.esComplemento ? "" : `$${money(row.subtotal)}`}
      </Text>
      <View style={[styles.cell, { width: COLS[8].width }]}>
        {impuestoLines.map((line) => (
          <Text key={line}>{line}</Text>
        ))}
      </View>
      <Text style={[styles.cell, styles.right, { width: COLS[9].width }]}>
        {isCancelado ? "" : `$${money(row.total)}`}
      </Text>
    </View>
  );
}

function CurrencyGroup({ group }: { group: ReporteCurrencyGroup }) {
  return (
    <View>
      <Text style={styles.currencyHeader}>{currencyLabel(group.currency)}</Text>
      <View style={styles.table}>
        <View style={styles.headerRow}>
          {COLS.map((col) => (
            <Text key={col.key} style={[styles.headerCell, { width: col.width }]}>
              {col.label}
            </Text>
          ))}
        </View>
        {group.rows.map((row) => (
          <InvoiceRow key={row.uuid || row.folio} row={row} />
        ))}
      </View>
      <View style={styles.footer} wrap={false}>
        <Text style={styles.footerLine}>Subtotal generado: ${money(group.subtotalGenerado)}</Text>
        <Text style={styles.footerLine}>Total impuesto retenido: ${money(group.totalRetenido)}</Text>
        <Text style={styles.footerLine}>Total impuesto trasladado: ${money(group.totalTrasladado)}</Text>
        <Text style={styles.footerLine}>Total generado: ${money(group.totalGenerado)}</Text>
        <Text style={styles.footerLine}>Los comprobantes cfdiCancelado no son tomados en cuenta.</Text>
        {group.firstFolio != null && group.lastFolio != null && (
          <Text style={styles.footerLine}>
            El reporte incluye comprobantes del folio {group.firstFolio} al {group.lastFolio}.
          </Text>
        )}
      </View>
    </View>
  );
}

function MonthlyReportDocument({ data }: { data: MonthlyReportData }) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Header data={data} />
        {data.groups.length === 0 && (
          <Text style={styles.noData}>No hay comprobantes emitidos en el periodo seleccionado.</Text>
        )}
        {data.groups.map((group) => (
          <CurrencyGroup key={group.currency} group={group} />
        ))}
      </Page>
    </Document>
  );
}

export function renderMonthlyReportPdf(data: MonthlyReportData): Promise<Buffer> {
  return renderToBuffer(<MonthlyReportDocument data={data} />);
}
