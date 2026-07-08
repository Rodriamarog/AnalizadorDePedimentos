// One-off: fetches every partida of a real pedimento from VUCEM production,
// then cross-checks each unique fraccion arancelaria against FacturAPI's
// tariff-fractions catalog (see src/lib/automap.ts's fetchFraccionDescription)
// to compare the pedimento's own descripcionMercancia against SAT's official
// description for that fraccion.
//
// VUCEM's ConsultarPedimentoCompleto only returns the LIST of partida numbers
// + a numeroOperacion — it does not return partida contents. Getting all
// partidas requires one ConsultarPartida call per numeroPartida. So this is
// 1 + N SOAP calls for a pedimento with N partidas, not a single call.
//
// See test-vucem-consultar-partida.ts for the TLS workaround rationale
// (VUCEM's production TLS only offers legacy weak DHE params).

import https from "node:https";
import { createFacturapiClient } from "../src/lib/facturapi";

const HOST = "www.ventanillaunica.gob.mx";
const DELAY_MS = 500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function postSoap(path: string, body: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: HOST,
        path,
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: "",
          "Content-Length": Buffer.byteLength(body),
        },
        ciphers: "DEFAULT@SECLEVEL=0",
        minVersion: "TLSv1",
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text: data }));
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function buildPedimentoCompletoEnvelope(rfc: string, token: string, aduana: string, patente: string, pedimento: string) {
  return `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
xmlns:con="http://www.ventanillaunica.gob.mx/pedimentos/ws/oxml/consultarpedimentocompleto"
xmlns:com="http://www.ventanillaunica.gob.mx/pedimentos/ws/oxml/comunes">
  <soapenv:Header>
    <wsse:Security soapenv:mustUnderstand="1" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
      <wsse:UsernameToken>
        <wsse:Username>${rfc}</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${token}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soapenv:Header>
  <soapenv:Body>
    <con:consultarPedimentoCompletoPeticion>
      <con:peticion>
        <com:aduana>${aduana}</com:aduana>
        <com:patente>${patente}</com:patente>
        <com:pedimento>${pedimento}</com:pedimento>
      </con:peticion>
    </con:consultarPedimentoCompletoPeticion>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function buildPartidaEnvelope(
  rfc: string,
  token: string,
  aduana: string,
  patente: string,
  pedimento: string,
  numeroOperacion: string,
  numeroPartida: string
) {
  return `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
xmlns:con="http://www.ventanillaunica.gob.mx/pedimentos/ws/oxml/consultarpartida"
xmlns:com="http://www.ventanillaunica.gob.mx/pedimentos/ws/oxml/comunes">
  <soapenv:Header>
    <wsse:Security soapenv:mustUnderstand="1" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
      <wsse:UsernameToken>
        <wsse:Username>${rfc}</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${token}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soapenv:Header>
  <soapenv:Body>
    <con:consultarPartidaPeticion>
      <con:peticion>
        <com:aduana>${aduana}</com:aduana>
        <com:patente>${patente}</com:patente>
        <com:pedimento>${pedimento}</com:pedimento>
        <con:numeroOperacion>${numeroOperacion}</con:numeroOperacion>
        <con:numeroPartida>${numeroPartida}</con:numeroPartida>
      </con:peticion>
    </con:consultarPartidaPeticion>
  </soapenv:Body>
</soapenv:Envelope>`;
}

async function fetchFraccionDescriptionSat(
  facturapi: ReturnType<typeof createFacturapiClient>,
  fraccion: string
): Promise<string | null> {
  const result = await facturapi.get<{ data: { key: string; description: string }[] }>(
    "catalogs/comercioexterior/2.0/tariff-fractions",
    { q: fraccion, limit: 5 }
  );
  return result.data.find((d) => d.key.startsWith(fraccion))?.description ?? null;
}

async function main() {
  const rfc = process.env.VUCEM_USUARIO_RFC;
  const token = process.env.VUCEM_TOKEN_DE_ACCESO;
  const facturapiKey = process.env.FACTURAPI_TEST_API_KEY;
  if (!rfc) throw new Error("VUCEM_USUARIO_RFC not set");
  if (!token) throw new Error("VUCEM_TOKEN_DE_ACCESO not set");
  if (!facturapiKey) throw new Error("FACTURAPI_TEST_API_KEY not set");

  const aduana = process.argv[2] ?? "400";
  const patente = process.argv[3] ?? "3362";
  const pedimento = process.argv[4] ?? "6000515";

  const facturapi = createFacturapiClient(facturapiKey);

  console.log(`--- ConsultarPedimentoCompleto (aduana=${aduana}, patente=${patente}, pedimento=${pedimento}) ---`);
  const completoEnvelope = buildPedimentoCompletoEnvelope(rfc, token, aduana, patente, pedimento);
  const completoRes = await postSoap("/ventanilla-ws-pedimentos/ConsultarPedimentoCompletoService", completoEnvelope);
  if (completoRes.status !== 200) {
    console.log(`HTTP ${completoRes.status}`);
    console.log(completoRes.text);
    throw new Error("ConsultarPedimentoCompleto failed, can't proceed");
  }

  const numeroOperacionMatch = completoRes.text.match(/<ns2:numeroOperacion>([^<]*)<\/ns2:numeroOperacion>/);
  const numeroOperacion = numeroOperacionMatch?.[1];
  if (!numeroOperacion) throw new Error("No numeroOperacion in response, can't proceed");

  const partidaNumbers = [...completoRes.text.matchAll(/<ns2:partidas>(\d+)<\/ns2:partidas>/g)].map((m) => m[1]);
  console.log(`numeroOperacion=${numeroOperacion}, partidas=[${partidaNumbers.join(", ")}]\n`);

  type PartidaInfo = { numeroPartida: string; fraccion: string; descripcion: string };
  const partidas: PartidaInfo[] = [];

  for (const numeroPartida of partidaNumbers) {
    const envelope = buildPartidaEnvelope(rfc, token, aduana, patente, pedimento, numeroOperacion, numeroPartida);
    const { status, text } = await postSoap("/ventanilla-ws-pedimentos/ConsultarPartidaService", envelope);
    if (status !== 200) {
      console.log(`partida ${numeroPartida}: HTTP ${status} (non-200), skipping`);
      await sleep(DELAY_MS);
      continue;
    }
    const fraccion = text.match(/<ns8:fraccionArancelaria>([^<]*)<\/ns8:fraccionArancelaria>/)?.[1];
    const descripcion = text.match(/<ns8:descripcionMercancia>([^<]*)<\/ns8:descripcionMercancia>/)?.[1]?.trim();
    if (fraccion && descripcion) {
      partidas.push({ numeroPartida, fraccion, descripcion });
    } else {
      console.log(`partida ${numeroPartida}: couldn't parse fraccion/descripcion, skipping`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`Fetched ${partidas.length}/${partidaNumbers.length} partidas. Checking fracciones against FacturAPI...\n`);

  const uniqueFracciones = [...new Set(partidas.map((p) => p.fraccion))];
  const satDescriptions = new Map<string, string | null>();
  for (const fraccion of uniqueFracciones) {
    satDescriptions.set(fraccion, await fetchFraccionDescriptionSat(facturapi, fraccion));
  }

  for (const p of partidas) {
    const satDesc = satDescriptions.get(p.fraccion);
    console.log(`Partida ${p.numeroPartida} — fraccion ${p.fraccion}`);
    console.log(`  pedimento: ${p.descripcion}`);
    console.log(`  SAT      : ${satDesc ?? "(no encontrada en catálogo FacturAPI)"}`);
    console.log("");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
