// Ports tests/test_parser.py's actual assertions (not just ground-truth
// diffing) to make sure the same invariants hold for the TS parser.
import { parsePedimento } from "../src/lib/parser";

const PDF_PATH = process.argv[2];

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main() {
  const r = await parsePedimento(PDF_PATH);

  assert(r.pedimentoNum.includes("6000505"), "pedimento_num includes 6000505");
  assert(r.importador.includes("CARLOS"), "importador includes CARLOS");
  assert(r.partidas.length === 56, `total partidas === 56, got ${r.partidas.length}`);

  const p1 = r.partidas[0];
  assert(p1.sec === 1, "first partida sec === 1");
  assert(p1.fraccion === "76151002", "first partida fraccion");
  assert(p1.cantidad === 2.0, "first partida cantidad");
  assert(p1.valAduana === 699, "first partida valAduana");
  assert(p1.valComercial === 694, "first partida valComercial");
  assert(p1.tieneIncrementables === true, "first partida tieneIncrementables");
  assert(Math.round(p1.precioUnitario * 10) / 10 === 349.5, "first partida precioUnitario");

  const p2 = r.partidas[1];
  assert(p2.descripcion.includes("KARAT"), "2nd partida descripcion includes KARAT");
  assert(p2.sec === 2, "2nd partida sec === 2");

  const p4 = r.partidas[3];
  assert(p4.sec === 4, "4th partida sec === 4");
  assert(p4.valAduana === 699, "4th partida valAduana (page-break case)");
  assert(p4.descripcion.includes("KARAT"), "4th partida descripcion includes KARAT");

  for (const p of r.partidas) {
    assert(
      p.tieneIncrementables === (p.valAduana !== p.valComercial),
      `partida[${p.sec}] tieneIncrementables matches valAduana !== valComercial`
    );
    const expected = Math.round((p.valAduana / p.cantidad) * 1e5) / 1e5;
    assert(
      p.precioUnitario === expected,
      `partida[${p.sec}] precioUnitario formula (got ${p.precioUnitario}, expected ${expected})`
    );
  }

  const last = r.partidas[r.partidas.length - 1];
  assert(last.sec === 56, `last partida sec === 56, got ${last.sec}`);

  console.log(`All ${r.partidas.length} assertions passed (ported from tests/test_parser.py).`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
