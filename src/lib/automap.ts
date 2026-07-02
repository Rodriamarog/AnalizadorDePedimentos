import { GoogleGenAI, Type, type Content, type GenerateContentConfig } from "@google/genai";
import { chapterHint } from "./hsChapters";
import { searchSatCatalogForAutomap, searchSatUnitsForAutomap } from "./satSearch";

export interface AutomapPartida {
  fraccion: string;
  descripcion: string;
}

export interface AutomapClassification {
  fraccion: string;
  key: string | null;
  unitKey: string;
  description: string | null;
  confidence: "high" | "medium" | "low";
}

interface RawItem {
  fraccion?: string;
  key?: string | null;
  unit_key?: string | null;
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
    {
      name: "search_sat_units",
      description:
        "Busca c_ClaveUnidad SAT (unidad de medida para CFDI). Ej: 'pieza'→H87, 'kilogramo'→KGM, 'litro'→LTR, 'metro'→MTR.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: "Unidad de medida en español, ej: 'pieza', 'kilogramo', 'litro'",
          },
        },
        required: ["query"],
      },
    },
  ],
};

async function runTool(name: string, query: string) {
  if (name === "search_sat_catalog") return searchSatCatalogForAutomap(query);
  if (name === "search_sat_units") return searchSatUnitsForAutomap(query);
  return [];
}

async function runLoop(
  client: GoogleGenAI,
  messages: Content[],
  system: string,
  nItems: number
): Promise<RawItem[] | null> {
  const config: GenerateContentConfig = {
    systemInstruction: system,
    tools: [COMBINED_TOOL],
    temperature: 0,
    thinkingConfig: { thinkingBudget: 8192 },
  };

  let parseAttempts = 0;
  for (let i = 0; i < 35; i++) {
    const response = await client.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: messages,
      config,
    });
    const candidate = response.candidates?.[0];
    if (!candidate?.content) return null;
    messages.push(candidate.content);

    const toolCalls = (candidate.content.parts ?? []).filter((p) => p.functionCall);
    if (toolCalls.length > 0) {
      const toolResults = [];
      for (const part of toolCalls) {
        const fc = part.functionCall!;
        const query = (fc.args?.query as string) ?? "";
        const results = await runTool(fc.name ?? "", query);
        toolResults.push({ functionResponse: { name: fc.name, response: { results } } });
      }
      messages.push({ role: "user", parts: toolResults });
      continue;
    }

    const textParts = (candidate.content.parts ?? []).map((p) => p.text).filter(Boolean);
    const fullText = textParts.join("\n").trim();
    const clean = fullText.replace(/^```(?:json)?\s*|\s*```$/gm, "").trim();
    const match = clean.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
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
              `${nItems} objetos, claves: "fraccion", "key", "unit_key", "description", "confidence". ` +
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

function itemsText(partidas: AutomapPartida[]): string {
  return partidas
    .map((p) => `- fraccion=${p.fraccion} ${chapterHint(p.fraccion)} | "${p.descripcion}"`)
    .join("\n");
}

const SYSTEM_PASS1 =
  "Eres un experto en clasificación SAT para CFDI 4.0 en México. " +
  "Tienes dos herramientas: search_sat_catalog (c_ClaveProdServ) y search_sat_units (c_ClaveUnidad).\n" +
  "REGLAS OBLIGATORIAS:\n" +
  "(1) SIEMPRE usa search_sat_catalog — nunca inventes un código.\n" +
  "(2) Para CADA producto busca MÍNIMO 3 VECES con términos distintos antes de considerar null: " +
  "primero el término específico, luego un sinónimo, luego la categoría genérica del capítulo HS.\n" +
  "(3) Para CADA producto usa search_sat_units para determinar la unidad correcta " +
  "(pieza=H87, kilogramo=KGM, litro=LTR, metro=MTR, par=PR, caja=XBX, etc.).\n" +
  "(4) El catálogo usa español formal: 'popote'→'pitillo'; 'plástico'→'polietileno','polipropileno'; " +
  "'manga vaso'→'funda','aislante','protector'; 'portavaso'→'soporte','bandeja','porta'; " +
  "'tapa domo'→'tapa','cubierta','tapadera'; 'contenedor'→'recipiente','envase'.\n" +
  "(5) El capítulo HS entre corchetes indica la categoría — úsalo para refinar búsquedas.\n" +
  "(6) null SOLO si después de 3+ búsquedas no encuentras absolutamente nada relacionado.\n" +
  "(7) Para cada resultado incluye un campo confidence: " +
  "'high' si el código es específico y claramente correcto para el producto; " +
  "'medium' si es razonablemente cercano pero no exacto; " +
  "'low' si es el más cercano disponible pero puede no ser correcto.\n" +
  "(8) Solo responde JSON cuando hayas procesado TODOS los productos.";

