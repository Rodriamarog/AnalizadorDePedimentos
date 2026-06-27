import re
import pdfplumber


def _clean_page(text: str, is_first: bool) -> str:
    lines = text.splitlines()
    clean = []
    skip = False
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("AGENTE ADUANAL"):
            skip = True
        if skip:
            if stripped.startswith("PARTIDAS") or stripped.startswith("***"):
                skip = False
                continue
            continue
        if any(stripped.startswith(p) for p in (
            "Cte:", "PEDIMENTO Página", "Página ",
            "ANEXO DEL PEDIMENTO",
            "FRACCIONSUBD", "NÚM", "IDENT", "IFICA", "CIÓN", "COME", "RCIAL",
            "SEC DESCRIPCION", "VAL ADU/USD", "PARTIDAS",
        )):
            continue
        if not is_first and re.match(
            r"^\d+\s+\d+\s+\d+\s+\d+\s+IMP\b", stripped
        ):
            continue
        if not is_first and stripped.startswith("NUM. PEDIMENTO:"):
            continue
        clean.append(stripped)
    return "\n".join(clean)


def _extract_header_info(full_text: str) -> tuple[str, str, float]:
    pedimento_num = ""
    importador = ""
    tipo_cambio = 0.0
    m = re.search(r"NUM\. PEDIMENTO:\s*(.+?)\s*T\. OPER", full_text)
    if m:
        pedimento_num = m.group(1).strip()
    m = re.search(r"RAZON SOCIAL:\s*\n(.+)", full_text)
    if m:
        importador = m.group(1).strip()
    m = re.search(r"TIPO CAMBIO:\s*([\d.,]+)", full_text)
    if m:
        tipo_cambio = float(m.group(1).replace(",", ""))
    return pedimento_num, importador, tipo_cambio


def _is_partida_header(line: str) -> dict | None:
    tokens = line.split()
    if len(tokens) < 10:
        return None
    try:
        sec = int(tokens[0])
    except ValueError:
        return None
    fraccion = tokens[1]
    if not re.fullmatch(r"\d{8}", fraccion):
        return None
    try:
        cantidad = float(tokens[6])
    except (ValueError, IndexError):
        return None
    return {"sec": sec, "fraccion": fraccion, "cantidad": cantidad}


def _is_values_line(line: str) -> tuple[int, int] | None:
    tokens = line.split()
    if len(tokens) != 3:
        return None
    try:
        val_aduana = int(tokens[0])
        val_comercial = int(tokens[1])
        float(tokens[2])
        return val_aduana, val_comercial
    except ValueError:
        return None


def _strip_igi_suffix(line: str) -> str:
    return re.sub(r"\s+IGI\s+[\d.]+\s+\d+\s+\d+\s+\d+\s*$", "", line)


def _is_junk_line(line: str) -> bool:
    junk_prefixes = (
        "IDENTIFICADORES", "IDENTIF.", "OBSERVACIONES A NIVEL",
        "-- Relacion de", "DE: ",
    )
    if any(line.startswith(p) for p in junk_prefixes):
        return True
    known_ids = {"CF", "EC", "EN", "ES", "EX", "MA", "XP", "ED"}
    tokens = line.split()
    if tokens and tokens[0] in known_ids:
        return True
    return False


def parse_pedimento(pdf_path: str) -> dict:
    full_text = ""
    clean_text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages):
            text = page.extract_text()
            if text:
                full_text += text + "\n"
                clean_text += _clean_page(text, is_first=(i == 0)) + "\n"

    pedimento_num, importador, tipo_cambio = _extract_header_info(full_text)

    lines = clean_text.splitlines()
    partidas = []
    i = 0
    while i < len(lines):
        line = lines[i]
        header = _is_partida_header(line)
        if not header:
            i += 1
            continue

        i += 1
        desc_parts = []
        val_aduana = None
        val_comercial = None

        while i < len(lines):
            line = lines[i]
            if not line:
                i += 1
                continue

            vals = _is_values_line(line)
            if vals:
                val_aduana, val_comercial = vals
                i += 1
                break

            if _is_partida_header(line):
                break

            if _is_junk_line(line):
                i += 1
                continue

            desc_parts.append(_strip_igi_suffix(line))
            i += 1

        descripcion = " ".join(desc_parts).strip()
        if val_aduana is not None:
            precio_unitario = round(val_aduana / header["cantidad"], 5)
            partidas.append({
                "sec": header["sec"],
                "fraccion": header["fraccion"],
                "descripcion": descripcion,
                "cantidad": header["cantidad"],
                "val_aduana": val_aduana,
                "val_comercial": val_comercial,
                "precio_unitario": precio_unitario,
                "tiene_incrementables": val_aduana != val_comercial,
            })

    return {
        "pedimento_num": pedimento_num,
        "importador": importador,
        "tipo_cambio": tipo_cambio,
        "partidas": partidas,
    }
