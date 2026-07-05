import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { parsePedimento } from "@/lib/parser";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const DEMO_COOKIE = "nc_demo_scan";
const RATE_LIMIT_MS = 24 * 60 * 60 * 1000;
const MAX_PREVIEW_PARTIDAS = 8;

// Landing-page-only, unauthenticated preview: no orgId, nothing is
// persisted. Rate limited per browser (cookie) and per IP (in-memory —
// good enough for the single-instance deploy this app actually runs on;
// resets on restart, which is an acceptable tradeoff for a free demo).
const lastScanByIp = new Map<string, number>();

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(req: NextRequest) {
  const now = Date.now();
  const ip = clientIp(req);
  const cookieStamp = req.cookies.get(DEMO_COOKIE)?.value;
  const cookieUsedAt = cookieStamp ? Number(cookieStamp) : NaN;
  const ipUsedAt = lastScanByIp.get(ip);

  const blockedUntil = Math.max(
    Number.isFinite(cookieUsedAt) ? cookieUsedAt + RATE_LIMIT_MS : 0,
    ipUsedAt ? ipUsedAt + RATE_LIMIT_MS : 0
  );
  if (blockedUntil > now) {
    return NextResponse.json(
      {
        error:
          "Ya usaste tu escaneo gratis de hoy. Vuelve mañana o crea una cuenta para escanear sin límite.",
      },
      { status: 429 }
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No se recibió ningún archivo" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Solo se aceptan archivos PDF" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "El archivo excede el tamaño máximo permitido (20 MB)" },
      { status: 413 }
    );
  }

  const dir = await mkdtemp(join(tmpdir(), "pedimento-demo-"));
  const pdfPath = join(dir, `${randomUUID()}.pdf`);
  try {
    await writeFile(pdfPath, Buffer.from(await file.arrayBuffer()));

    let result;
    try {
      result = await parsePedimento(pdfPath);
    } catch (e) {
      return NextResponse.json(
        { error: `No se pudo leer el pedimento: ${e instanceof Error ? e.message : e}` },
        { status: 422 }
      );
    }

    lastScanByIp.set(ip, now);
    const res = NextResponse.json({
      pedimentoNum: result.pedimentoNum,
      importador: result.importador,
      totalPartidas: result.partidas.length,
      partidas: result.partidas.slice(0, MAX_PREVIEW_PARTIDAS).map((p) => ({
        sec: p.sec,
        fraccion: p.fraccion,
        descripcion: p.descripcion,
        cantidad: p.cantidad,
        valAduana: p.valAduana,
      })),
    });
    res.cookies.set(DEMO_COOKIE, String(now), {
      httpOnly: true,
      sameSite: "lax",
      maxAge: RATE_LIMIT_MS / 1000,
      path: "/",
    });
    return res;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
