import type { TranslationDictionary } from "@/lib/v1/translateOpenApiDocument";

const GUIDES_MARKDOWN_ES = `
## Configuración de autenticación

Toda solicitud a \`/api/v1\` necesita \`Authorization: Bearer <key>\`. Las keys
son de autoservicio — emite una desde Configuración en el dashboard — y
tienen el formato \`pdm_<mode>_<hex>\`. Una key solo se muestra una vez, al
momento de emitirla — guárdala de inmediato.

Hay un límite fijo de 60 solicitudes por minuto por organización, sin importar
el plan o el modo de la key; una solicitud que exceda el límite recibe
\`429 rate_limit_exceeded\`.

## Modo sandbox

El segmento \`<mode>\` de una key es \`test\` o \`live\`, y refleja el modo de la
key de FacturAPI detrás de tu organización. Las keys en modo \`test\` usan el
sandbox de FacturAPI — las facturas creadas con una nunca se envían al SAT y
no tienen costo, así que construye y verifica tu integración ahí antes de
cambiar a una key \`live\`.

## Flujos comunes

**Subir un pedimento y luego consultar el resultado**

1. \`POST /pedimentos\` con el PDF o Archivo M como \`multipart/form-data\` —
   devuelve \`202\` con un \`job_id\` de inmediato; el análisis ocurre de forma
   asíncrona.
2. \`GET /jobs/{job_id}\` hasta que \`status\` sea \`done\` o \`failed\`. Cuando es
   \`done\`, la respuesta incluye \`pedimento_id\`.
3. \`GET /pedimentos/{pedimento_id}\` para obtener el registro completo.

**Crear un cliente y luego emitir y timbrar una factura**

1. \`POST /clientes\` con \`legal_name\`, \`tax_id\`, \`tax_system\`, y opcionalmente
   \`zip\`/\`email\`/\`emails\` — devuelve el \`id\` del cliente (el id de cliente
   crudo de FacturAPI, sin prefijo).
2. \`POST /facturas\` con un header \`Idempotency-Key\` y un body cuyo \`customer\`
   sea ese mismo id — crea una factura en borrador.
3. \`POST /facturas/{id}/stamp\`, también con un header \`Idempotency-Key\` —
   esta es la única llamada que realmente llega al SAT, así que la key
   importa: una solicitud reintentada con la misma key nunca timbra dos
   veces.

**Crear una factura con Carta Porte**

Agrega una entrada de \`complements\` con \`type: "carta_porte"\` al mismo body
de \`POST /facturas\` de arriba. En lugar de repetir tus datos de flota en
línea, referéncialos con \`vehiculo_id\`/\`chofer_id\`/\`direccion_id\` (los ids
con prefijo \`veh_\`/\`chf_\`/\`dir_\` de \`GET /vehiculos\`, \`/choferes\`,
\`/direcciones\`) en los nodos correspondientes — se resuelven a los campos
completos del SAT en el servidor antes de crear la factura.

**Crear una factura de Traslado (type \`T\`)**

\`type: "T"\` es una factura de movimiento de mercancías, no una venta — no
lleva \`customer\`, ni \`payment_form\`/\`payment_method\`, ni \`price\`/\`taxes\` en
los conceptos (solo \`description\`/\`product_key\`/\`unit_key\`). Es una forma de
solicitud de FacturAPI distinta, no una variante del body I/E/N/P de arriba;
el endpoint valida \`type\` pero por lo demás pasa el body tal cual, así que
una solicitud de Traslado malformada muestra el error que devuelva FacturAPI.
Una factura de Traslado casi siempre necesita un complemento de Carta Porte
(ver arriba) para describir el movimiento.
`.trim();

