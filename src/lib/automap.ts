import {
  GoogleGenAI,
  Type,
  FunctionCallingConfigMode,
  ThinkingLevel,
  type Content,
  type GenerateContentConfig,
  type GenerateContentResponseUsageMetadata,
} from "@google/genai";
import { chapterHint } from "./hsChapters";
import { searchSatCatalogForAutomap, type SatCatalogResult } from "./satSearch";
import type { FacturapiClient } from "./facturapi";

// gemini-3.1-flash-lite pricing as of mid-2026 — see
// https://ai.google.dev/gemini-api/docs/pricing. Tool-use tokens are context
// fed back into the model (same as a regular prompt), so they're billed at
// the input rate; thinking tokens are billed at the output rate alongside
// the visible answer.
const GEMINI_INPUT_PRICE_PER_M_TOKENS = 0.25;
const GEMINI_OUTPUT_PRICE_PER_M_TOKENS = 1.5;

export interface AutomapUsage {
  calls: number;
  promptTokens: number;
  candidatesTokens: number;
  thoughtsTokens: number;
  toolUseTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

function newUsage(): AutomapUsage {
  return {
    calls: 0,
    promptTokens: 0,
    candidatesTokens: 0,
    thoughtsTokens: 0,
    toolUseTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
  };
}

function addUsage(acc: AutomapUsage, meta: GenerateContentResponseUsageMetadata | undefined) {
  if (!meta) return;
  const promptTokens = meta.promptTokenCount ?? 0;
  const candidatesTokens = meta.candidatesTokenCount ?? 0;
  const thoughtsTokens = meta.thoughtsTokenCount ?? 0;
  const toolUseTokens = meta.toolUsePromptTokenCount ?? 0;

  acc.calls += 1;
  acc.promptTokens += promptTokens;
  acc.candidatesTokens += candidatesTokens;
  acc.thoughtsTokens += thoughtsTokens;
  acc.toolUseTokens += toolUseTokens;
  acc.totalTokens += meta.totalTokenCount ?? 0;

  const inputTokens = promptTokens + toolUseTokens;
  const outputTokens = candidatesTokens + thoughtsTokens;
  acc.estimatedCostUsd +=
    (inputTokens / 1_000_000) * GEMINI_INPUT_PRICE_PER_M_TOKENS +
    (outputTokens / 1_000_000) * GEMINI_OUTPUT_PRICE_PER_M_TOKENS;
}

function logTrace(label: string, ...args: unknown[]) {
  console.log(`[automap:${label}]`, ...args);
}

export interface AutomapPartida {
  fraccion: string;
  descripcion: string;
}

export interface AutomapClassification {
  fraccion: string;
  key: string | null;
  description: string | null;
  confidence: "high" | "medium" | "low";
}

interface RawItem {
  fraccion?: string;
  id?: string;
  key?: string | null;
  description?: string | null;
  confidence?: string | null;
}

const COMBINED_TOOL = {
  functionDeclarations: [
    {
      name: "search_sat_catalog",
      description:
        "Busca c_ClaveProdServ en el catálogo oficial SAT. Devuelve hasta 25 resultados ordenados por relevancia.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description:
              "Término de búsqueda en español formal, ej: 'pitillo', 'funda aislante vaso', 'contenedor polipropileno'",
          },
        },
        required: ["query"],
      },
    },
  ],
};

async function runTool(name: string, query: string) {
  if (name === "search_sat_catalog") return searchSatCatalogForAutomap(query);
  return [];
}

// Gemini calls occasionally fail with transient 429/5xx — without this the
// whole batch (potentially dozens of partidas) dies on one blip.
function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /429|500|502|503|504|RESOURCE_EXHAUSTED|UNAVAILABLE|INTERNAL/i.test(msg);
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1 || !isRetryableError(err)) throw err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw lastErr;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// c_FraccionArancelaria's own SAT description — a much cleaner search seed
// than the pedimento's raw parsed text, which is often abbreviated or in
// importer-specific jargon. Not a fraccion -> c_ClaveProdServ crosswalk
// (SAT doesn't publish one); this just tells us what the tariff heading
// itself officially means.
//
// FacturAPI's catalog keys are 10 digits (8-digit fraccion + 2-digit NICO
// suffix); VUCEM only ever gives us the bare 8-digit fraccion, so match by
// prefix rather than exact key equality.
async function fetchFraccionDescription(facturapi: FacturapiClient, fraccion: string): Promise<string | null> {
  try {
    const result = await facturapi.get<{ data: { key: string; description: string }[] }>(
      "catalogs/comercioexterior/2.0/tariff-fractions",
      { q: fraccion, limit: 5 }
    );
    return result.data.find((d) => d.key.startsWith(fraccion))?.description ?? null;
  } catch {
    return null;
  }
}

