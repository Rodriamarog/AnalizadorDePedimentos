import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { getOrgFacturapiClient } from "@/lib/orgFacturapi";
import { FacturapiError } from "@/lib/facturapi";
import { sendFacturaEmail } from "@/lib/resend";

// Sends the factura's PDF + XML via Resend instead of FacturAPI's built-in
// /email endpoint, since that endpoint gives no way to edit the subject or
// body — see factura-form.tsx / facturas page for the compose UI.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const client = await getOrgFacturapiClient(orgId);
  if (client instanceof NextResponse) return client;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const to: string[] = Array.isArray(body.to)
    ? body.to.filter((v: unknown) => typeof v === "string" && v.trim())
    : typeof body.to === "string" && body.to.trim()
      ? [body.to.trim()]
      : [];
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const message = typeof body.message === "string" ? body.message : "";

  if (to.length === 0 || !subject) {
    return NextResponse.json({ error: "Faltan destinatarios o asunto" }, { status: 400 });
  }

  try {
    const [pdfRes, xmlRes] = await Promise.all([
      client.raw("GET", `invoices/${id}/pdf`),
      client.raw("GET", `invoices/${id}/xml`),
    ]);
    const [pdfBuf, xmlBuf] = await Promise.all([pdfRes.arrayBuffer(), xmlRes.arrayBuffer()]);

    await sendFacturaEmail({
      to,
      subject,
      body: message,
      attachments: [
        { filename: `${id}.pdf`, content: Buffer.from(pdfBuf) },
        { filename: `${id}.xml`, content: Buffer.from(xmlBuf) },
      ],
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof FacturapiError) {
      return NextResponse.json({ error: "No se pudieron obtener el PDF/XML de la factura" }, { status: e.status });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo enviar el correo" },
      { status: 500 }
    );
  }
}