// English string → Spanish string, covering every distinct `summary`/
// `description` value produced by generateOpenApiDocument() (see
// src/lib/v1/openapi.ts and the ~15 route files under src/app/api/v1/**).
// translateDocument() throws in dev if a generated string has no entry
// here, so a new endpoint can't silently ship English under the Spanish
// doc — add its strings to this dictionary when that happens.
export const openapiTranslationsEs: TranslationDictionary = {
  "Public API for Pedimentos — SAT catalog search and, later, factura issuance.":
    "API pública de Pedimentos — búsqueda en catálogos del SAT y, más adelante, emisión de facturas.",
  [`## Auth setup

Every \`/api/v1\` request needs \`Authorization: Bearer <key>\`. Keys are
self-serve — issue one from Configuración in the dashboard — and are shaped
\`pdm_<mode>_<hex>\`. A key is only ever shown once, at issuance time —
store it immediately.

There's a flat rate limit of 60 requests/minute per org, regardless of plan
or key mode; a request over the limit gets back \`429 rate_limit_exceeded\`.

## Sandbox mode

A key's \`<mode>\` segment is either \`test\` or \`live\`, mirroring the mode of
the FacturAPI key behind your org. \`test\`-mode keys hit FacturAPI's sandbox —
facturas created with one are never sent to the SAT and cost nothing, so
build and verify your integration there before switching to a \`live\` key.

## Common workflows

**Upload a pedimento, then poll for the result**

1. \`POST /pedimentos\` with the PDF or Archivo M as \`multipart/form-data\` —
   returns \`202\` with a \`job_id\` immediately; parsing happens async.
2. \`GET /jobs/{job_id}\` until \`status\` is \`done\` or \`failed\`. On \`done\`, the
   response includes \`pedimento_id\`.
3. \`GET /pedimentos/{pedimento_id}\` for the full parsed record.

**Create a cliente, then issue and stamp a factura**

1. \`POST /clientes\` with \`legal_name\`, \`tax_id\`, \`tax_system\`, and
   optionally \`zip\`/\`email\`/\`emails\` — returns the cliente's \`id\` (FacturAPI's
   raw customer id, unprefixed).
2. \`POST /facturas\` with an \`Idempotency-Key\` header and a body whose
   \`customer\` is that same id — creates a draft invoice.
3. \`POST /facturas/{id}/stamp\`, also with an \`Idempotency-Key\` header — this
   is the one call that actually hits the SAT, so the key matters: a retried
   request with the same key never double-stamps.

**Create a factura with Carta Porte**

Add a \`complements\` entry of \`type: "carta_porte"\` to the same
\`POST /facturas\` body above. Reference your saved fleet data instead of
repeating it inline by setting \`vehiculo_id\`/\`chofer_id\`/\`direccion_id\`
(the \`veh_\`/\`chf_\`/\`dir_\`-prefixed ids from \`GET /vehiculos\`, \`/choferes\`,
\`/direcciones\`) on the relevant nodes — they're resolved into the full SAT
fields server-side before the invoice is created.

**Create a Traslado (type \`T\`) factura**

\`type: "T"\` is a goods-movement invoice, not a sale — it carries no
\`customer\`, no \`payment_form\`/\`payment_method\`, and no \`price\`/\`taxes\` on
line items (just \`description\`/\`product_key\`/\`unit_key\`). It's a distinct
FacturAPI request shape, not a variant of the I/E/N/P body above; the
endpoint validates \`type\` but otherwise passes the body straight through,
so a malformed Traslado request surfaces whatever error FacturAPI itself
returns. A Traslado invoice almost always needs a Carta Porte complement
(see above) to describe the movement.`]: GUIDES_MARKDOWN_ES,
  "Upload and retrieve parsed pedimentos.": "Sube y consulta pedimentos analizados.",
  "Poll async pedimento upload jobs.": "Consulta el estado de los jobs asíncronos de carga de pedimentos.",
  "Create, retrieve, cancel, stamp, and download facturas (CFDI), including Carta Porte.":
    "Crea, consulta, cancela, timbra y descarga facturas (CFDI), incluyendo Carta Porte.",
  "Curated CRUD over FacturAPI customers.": "CRUD depurado sobre los clientes de FacturAPI.",
  "Fracción → ClaveProdServ mappings.": "Mapeos de Fracción → ClaveProdServ.",
  "The org's fleet, for Carta Porte's Autotransporte.":
    "La flota de la organización, para el Autotransporte de Carta Porte.",
  "The org's drivers, for Carta Porte's FiguraTransporte.":
    "Los choferes de la organización, para la FiguraTransporte de Carta Porte.",
  "Saved Origen/Destino addresses, for Carta Porte's Ubicaciones.":
    "Direcciones guardadas de Origen/Destino, para las Ubicaciones de Carta Porte.",
  "SAT catalog search (unidades de medida, claves de producto/servicio).":
    "Búsqueda en catálogos del SAT (unidades de medida, claves de producto/servicio).",
  "A key issued via scripts/issue-api-key.ts, e.g. `Authorization: Bearer <key>`.":
    "Una key emitida vía scripts/issue-api-key.ts, ej. `Authorization: Bearer <key>`.",
  "The standard /api/v1 error envelope.": "El envoltorio de error estándar de /api/v1.",
  "Search SAT unidades de medida (c_UnidadMedida)": "Busca unidades de medida del SAT (c_UnidadMedida)",
  "Free-text or key-prefix search term.": "Término de búsqueda libre o por prefijo de clave.",
  "Matching unidades, best match first.": "Unidades coincidentes, la mejor coincidencia primero.",
  "Missing or invalid API key.": "Falta la API key o es inválida.",
  "Search SAT claves de producto/servicio (c_ClaveProdServ)":
    "Busca claves de producto/servicio del SAT (c_ClaveProdServ)",
  "Matching claves, best match first.": "Claves coincidentes, la mejor coincidencia primero.",
  "Upload a pedimento (PDF or Archivo M) for async parsing":
    "Sube un pedimento (PDF o Archivo M) para análisis asíncrono",
  "PDF or Archivo M file.": "Archivo PDF o Archivo M.",
  "When true, unmapped fracciones are classified via the Gemini automap pipeline and persisted to productos before the job is marked done. Costs real Gemini $ per call and can take up to ~2 minutes for a batch, so it defaults to false.":
    "Cuando es true, las fracciones sin mapeo se clasifican mediante el pipeline de automapeo de Gemini y se guardan en productos antes de marcar el job como terminado. Tiene costo real en $ de Gemini por llamada y puede tardar hasta ~2 minutos por lote, por lo que su valor por defecto es false.",
  "Upload accepted; poll GET /jobs/{job_id} for the result.":
    "Carga aceptada; consulta GET /jobs/{job_id} para el resultado.",
  "Invalid request parameters.": "Parámetros de la solicitud inválidos.",
  "File exceeds the 20MB upload limit.": "El archivo excede el límite de carga de 20MB.",
  "Retrieve a parsed pedimento, full field parity with the internal record":
    "Consulta un pedimento analizado, con paridad total de campos con el registro interno",
  "The pedimento and its partidas.": "El pedimento y sus partidas.",
  "No pedimento with that id for this org.": "No existe un pedimento con ese id para esta organización.",
  "Poll a pedimento upload job's status": "Consulta el estado de un job de carga de pedimento",
  "The job's current status.": "El estado actual del job.",
  "No job with that id for this org.": "No existe un job con ese id para esta organización.",
  "List facturas (I/E/N/P/T), most recent first": "Lista facturas (I/E/N/P/T), más recientes primero",
  "A page of facturas.": "Una página de facturas.",
  "Create a factura (I/E/N/P/T) via raw FacturAPI pass-through":
    "Crea una factura (I/E/N/P/T) mediante paso directo a FacturAPI",
  "The created invoice, raw FacturAPI shape.": "La factura creada, en el formato crudo de FacturAPI.",
  "Idempotency-Key reused with a different request body.":
    "Se reutilizó el Idempotency-Key con un body de solicitud distinto.",
  "Retrieve a factura by its FacturAPI invoice id": "Consulta una factura por su id de invoice de FacturAPI",
  "The full raw FacturAPI invoice object.": "El objeto completo y crudo del invoice de FacturAPI.",
  "Cancel a factura": "Cancela una factura",
  "SAT cancellation motive code, defaults to 02.": "Código de motivo de cancelación del SAT, por defecto 02.",
  "Replacement invoice UUID, required for motive 01.":
    "UUID de la factura de reemplazo, requerido para el motivo 01.",
  "The cancelled invoice, raw FacturAPI shape.": "La factura cancelada, en el formato crudo de FacturAPI.",
  "Stamp a draft factura with the SAT": "Timbra una factura en borrador ante el SAT",
  "The stamped invoice, raw FacturAPI shape.": "La factura timbrada, en el formato crudo de FacturAPI.",
  "Idempotency-Key header is required.": "El header Idempotency-Key es requerido.",
  "Download a stamped factura's PDF": "Descarga el PDF de una factura timbrada",
  "The invoice PDF.": "El PDF de la factura.",
  "Download a stamped factura's XML (CFDI)": "Descarga el XML (CFDI) de una factura timbrada",
  "The invoice XML.": "El XML de la factura.",
  "Generate a draft Carta Porte factura from reference ids or inline party/goods data":
    "Genera una factura de Carta Porte en borrador a partir de ids de referencia o datos de partes/mercancías en línea",
  "Builds a Complemento Carta Porte and a draft (unstamped) Traslado factura from cliente/direcciones/vehículo/chofer (each of which may be an existing `*_id` reference or fully inline data) plus mercancía data, which is either `pedimento_id` (reusing the pedimento's partidas the same way the internal UI's Mercancias prefill does) or inline `mercancias[]` for shipments with no pedimento at all — the two are mutually exclusive. The org's productos mapping (or, with `auto_classify: true`, the Gemini automap pipeline) resolves BienesTransp/product_key. Does not stamp — use POST /facturas/{id}/stamp afterward.":
    "Construye un Complemento Carta Porte y una factura de Traslado en borrador (sin timbrar) a partir de cliente/direcciones/vehículo/chofer (cada uno puede ser una referencia `*_id` existente o datos completos en línea), más los datos de mercancía, que son `pedimento_id` (reutilizando las partidas del pedimento igual que el prellenado de Mercancías de la UI interna) o `mercancias[]` en línea para envíos sin pedimento — ambas opciones son mutuamente excluyentes. El mapeo de productos de la organización (o, con `auto_classify: true`, el pipeline de automapeo de Gemini) resuelve BienesTransp/product_key. No timbra — usa POST /facturas/{id}/stamp después.",
  'SAT c_ClaveUnidad key, e.g. "H87". Defaults to "H87" when omitted.':
    'Clave c_ClaveUnidad del SAT, ej. "H87". Por defecto "H87" si se omite.',
  "Fracción arancelaria, if the caller has it — used to look up (or auto_classify) the org's productos mapping.":
    "Fracción arancelaria, si quien llama la tiene — se usa para buscar (o auto-clasificar) el mapeo de productos de la organización.",
  "SAT c_ClaveProdServ key. Also reused as BienesTransp unless bienes_transp is given.":
    "Clave c_ClaveProdServ del SAT. También se reutiliza como BienesTransp a menos que se indique bienes_transp.",
  "SAT c_BienesTransp key, if it differs from clave_prod_serv.":
    "Clave c_BienesTransp del SAT, si difiere de clave_prod_serv.",
  "Inline mercancía data, mutually exclusive with pedimento_id (#64).":
    "Datos de mercancía en línea, mutuamente excluyentes con pedimento_id (#64).",
  "When true, inline mercancías (mercancias[]) missing a resolvable clave_prod_serv are classified via the Gemini automap pipeline and persisted to productos when keyed by fraccion. Costs real Gemini $ per call, so it defaults to false. Only applies to the inline mercancías path.":
    "Cuando es true, las mercancías en línea (mercancias[]) sin un clave_prod_serv resoluble se clasifican mediante el pipeline de automapeo de Gemini y se guardan en productos cuando están indexadas por fraccion. Tiene costo real en $ de Gemini por llamada, por lo que su valor por defecto es false. Solo aplica a la ruta de mercancías en línea.",
  'SAT c_FiguraTransporte key, e.g. "01" (Operador).':
    'Clave c_FiguraTransporte del SAT, ej. "01" (Operador).',
  "AAAA-MM-DDThh:mm:ss, the Origen ubicación's departure time.":
    "AAAA-MM-DDThh:mm:ss, la hora de salida de la ubicación de Origen.",
  "AAAA-MM-DDThh:mm:ss, the Destino ubicación's arrival time.":
    "AAAA-MM-DDThh:mm:ss, la hora de llegada de la ubicación de Destino.",
  "The created draft invoice, raw FacturAPI shape, with its Carta Porte complement attached.":
    "La factura en borrador creada, en el formato crudo de FacturAPI, con su complemento de Carta Porte adjunto.",
  "List the org's vehículos (fleet, for Carta Porte)": "Lista los vehículos de la organización (flota, para Carta Porte)",
  "The org's vehículos.": "Los vehículos de la organización.",
  "Create a vehículo": "Crea un vehículo",
  "Only `placa` is required to create a standalone vehículo record. `config_vehicular`, `permiso_sct`, `numero_permiso`, `peso_bruto_vehicular`, and `anio_modelo_vehiculo` are optional here but are SAT-required for the Complemento Carta Porte — a vehículo missing them will be rejected by POST /cartas-porte with an invalid_parameter error naming the missing field(s), not at creation time.":
    "Solo se requiere `placa` para crear un registro de vehículo independiente. `config_vehicular`, `permiso_sct`, `numero_permiso`, `peso_bruto_vehicular` y `anio_modelo_vehiculo` son opcionales aquí, pero son requeridos por el SAT para el Complemento Carta Porte — un vehículo al que le falten será rechazado por POST /cartas-porte con un error invalid_parameter que nombra los campos faltantes, no al momento de la creación.",
  "The created vehículo.": "El vehículo creado.",
  "Retrieve a vehículo": "Consulta un vehículo",
  "The vehículo.": "El vehículo.",
  "No vehículo with that id for this org.": "No existe un vehículo con ese id para esta organización.",
  "Update a vehículo": "Actualiza un vehículo",
  "The updated vehículo.": "El vehículo actualizado.",
  "Deactivate a vehículo (soft-delete)": "Desactiva un vehículo (borrado suave)",
  "The deactivated vehículo (active: false).": "El vehículo desactivado (active: false).",
  "List the org's choferes (drivers, for Carta Porte)": "Lista los choferes de la organización (para Carta Porte)",
  "The org's choferes.": "Los choferes de la organización.",
  "Create a chofer": "Crea un chofer",
  "The created chofer.": "El chofer creado.",
  "Retrieve a chofer": "Consulta un chofer",
  "The chofer.": "El chofer.",
  "No chofer with that id for this org.": "No existe un chofer con ese id para esta organización.",
  "Update a chofer": "Actualiza un chofer",
  "The updated chofer.": "El chofer actualizado.",
  "Deactivate a chofer (soft-delete)": "Desactiva un chofer (borrado suave)",
  "The deactivated chofer (active: false).": "El chofer desactivado (active: false).",
  "List the org's direcciones (Origen/Destino addresses, for Carta Porte)":
    "Lista las direcciones de la organización (Origen/Destino, para Carta Porte)",
  "The org's direcciones.": "Las direcciones de la organización.",
  "Create a dirección": "Crea una dirección",
  "The created dirección.": "La dirección creada.",
  "Retrieve a dirección": "Consulta una dirección",
  "The dirección.": "La dirección.",
  "No dirección with that id for this org.": "No existe una dirección con ese id para esta organización.",
  "Update a dirección": "Actualiza una dirección",
  "The updated dirección.": "La dirección actualizada.",
  "Deactivate a dirección (soft-delete)": "Desactiva una dirección (borrado suave)",
  "The deactivated dirección (active: false).": "La dirección desactivada (active: false).",
  "List the org's clientes (FacturAPI customers, curated shape)":
    "Lista los clientes de la organización (clientes de FacturAPI, formato depurado)",
  "A page of clientes.": "Una página de clientes.",
  "Create a cliente": "Crea un cliente",
  "The created cliente.": "El cliente creado.",
  "Retrieve a cliente": "Consulta un cliente",
  "The cliente.": "El cliente.",
  "No cliente with that id for this org.": "No existe un cliente con ese id para esta organización.",
  "Update a cliente": "Actualiza un cliente",
  "The updated cliente.": "El cliente actualizado.",
  "Delete a cliente": "Elimina un cliente",
  "The cliente was deleted.": "El cliente fue eliminado.",
  "List the org's productos (fracción → ClaveProdServ mappings)":
    "Lista los productos de la organización (mapeos fracción → ClaveProdServ)",
  "The org's productos.": "Los productos de la organización.",
  "Create a producto": "Crea un producto",
  "The created producto.": "El producto creado.",
  "A producto with that fracción already exists for this org.":
    "Ya existe un producto con esa fracción para esta organización.",
  "Retrieve a producto": "Consulta un producto",
  "The producto.": "El producto.",
  "No producto with that id for this org.": "No existe un producto con ese id para esta organización.",
  "Update a producto": "Actualiza un producto",
  "The updated producto.": "El producto actualizado.",
  "Delete a producto": "Elimina un producto",
  "The producto was deleted.": "El producto fue eliminado.",
};
