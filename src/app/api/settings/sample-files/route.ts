import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { sampleFiles } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";
import { sendSampleFilesNotification } from "@/lib/resend";
import { validateSampleFiles } from "@/lib/sampleFiles";

export async function GET() {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;

  const [row] = await withOrg(orgId, (tx) =>
    tx
      .select({
        lastUploadedAt: sql<string | null>`max(${sampleFiles.createdAt})`,
        totalCount: sql<number>`count(${sampleFiles.id})`.mapWith(Number),
      })
      .from(sampleFiles)
  );

  return NextResponse.json({
    lastUploadedAt: row?.lastUploadedAt ?? null,
    totalCount: row?.totalCount ?? 0,
  });
}

export async function POST(req: NextRequest) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);

  const validationError = validateSampleFiles(files);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const batchId = crypto.randomUUID();
  await withOrg(orgId, async (tx) => {
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      await tx.insert(sampleFiles).values({
        orgId,
        batchId,
        filename: file.name,
        data: buffer,
      });
    }
  });

  try {
    await sendSampleFilesNotification({ orgId, fileCount: files.length });
  } catch (err) {
    // The upload already persisted — a notification failure (e.g. Resend
    // misconfigured) shouldn't turn a successful upload into a client-facing
    // error and risk a duplicate batch on retry.
    console.error("sendSampleFilesNotification failed", err);
  }

  return NextResponse.json({ uploaded: files.length }, { status: 201 });
}