const SYSTEM_PASS2 =
  "Eres un experto en clasificación SAT para CFDI 4.0 en México. " +
  "Tienes dos herramientas: search_sat_catalog y search_sat_units.\n" +
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
  "(5) Incluye confidence: 'medium' si el código es razonablemente cercano, " +
  "'low' si es el más cercano pero puede no ser correcto. Nunca 'high' en esta ronda.\n" +
  "(6) Solo responde JSON cuando hayas procesado TODOS los productos de esta lista.";

export async function runAutomap(
  partidas: AutomapPartida[],
  alreadyMapped: Set<string>
): Promise<{ classifications: AutomapClassification[]; message?: string }> {
  const seen = new Map<string, AutomapPartida>();
  for (const p of partidas) {
    if (!seen.has(p.fraccion)) seen.set(p.fraccion, p);
  }
  const toMap = [...seen.values()].filter((p) => !alreadyMapped.has(p.fraccion));
  if (toMap.length === 0) {
    return { classifications: [], message: "Todas las fracciones ya están mapeadas" };
  }

  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const userMsg1 =
    `Clasifica estos ${toMap.length} productos con c_ClaveProdServ y c_ClaveUnidad SAT para CFDI.\n` +
    "La fracción arancelaria NO es el código SAT; el capítulo HS es solo contexto de categoría.\n\n" +
    `Productos:\n${itemsText(toMap)}\n\n` +
    "IMPORTANTE: busca cada producto AL MENOS 3 VECES con términos diferentes antes de poner null. " +
    "Responde ÚNICAMENTE con este JSON (sin markdown):\n" +
    '[{"fraccion":"...","key":"... o null","unit_key":"H87 u otra","description":"... o null","confidence":"high|medium|low"}]';

  const finalJson = await runLoop(
    client,
    [{ role: "user", parts: [{ text: userMsg1 }] }],
    SYSTEM_PASS1,
    toMap.length
  );
  if (!finalJson) {
    throw new Error("Gemini no devolvió un JSON válido con los códigos");
  }

  const nullFracciones = new Set(
    finalJson.filter((item) => !item.key || item.key.toLowerCase() === "null").map((item) => item.fraccion!)
  );
  if (nullFracciones.size > 0) {
    const nullPartidas = toMap.filter((p) => nullFracciones.has(p.fraccion));

    const userMsg2 =
      `Estos ${nullPartidas.length} productos quedaron sin clasificar. Intenta más fuerte:\n\n` +
      `Productos:\n${itemsText(nullPartidas)}\n\n` +
      "Busca cada uno AL MENOS 4 VECES. Elige el código más cercano si no encuentras el exacto.\n" +
      "Responde ÚNICAMENTE con este JSON (sin markdown):\n" +
      '[{"fraccion":"...","key":"... o null","unit_key":"H87 u otra","description":"... o null","confidence":"medium|low"}]';

    const rescueJson = await runLoop(
      client,
      [{ role: "user", parts: [{ text: userMsg2 }] }],
      SYSTEM_PASS2,
      nullPartidas.length
    );

    if (rescueJson) {
      const rescueMap = new Map(rescueJson.map((item) => [item.fraccion, item]));
      for (let i = 0; i < finalJson.length; i++) {
        const rescued = rescueMap.get(finalJson[i].fraccion);
        if (rescued) {
          if (rescued.confidence === "high") rescued.confidence = "medium";
          finalJson[i] = rescued;
        }
      }
    }
  }

  const toMapFracciones = new Set(toMap.map((p) => p.fraccion));
  const classifications: AutomapClassification[] = finalJson
    .filter((item) => item.fraccion && toMapFracciones.has(item.fraccion))
    .map((item) => {
      let confidence = item.confidence ?? "high";
      if (confidence !== "high" && confidence !== "medium" && confidence !== "low") confidence = "high";
      return {
        fraccion: item.fraccion!,
        key: item.key && item.key.toLowerCase() !== "null" ? item.key.trim() : null,
        unitKey: (item.unit_key || "H87").trim(),
        description: item.description || null,
        confidence: confidence as "high" | "medium" | "low",
      };
    });

  return { classifications };
}