async function runLoop(
  client: GoogleGenAI,
  messages: Content[],
  system: string,
  nItems: number,
  trace: string,
  usage: AutomapUsage,
  seenKeys: Set<string>,
  idField: "fraccion" | "id" = "fraccion"
): Promise<RawItem[] | null> {
  const config: GenerateContentConfig = {
    systemInstruction: system,
    tools: [COMBINED_TOOL],
    temperature: 0,
    // gemini-3.1-flash-lite is a Gemini 3.x model — thinkingBudget is a
    // legacy Gemini-2.5-era knob that this model treats as a soft hint at
    // best (observed runs blew past an 8192 budget by 7-8x, landing on the
    // exact same ~63k-token overrun twice). thinkingLevel is the parameter
    // Gemini 3.x actually honors; LOW keeps enough deliberation to plan
    // searches and compare candidates without the runaway sessions.
    thinkingConfig: { thinkingLevel: ThinkingLevel.LOW, includeThoughts: true },
  };

  // The model deciding "I already know the answer, I'll skip searching" is
  // exactly the failure mode that produces hallucinated keys (see
  // automap:pass1 traces where turn 1 has toolUse=0 and jumps straight to a
  // confident-but-wrong final answer). Prompt wording alone doesn't reliably
  // prevent it, so the first turn forces a real function call via
  // toolConfig — the model is structurally unable to answer without
  // searching at least once.
  const forcedToolConfig: GenerateContentConfig = {
    ...config,
    toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } },
  };

  // Each item typically needs a few tool-call round-trips before the model
  // is ready to answer; a fixed 35-iteration budget starves large batches
  // and wastes turns on tiny ones, so scale it with the batch size.
  const maxIterations = Math.min(80, Math.max(15, nItems * 4));

  let parseAttempts = 0;
  for (let i = 0; i < maxIterations; i++) {
    const forcingToolUse = i === 0;
    const response = await withRetry(() =>
      client.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: messages,
        config: forcingToolUse ? forcedToolConfig : config,
      })
    );
    addUsage(usage, response.usageMetadata);
    const meta = response.usageMetadata;
    logTrace(
      trace,
      `turn ${i + 1}: prompt=${meta?.promptTokenCount ?? 0} candidates=${meta?.candidatesTokenCount ?? 0} ` +
        `thoughts=${meta?.thoughtsTokenCount ?? 0} toolUse=${meta?.toolUsePromptTokenCount ?? 0} ` +
        `total=${meta?.totalTokenCount ?? 0} runningCost=$${usage.estimatedCostUsd.toFixed(4)}`
    );

    const candidate = response.candidates?.[0];
    if (!candidate?.content) return null;
    messages.push(candidate.content);

    for (const part of candidate.content.parts ?? []) {
      if (part.thought && part.text) {
        logTrace(trace, `turn ${i + 1} thinking: ${part.text.slice(0, 500).replace(/\n+/g, " ")}`);
      }
    }

    const toolCalls = (candidate.content.parts ?? []).filter((p) => p.functionCall);

    if (forcingToolUse && toolCalls.length === 0) {
      // Should be unreachable — mode: ANY guarantees a function call — but
      // if the API ever ignores it, stop immediately instead of burning
      // more tokens down a path that's already proven to produce
      // hallucinated answers.
      logTrace(trace, `turn ${i + 1} ABORT: model refused the forced tool call on the first turn`);
      throw new Error(
        `Gemini se negó a usar search_sat_catalog en el primer turno (${trace}) — abortando para evitar una respuesta inventada.`
      );
    }

    if (toolCalls.length > 0) {
      const toolResults = [];
      for (const part of toolCalls) {
        const fc = part.functionCall!;
        const query = (fc.args?.query as string) ?? "";
        const results = (await runTool(fc.name ?? "", query)) as SatCatalogResult[];
        for (const r of results) seenKeys.add(r.key);
        const preview = results
          .slice(0, 5)
          .map((r) => `${r.key}:"${r.description}"`)
          .join(", ");
        logTrace(trace, `turn ${i + 1} search("${query}") -> ${results.length} results: ${preview}`);
        toolResults.push({ functionResponse: { name: fc.name, response: { results } } });
      }
      messages.push({ role: "user", parts: toolResults });
      continue;
    }

    const textParts = (candidate.content.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text)
      .filter(Boolean);
    const fullText = textParts.join("\n").trim();
    const clean = fullText.replace(/^```(?:json)?\s*|\s*```$/gm, "").trim();
    const match = clean.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]) as RawItem[];
        logTrace(trace, `turn ${i + 1} final answer:`, parsed);
        return parsed;
      } catch {
        // fall through to retry
      }
    }

    parseAttempts++;
    if (parseAttempts <= 2) {
      messages.push({
        role: "user",
        parts: [
          {
            text:
              "Tu respuesta no contiene JSON válido. Necesito exactamente un array JSON con " +
              `${nItems} objetos, claves: "${idField}", "key", "description", "confidence". ` +
              "Sin texto adicional ni bloques de código. Inténtalo de nuevo.",
          },
        ],
      });
      continue;
    }
    break;
  }
  return null;
}

