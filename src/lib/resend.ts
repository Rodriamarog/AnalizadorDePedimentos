import { Resend } from "resend";

let client: Resend | null = null;

function getClient(): Resend {
  if (!client) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not set");
    client = new Resend(apiKey);
  }
  return client;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// FacturAPI's own /email endpoint doesn't let the sender edit the subject or
// body — only Resend does, so this replaces that call. Plain-text `body` is
// escaped and line-broken into simple HTML rather than accepting rich HTML
// input, since the compose box in the UI is a plain textarea.
export async function sendFacturaEmail(params: {
  to: string[];
  subject: string;
  body: string;
  attachments: { filename: string; content: Buffer }[];
}) {
  const from = process.env.RESEND_EMAIL;
  if (!from) throw new Error("RESEND_EMAIL is not set");

  const html = `<p>${escapeHtml(params.body).replace(/\n/g, "<br>")}</p>`;

  const { data, error } = await getClient().emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html,
    attachments: params.attachments,
  });

  if (error) throw new Error(error.message);
  return data;
}

// Notifies the team when a client submits sample pedimentos/facturas for
// custom-parser onboarding (issue #32) — there's no in-app inbox for this,
// so email is the only signal that a new batch needs attention.
export async function sendSampleFilesNotification(params: { orgId: string; fileCount: number }) {
  const from = process.env.RESEND_EMAIL;
  if (!from) throw new Error("RESEND_EMAIL is not set");
  const to = process.env.TEAM_NOTIFICATION_EMAIL;
  if (!to) throw new Error("TEAM_NOTIFICATION_EMAIL is not set");

  const { data, error } = await getClient().emails.send({
    from,
    to: [to],
    subject: "Nuevos archivos de muestra para personalización",
    html: `<p>La organización <strong>${escapeHtml(params.orgId)}</strong> subió ${params.fileCount} archivo(s) de muestra (pedimentos/facturas) para la personalización del parser.</p>`,
  });

  if (error) throw new Error(error.message);
  return data;
}
