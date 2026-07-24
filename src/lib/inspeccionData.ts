import { eq } from "drizzle-orm";
import { pedimentos, partidas } from "./db/schema";
import type { OrgTx } from "./db/withOrg";
import { buildInspeccionDocx } from "./inspeccionDocx";
import { getSatUnidadDescription } from "./satSearch";
import { umcToUnitKey } from "./umc";

type Pedimento = typeof pedimentos.$inferSelect;
type Partida = typeof partidas.$inferSelect;

export async function loadPedimentoConNom(
  tx: OrgTx,
  id: string
): Promise<{ pedimento: Pedimento; partidas: Partida[] } | null> {
  const [pedimento] = await tx.select().from(pedimentos).where(eq(pedimentos.id, id)).limit(1);
  if (!pedimento) return null;
  const rows = await tx.select().from(partidas).where(eq(partidas.pedimentoId, id));
  return { pedimento, partidas: rows.filter((p) => p.nomClave) };
}

// Unit descriptions repeat across partidas of the same UMC far more often
// than they differ, so this cache avoids one sat_unidades lookup per partida.
const unitDescCache = new Map<string, string>();
async function unitDescriptionFor(umc: string | null): Promise<string> {
  const unitKey = umcToUnitKey(umc);
  if (!unitDescCache.has(unitKey)) {
    unitDescCache.set(unitKey, (await getSatUnidadDescription(unitKey)) ?? unitKey);
  }
  return unitDescCache.get(unitKey)!;
}

export function inspeccionFilename(partida: Partida): string {
  return `PARTIDA ${partida.sec}.docx`;
}

export async function buildInspeccionDocxFor(
  pedimento: Pedimento,
  partida: Partida,
  facturaOverride?: string | null
): Promise<Buffer> {
  return buildInspeccionDocx(pedimento, partida, {
    unidadMedida: await unitDescriptionFor(partida.umc),
    facturaOverride,
  });
}