function itemsText(partidas: AutomapPartida[], fraccionDescriptions: Map<string, string>): string {
  return partidas
    .map((p) => {
      const satDesc = fraccionDescriptions.get(p.fraccion);
      const satLine = satDesc ? ` | SAT (fracción): "${satDesc}"` : "";
      return `- fraccion=${p.fraccion} ${chapterHint(p.fraccion)} | "${p.descripcion}"${satLine}`;
    })
    .join("\n");
}

const SYSTEM_PASS1 =
  "Eres un experto en clasificación SAT para CFDI 4.0 en México. " +
  "Tienes una herramienta: search_sat_catalog (c_ClaveProdServ).\n" +
  "REGLAS OBLIGATORIAS:\n" +
  "(1) SIEMPRE usa search_sat_catalog — nunca inventes un código.\n" +
  "(2) Para CADA producto busca MÍNIMO 3 VECES con términos distintos antes de considerar null: " +
  "primero el término específico, luego un sinónimo, luego la categoría genérica del capítulo HS.\n" +
  "(3) El catálogo usa español formal: 'popote'→'pitillo'; 'plástico'→'polietileno','polipropileno'; " +
  "'manga vaso'→'funda','aislante','protector'; 'portavaso'→'soporte','bandeja','porta'; " +
  "'tapa domo'→'tapa','cubierta','tapadera'; 'contenedor'→'recipiente','envase'.\n" +
  "(4) El capítulo HS entre corchetes indica la categoría — úsalo para refinar búsquedas.\n" +
  "(4b) Si aparece 'SAT (fracción)': es la descripción OFICIAL de la fracción arancelaria según el " +
  "catálogo c_FraccionArancelaria del SAT — más confiable que la descripción del pedimento, que puede " +
  "venir abreviada o en jerga del importador. Prefiérela como término de búsqueda cuando ambas difieran.\n" +
  "(5) null SOLO si después de 3+ búsquedas no encuentras absolutamente nada relacionado.\n" +
  "(6) Para cada resultado incluye un campo confidence: " +
  "'high' si el código es específico y claramente correcto para el producto; " +
  "'medium' si es razonablemente cercano pero no exacto; " +
  "'low' si es el más cercano disponible pero puede no ser correcto.\n" +
  "(7) Solo responde JSON cuando hayas procesado TODOS los productos.";

const SYSTEM_PASS2 =
  "Eres un experto en clasificación SAT para CFDI 4.0 en México. " +
  "Tienes una herramienta: search_sat_catalog.\n" +
  "Estos productos NO fueron clasificados en la primera ronda. " +
  "AHORA debes ser más agresivo y persistente:\n" +
  "(1) Busca al menos 4 veces por producto con términos distintos: específico, sinónimo, " +
  "genérico, y categoría del capítulo HS.\n" +
  "(2) Si no encuentras el código perfecto, elige el MÁS CERCANO disponible — " +
  "es preferible un código aproximado de la categoría correcta que null.\n" +
  "(3) null SOLO si no existe absolutamente ningún código remotamente relacionado en todo el catálogo.\n" +
  "(4) Traducciones clave: 'manga/funda para vaso'→busca 'funda','protector','aislante','cubierta'; " +
  "'portavaso'→'soporte','bandeja','porta vasos','organizador'; " +
  "'tapa domo'→'tapa','cubierta','tapadera','tapa vaso'; " +
  "'contenedor aluminio'→'recipiente','envase','contenedor'; " +
  "'cubre asiento'→'cubierta sanitaria','protector sanitario','higiene'.\n" +
  "(4b) Si aparece 'SAT (fracción)', es la descripción oficial de la fracción arancelaria — úsala como " +
  "término de búsqueda cuando la descripción del pedimento sea vaga o no encuentre nada.\n" +
  "(5) Incluye confidence: 'medium' si el código es razonablemente cercano, " +
  "'low' si es el más cercano pero puede no ser correcto. Nunca 'high' en esta ronda.\n" +
  "(6) Solo responde JSON cuando hayas procesado TODOS los productos de esta lista.";

