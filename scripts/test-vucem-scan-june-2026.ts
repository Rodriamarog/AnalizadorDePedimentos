// One-off: scans every day of June 2026 against VUCEM's production
// ListarPedimentos service using Combinación 4 (Aduana*, RFC*, Fecha
// Inicial*, Fecha Final*), one day per call since the manual caps date
// ranges to 1 day. 1000ms delay between calls to avoid hammering the
// service. See test-vucem-listar-pedimentos.ts for the TLS workaround
// rationale (VUCEM's production TLS only offers legacy weak DHE params).

import https from "node:https";

const HOST = "www.ventanillaunica.gob.mx";
const PATH = "/ventanilla-ws-pedimentos/ListarPedimentosService";
const DELAY_MS = 1000;

function buildEnvelope(rfc: string, token: string, aduana: string, queryRfc: string, fecha: string) {
  return `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
xmlns:lis="http://www.ventanillaunica.gob.mx/pedimentos/ws/oxml/listarpedimentos">
  <soapenv:Header>
    <wsse:Security soapenv:mustUnderstand="1" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
      <wsse:UsernameToken>
        <wsse:Username>${rfc}</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${token}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soapenv:Header>
  <soapenv:Body>
    <lis:consultarPedimentosPeticion>
      <lis:peticion>
        <lis:aduana>${aduana}</lis:aduana>
        <lis:patente/>
        <lis:pedimento/>
        <lis:eDocumentCove/>
        <lis:rfc>${queryRfc}</lis:rfc>
        <lis:contenedor/>
        <lis:guia/>
        <lis:fechaInicio>${fecha}</lis:fechaInicio>
        <lis:fechaFin>${fecha}</lis:fechaFin>
      </lis:peticion>
    </lis:consultarPedimentosPeticion>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function postSoap(body: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: HOST,
        path: PATH,
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function daysInJune2026(): string[] {
  const days: string[] = [];
  for (let d = 1; d <= 30; d++) {
    days.push(`2026-06-${String(d).padStart(2, "0")}`);
  }
  return days;
}

async function main() {
  const rfc = process.env.VUCEM_USUARIO_RFC;
  const token = process.env.VUCEM_TOKEN_DE_ACCESO;
  if (!rfc) throw new Error("VUCEM_USUARIO_RFC not set");
  if (!token) throw new Error("VUCEM_TOKEN_DE_ACCESO not set");

  const aduana = process.argv[2] ?? "400";
  const queryRfc = process.argv[3] ?? rfc;

  for (const fecha of daysInJune2026()) {
    const envelope = buildEnvelope(rfc, token, aduana, queryRfc, fecha);
    try {
      const { status, text } = await postSoap(envelope);
      const tieneError = /<ns3:tieneError>true<\/ns3:tieneError>/.test(text);
      const mensajeMatch = text.match(/<ns3:mensaje>([^<]*)<\/ns3:mensaje>/);
      const mensaje = mensajeMatch ? mensajeMatch[1] : null;

      if (status !== 200) {
        console.log(`${fecha}: HTTP ${status} (non-200)`);
      } else if (tieneError) {
        console.log(`${fecha}: error — ${mensaje}`);
      } else {
        console.log(`${fecha}: OK, no error flag — inspecting body:`);
        console.log(text);
      }
    } catch (err) {
      console.log(`${fecha}: request failed — ${(err as Error).message}`);
    }

    await sleep(DELAY_MS);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
