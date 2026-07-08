// One-off: verifies we can call VUCEM's production ListarPedimentos SOAP
// service with a plain WS-Security UsernameToken (RFC + token), per
// docs/vucem-webservice/vucem017396~1.pdf — no XML-Dsig / FIEL signing needed
// for the read-only query services.
//
// Production's TLS config only offers legacy/weak DHE params, which Node's
// default OpenSSL 3.x security level (SECLEVEL=1) rejects with "dh key too
// small". We downgrade the cipher security level for this one connection to
// work around VUCEM's outdated server config — cert validation stays on.

import https from "node:https";

const HOST = "www.ventanillaunica.gob.mx";
const PATH = "/ventanilla-ws-pedimentos/ListarPedimentosService";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

type Peticion = {
  aduana?: string;
  patente?: string;
  pedimento?: string;
  eDocumentCove?: string;
  rfc?: string;
  contenedor?: string;
  guia?: string;
  fechaInicio?: string;
  fechaFin?: string;
};

function field(name: keyof Peticion, value: string | undefined) {
  return value ? `<lis:${name}>${value}</lis:${name}>` : `<lis:${name}/>`;
}

function buildEnvelope(rfc: string, token: string, p: Peticion) {
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
        ${field("aduana", p.aduana)}
        ${field("patente", p.patente)}
        ${field("pedimento", p.pedimento)}
        ${field("eDocumentCove", p.eDocumentCove)}
        ${field("rfc", p.rfc)}
        ${field("contenedor", p.contenedor)}
        ${field("guia", p.guia)}
        ${field("fechaInicio", p.fechaInicio)}
        ${field("fechaFin", p.fechaFin)}
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

async function main() {
  const rfc = process.env.VUCEM_USUARIO_RFC;
  const token = process.env.VUCEM_TOKEN_DE_ACCESO;
  if (!rfc) throw new Error("VUCEM_USUARIO_RFC not set");
  if (!token) throw new Error("VUCEM_TOKEN_DE_ACCESO not set");

  // Combinación 2: Aduana*, Pedimento* — the most direct lookup, since we
  // have the exact pedimento number off a real PDF. Combinación 1
  // (aduana+patente) and Combinación 4 (aduana+rfc) both returned
  // "No hay información" for this same pedimento.
  const aduana = process.argv[2] ?? "400";
  const pedimento = process.argv[3] ?? "6000515";

  const envelope = buildEnvelope(rfc, token, { aduana, pedimento });

  const { status, text } = await postSoap(envelope);

  console.log(`HTTP ${status}`);
  console.log(text);

  assert(status !== 0, "got an HTTP response at all");

  if (status !== 200) {
    console.log("\nNon-200 response — inspect the SOAP fault above for the real cause.");
    return;
  }

  console.log("\nGot a 200 back from ListarPedimentosService — inspect the body above for shape.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