// Shared two-pass (classify, then rescue the nulls) classification wiring —
// item shape, the JSON key the model reports items under, the prompts, and
// the "Productos:" list formatting all differ per mode (see classifyBatch vs
// classifyDescripcionBatch), but the search/rescue/hallucination-guard
// mechanics don't, so that part lives here once.
interface TwoPassResult {
  id: string;
  key: string | null;
  description: string | null;
  confidence: "high" | "medium" | "low";
}

interface TwoPassOptions<T> {
  idField: "fraccion" | "id";
  getId: (item: T) => string;
  itemsText: (items: T[]) => string;
  systemPass1: string;
  systemPass2: string;
  // The paragraph introducing the batch, up to and including the trailing
  // blank line before "Productos:\n..." — the one part of userMsg1 that
  // genuinely differs in wording (not just the idField) between modes.
  userMsg1Intro: (n: number) => string;
  tracePrefix: string;
}

function rawId(item: RawItem, idField: "fraccion" | "id"): string | undefined {
  return idField === "fraccion" ? item.fraccion : item.id;
}

// The model is instructed to always search before answering, but nothing
// stops it from ignoring that and answering from memory instead — which has
// produced confidently-"high" keys that don't match what they actually are
// in the catalog. Any key never seen in an actual search result this
// conversation is unverified and gets treated as unclassified so it goes
// through the (search-enforcing) rescue pass instead.
function discardUnverifiedKeys(items: RawItem[], seenKeys: Set<string>, idField: "fraccion" | "id", trace: string) {
  for (const item of items) {
    if (item.key && item.key.toLowerCase() !== "null" && !seenKeys.has(item.key.trim())) {
      logTrace(
        trace,
        `WARNING: discarding unverified key="${item.key}" for ${idField}=${rawId(item, idField)} ` +
          "— model never saw this key in a search result, likely hallucinated"
      );
      item.key = null;
    }
  }
}

