// One-off verification: diff the TS parser's output against the Python
// parser's ground-truth output for the same PDF (captured to
// /tmp/.../python_ground_truth.json before porting). Not a permanent test.
import { readFileSync } from "node:fs";
import { parsePedimento } from "../src/lib/parser";

const PDF_PATH = process.argv[2];
const GROUND_TRUTH_PATH = process.argv[3];

interface GroundTruthPartida {
  sec: number;
  fraccion: string;
  descripcion: string;
  cantidad: number;
  val_aduana: number;
  val_comercial: number;
  precio_unitario: number;
  tiene_incrementables: boolean;
  umc: string | null;
}

interface GroundTruth {
  pedimento_num: string;
  importador: string;
  tipo_cambio: number;
  dta: number | null;
  igi: number | null;
  prv: number | null;
  partidas: GroundTruthPartida[];
}

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures++;
    console.error(`FAIL ${label}\n  actual:   ${a}\n  expected: ${e}`);
  }
}

async function main() {
  const truth: GroundTruth = JSON.parse(readFileSync(GROUND_TRUTH_PATH, "utf-8"));
  const result = await parsePedimento(PDF_PATH);

  check("pedimentoNum", result.pedimentoNum, truth.pedimento_num);
  check(
    "importador (normalized)",
    result.importador.replace(/\s+/g, " "),
    truth.importador.replace(/\s+/g, " ")
  );
  check("tipoCambio", result.tipoCambio, truth.tipo_cambio);
  check("dta", result.dta, truth.dta);
  check("igi", result.igi, truth.igi);
  check("prv", result.prv, truth.prv);
  check("partidas.length", result.partidas.length, truth.partidas.length);

  const n = Math.min(result.partidas.length, truth.partidas.length);
  for (let idx = 0; idx < n; idx++) {
    const a = result.partidas[idx];
    const e = truth.partidas[idx];
    check(`partida[${idx}].sec`, a.sec, e.sec);
    check(`partida[${idx}].fraccion`, a.fraccion, e.fraccion);
    check(
      `partida[${idx}].descripcion (normalized)`,
      a.descripcion.replace(/\s+/g, " ").trim(),
      e.descripcion.replace(/\s+/g, " ").trim()
    );
    check(`partida[${idx}].cantidad`, a.cantidad, e.cantidad);
    check(`partida[${idx}].valAduana`, a.valAduana, e.val_aduana);
    check(`partida[${idx}].valComercial`, a.valComercial, e.val_comercial);
    check(`partida[${idx}].precioUnitario`, a.precioUnitario, e.precio_unitario);
    check(`partida[${idx}].tieneIncrementables`, a.tieneIncrementables, e.tiene_incrementables);
    check(`partida[${idx}].umc`, a.umc, e.umc);
  }

  if (failures > 0) {
    console.error(`\n${failures} field mismatch(es) out of ${n} partidas.`);
    process.exit(1);
  }
  console.log(`All fields match ground truth across ${n} partidas.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
