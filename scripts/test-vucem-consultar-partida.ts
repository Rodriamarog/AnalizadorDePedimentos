// One-off: fetches the partidas of a real pedimento from VUCEM production.
// ConsultarPartida requires a numeroOperacion, which per the manual is only
// obtained from ConsultarPedimentoCompleto's response — so this chains the
// two calls: ConsultarPedimentoCompleto(aduana, patente, pedimento) ->
// numeroOperacion, then ConsultarPartida(aduana, patente, pedimento,
// numeroOperacion, numeroPartida).
// See test-vucem-listar-pedimentos.ts for the TLS workaround rationale
// (VUCEM's production TLS only offers legacy weak DHE params).

import https from "node:https";

const HOST = "www.ventanillaunica.gob.mx";

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

async function main() {
  const rfc = process.env.VUCEM_USUARIO_RFC;
  const token = process.env.VUCEM_TOKEN_DE_ACCESO;
  if (!rfc) throw new Error("VUCEM_USUARIO_RFC not set");
  if (!token) throw new Error("VUCEM_TOKEN_DE_ACCESO not set");

  const aduana = process.argv[2] ?? "400";
  const patente = process.argv[3] ?? "3362";
  const pedimento = process.argv[4] ?? "6000515";
  const numeroPartida = process.argv[5] ?? "1";

  console.log(`--- ConsultarPedimentoCompleto (aduana=${aduana}, patente=${patente}, pedimento=${pedimento}) ---`);
  const completoEnvelope = buildPedimentoCompletoEnvelope(rfc, token, aduana, patente, pedimento);
  const completoRes = await postSoap("/ventanilla-ws-pedimentos/ConsultarPedimentoCompletoService", completoEnvelope);
  console.log(`HTTP ${completoRes.status}`);
  console.log(completoRes.text);

  if (completoRes.status !== 200) {
    console.log("\nNon-200 on ConsultarPedimentoCompleto — can't get numeroOperacion, stopping here.");
    return;
  }

  const numeroOperacionMatch = completoRes.text.match(/<ns2:numeroOperacion>([^<]*)<\/ns2:numeroOperacion>/);
  const numeroOperacion = numeroOperacionMatch ? numeroOperacionMatch[1] : null;

  if (!numeroOperacion) {
    console.log("\nNo numeroOperacion found in the response above — can't proceed to ConsultarPartida.");
    return;
  }

  console.log(`\nGot numeroOperacion=${numeroOperacion}, calling ConsultarPartida...\n`);

  console.log(`--- ConsultarPartida (numeroOperacion=${numeroOperacion}, numeroPartida=${numeroPartida}) ---`);
  const partidaEnvelope = buildPartidaEnvelope(rfc, token, aduana, patente, pedimento, numeroOperacion, numeroPartida);
  const partidaRes = await postSoap("/ventanilla-ws-pedimentos/ConsultarPartidaService", partidaEnvelope);
  console.log(`HTTP ${partidaRes.status}`);
  console.log(partidaRes.text);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