async function classifyTwoPass<T>(
  client: GoogleGenAI,
  toMap: T[],
  usage: AutomapUsage,
  opts: TwoPassOptions<T>
): Promise<TwoPassResult[]> {
  const { idField, getId, itemsText: buildItemsText, systemPass1, systemPass2, userMsg1Intro, tracePrefix } = opts;
  const trace1 = `${tracePrefix}1`;
  const trace2 = `${tracePrefix}2`;

  const userMsg1 =
    userMsg1Intro(toMap.length) +
    `Productos:\n${buildItemsText(toMap)}\n\n` +
    "IMPORTANTE: busca cada producto AL MENOS 3 VECES con términos diferentes antes de poner null. " +
    "Responde ÚNICAMENTE con este JSON (sin markdown):\n" +
    `[{"${idField}":"...","key":"... o null","description":"... o null","confidence":"high|medium|low"}]`;

  logTrace(trace1, `classifying ${toMap.length} item(s):`, toMap.map(getId));
  const pass1SeenKeys = new Set<string>();
  const finalJson = await runLoop(
    client,
    [{ role: "user", parts: [{ text: userMsg1 }] }],
    systemPass1,
    toMap.length,
    trace1,
    usage,
    pass1SeenKeys,
    idField
  );
  if (!finalJson) {
    throw new Error("Gemini no devolvió un JSON válido con los códigos");
  }

  discardUnverifiedKeys(finalJson, pass1SeenKeys, idField, trace1);

  const nullIds = new Set(
    finalJson.filter((item) => !item.key || item.key.toLowerCase() === "null").map((item) => rawId(item, idField)!)
  );
  if (nullIds.size > 0) {
    const nullItems = toMap.filter((p) => nullIds.has(getId(p)));

    const userMsg2 =
      `Estos ${nullItems.length} productos quedaron sin clasificar. Intenta más fuerte:\n\n` +
      `Productos:\n${buildItemsText(nullItems)}\n\n` +
      "Busca cada uno AL MENOS 4 VECES. Elige el código más cercano si no encuentras el exacto.\n" +
      "Responde ÚNICAMENTE con este JSON (sin markdown):\n" +
      `[{"${idField}":"...","key":"... o null","description":"... o null","confidence":"medium|low"}]`;

    logTrace(trace2, `rescuing ${nullItems.length} item(s):`, nullItems.map(getId));
    const pass2SeenKeys = new Set<string>();
    const rescueJson = await runLoop(
      client,
      [{ role: "user", parts: [{ text: userMsg2 }] }],
      systemPass2,
      nullItems.length,
      trace2,
      usage,
      pass2SeenKeys,
      idField
    );

    if (rescueJson) {
      // Last chance — if the rescue pass also hallucinates a key it never
      // searched for, there's no further pass to fall back on, so discard
      // it outright (better to leave the item unclassified than silently
      // save a wrong code).
      discardUnverifiedKeys(rescueJson, pass2SeenKeys, idField, trace2);
      const rescueMap = new Map(rescueJson.map((item) => [rawId(item, idField), item]));
      for (let i = 0; i < finalJson.length; i++) {
        const rescued = rescueMap.get(rawId(finalJson[i], idField));
        if (rescued) {
          if (rescued.confidence === "high") rescued.confidence = "medium";
          finalJson[i] = rescued;
        }
      }
    }
  }

  const toMapIds = new Set(toMap.map(getId));
  return finalJson
    .filter((item) => {
      const id = rawId(item, idField);
      return id && toMapIds.has(id);
    })
    .map((item) => {
      let confidence = item.confidence ?? "high";
      if (confidence !== "high" && confidence !== "medium" && confidence !== "low") confidence = "high";
      return {
        id: rawId(item, idField)!,
        key: item.key && item.key.toLowerCase() !== "null" ? item.key.trim() : null,
        description: item.description || null,
        confidence: confidence as "high" | "medium" | "low",
      };
    });
}

async function classifyBatch(
  client: GoogleGenAI,
  toMap: AutomapPartida[],
  fraccionDescriptions: Map<string, string>,
  usage: AutomapUsage
): Promise<AutomapClassification[]> {
  const results = await classifyTwoPass(client, toMap, usage, {
    idField: "fraccion",
    getId: (p) => p.fraccion,
    itemsText: (items) => itemsText(items, fraccionDescriptions),
    systemPass1: SYSTEM_PASS1,
    systemPass2: SYSTEM_PASS2,
    userMsg1Intro: (n) =>
      `Clasifica estos ${n} productos con c_ClaveProdServ SAT para CFDI.\n` +
      "La fracción arancelaria NO es el código SAT; el capítulo HS es solo contexto de categoría.\n\n",
    tracePrefix: "pass",
  });
  return results.map((r) => ({ fraccion: r.id, key: r.key, description: r.description, confidence: r.confidence }));
}

// Descripcion-only classification, for line items with no fracción arancelaria
// to key off (manual facturas — see #15). Keyed by an arbitrary caller-supplied
// `id` (a row key) instead of `fraccion`, and with no HS-chapter hint or SAT
// fracción description to fold into the prompt, since neither exists here.
export interface DescripcionItem {
  id: string;
  descripcion: string;
}

export interface DescripcionClassification {
  id: string;
  key: string | null;
  description: string | null;
  confidence: "high" | "medium" | "low";
}

function itemsTextDescripcion(items: DescripcionItem[]): string {
  return items.map((it) => `- id=${it.id} | "${it.descripcion}"`).join("\n");
}

const SYSTEM_PASS1_DESC =
  "Eres un experto en clasificación SAT para CFDI 4.0 en México. " +
  "Tienes una herramienta: search_sat_catalog (c_ClaveProdServ).\n" +
  "REGLAS OBLIGATORIAS:\n" +
  "(1) SIEMPRE usa search_sat_catalog — nunca inventes un código.\n" +
  "(2) Para CADA producto busca MÍNIMO 3 VECES con términos distintos antes de considerar null: " +
  "primero el término específico, luego un sinónimo, luego una categoría genérica relacionada.\n" +
  "(3) El catálogo usa español formal — traduce coloquialismos a términos formales cuando sea necesario.\n" +
  "(4) null SOLO si después de 3+ búsquedas no encuentras absolutamente nada relacionado.\n" +
  "(5) Para cada resultado incluye un campo confidence: " +
  "'high' si el código es específico y claramente correcto para el producto; " +
  "'medium' si es razonablemente cercano pero no exacto; " +
  "'low' si es el más cercano disponible pero puede no ser correcto.\n" +
  "(6) Solo responde JSON cuando hayas procesado TODOS los productos.";

const SYSTEM_PASS2_DESC =
  "Eres un experto en clasificación SAT para CFDI 4.0 en México. " +
  "Tienes una herramienta: search_sat_catalog.\n" +
  "Estos productos NO fueron clasificados en la primera ronda. " +
  "AHORA debes ser más agresivo y persistente:\n" +
  "(1) Busca al menos 4 veces por producto con términos distintos: específico, sinónimo, genérico.\n" +
  "(2) Si no encuentras el código perfecto, elige el MÁS CERCANO disponible — " +
  "es preferible un código aproximado de la categoría correcta que null.\n" +
  "(3) null SOLO si no existe absolutamente ningún código remotamente relacionado en todo el catálogo.\n" +
  "(4) Incluye confidence: 'medium' si el código es razonablemente cercano, " +
  "'low' si es el más cercano pero puede no ser correcto. Nunca 'high' en esta ronda.\n" +
  "(5) Solo responde JSON cuando hayas procesado TODOS los productos de esta lista.";

async function classifyDescripcionBatch(
  client: GoogleGenAI,
  toMap: DescripcionItem[],
  usage: AutomapUsage
): Promise<DescripcionClassification[]> {
  return classifyTwoPass(client, toMap, usage, {
    idField: "id",
    getId: (p) => p.id,
    itemsText: itemsTextDescripcion,
    systemPass1: SYSTEM_PASS1_DESC,
    systemPass2: SYSTEM_PASS2_DESC,
    userMsg1Intro: (n) =>
      `Clasifica estos ${n} productos con c_ClaveProdServ SAT para CFDI, usando solo su descripción.\n\n`,
    tracePrefix: "descPass",
  });
}

export async function runAutomapDescripciones(
  items: DescripcionItem[]
): Promise<{ classifications: DescripcionClassification[]; usage: AutomapUsage }> {
  const usage = newUsage();
  if (items.length === 0) return { classifications: [], usage };

  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const classifications = await classifyDescripcionBatch(client, items, usage);
  logTrace(
    "summary",
    `${usage.calls} Gemini call(s), ${usage.totalTokens} total tokens ` +
      `(prompt=${usage.promptTokens} candidates=${usage.candidatesTokens} thoughts=${usage.thoughtsTokens} ` +
      `toolUse=${usage.toolUseTokens}), estimated cost $${usage.estimatedCostUsd.toFixed(4)}`
  );
  return { classifications, usage };
}

function dedupeUnmapped(partidas: AutomapPartida[], alreadyMapped: Set<string>): AutomapPartida[] {
  const seen = new Map<string, AutomapPartida>();
  for (const p of partidas) {
    if (!seen.has(p.fraccion)) seen.set(p.fraccion, p);
  }
  return [...seen.values()].filter((p) => !alreadyMapped.has(p.fraccion));
}

export async function runAutomap(
  partidas: AutomapPartida[],
  alreadyMapped: Set<string>,
  facturapi: FacturapiClient
): Promise<{ classifications: AutomapClassification[]; message?: string; usage: AutomapUsage }> {
  const usage = newUsage();
  const toMap = dedupeUnmapped(partidas, alreadyMapped);
  if (toMap.length === 0) {
    return { classifications: [], message: "Todas las fracciones ya están mapeadas", usage };
  }

  const fraccionDescriptions = new Map<string, string>();
  await mapWithConcurrency(toMap, 8, async (p) => {
    const desc = await fetchFraccionDescription(facturapi, p.fraccion);
    if (desc) fraccionDescriptions.set(p.fraccion, desc);
  });

  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const classifications = await classifyBatch(client, toMap, fraccionDescriptions, usage);
  logTrace(
    "summary",
    `${usage.calls} Gemini call(s), ${usage.totalTokens} total tokens ` +
      `(prompt=${usage.promptTokens} candidates=${usage.candidatesTokens} thoughts=${usage.thoughtsTokens} ` +
      `toolUse=${usage.toolUseTokens}), estimated cost $${usage.estimatedCostUsd.toFixed(4)}`
  );
  return { classifications, usage };
}
