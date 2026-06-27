"""
Facturapi endpoint explorer
Runs through all relevant endpoints in sequence, printing responses.
Uses test key so nothing goes to the SAT.

Usage:
    pip install requests python-dotenv
    python test_facturapi.py
"""

import json
import os
import sys

import requests
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("TEST_FACTURAPI_API_KEY")
if not API_KEY:
    sys.exit("ERROR: TEST_FACTURAPI_API_KEY not found in .env")

BASE = "https://www.facturapi.io/v2"
HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}


# ─── helpers ─────────────────────────────────────────────────────────────────

def section(title: str):
    print(f"\n{'═' * 60}")
    print(f"  {title}")
    print('═' * 60)

def show(label: str, resp: requests.Response):
    print(f"\n── {label}")
    print(f"   Status : {resp.status_code}")
    try:
        body = resp.json()
        print(f"   Body   : {json.dumps(body, indent=4, ensure_ascii=False)[:1500]}")
    except Exception:
        print(f"   Body   : {resp.text[:500]}")
    return resp

def get(path, **params):
    return requests.get(f"{BASE}{path}", headers=HEADERS, params=params)

def post(path, body):
    return requests.post(f"{BASE}{path}", headers=HEADERS, json=body)

def put(path, body):
    return requests.put(f"{BASE}{path}", headers=HEADERS, json=body)

def delete(path, **params):
    return requests.delete(f"{BASE}{path}", headers=HEADERS, params=params)


# ─── 1. health check ─────────────────────────────────────────────────────────

section("1. HEALTH CHECK")
show("GET /health", get("/health"))


# ─── 2. catalog searches ─────────────────────────────────────────────────────

section("2. CATALOG — ClaveProdServ search")
show("q=vaso papel", get("/catalogs/product-key", q="vaso papel"))
show("q=contenedor plastico", get("/catalogs/product-key", q="contenedor plastico"))
show("q=bolsa papel", get("/catalogs/product-key", q="bolsa papel"))
show("q=popote", get("/catalogs/product-key", q="popote"))
show("q=servilleta", get("/catalogs/product-key", q="servilleta"))

section("2b. CATALOG — Unidades de medida")
show("q=pieza", get("/catalogs/units", q="pieza"))

section("2c. RFC validation")
show("Validate RFC AARC700811CL4", get("/catalogs/rfc-validation", q="AARC700811CL4"))


# ─── 3. customers ────────────────────────────────────────────────────────────

section("3. CUSTOMERS")

# Create
r = show("POST /customers", post("/customers", {
    "legal_name": "Carlos Alberto Amaro Reyes",
    "tax_id": "AARC700811CL4",
    "tax_system": "616",           # Sin obligaciones fiscales (persona física frontera)
    "address": {
        "zip": "22504",            # Playas de Tijuana, from the pedimento
    },
    "email": "test@example.com",
}))
customer = r.json()
customer_id = customer.get("id")
print(f"\n   >>> customer_id = {customer_id}")

# List
show("GET /customers", get("/customers"))

# Get by ID
if customer_id:
    show("GET /customers/{id}", get(f"/customers/{customer_id}"))

# Search by name
show("GET /customers?q=CARLOS", get("/customers", q="CARLOS"))


# ─── 4. products ─────────────────────────────────────────────────────────────

section("4. PRODUCTS")

# Create a few products that mirror actual partidas from the pedimento
products_to_create = [
    {
        "description": "TAPA DE ALUMINIO PARA CONTENEDOR MEDIANO MARCA: KARAT",
        "product_key": "25172300",   # Containers and lids — adjust after catalog search
        "price": 347.00,
        "tax_included": False,
        "taxes": [{"type": "IVA", "rate": 0.16}],
        "unit_key": "H87",           # Pieza
    },
    {
        "description": "VASO DE PAPEL PARA CALIENTE DE 12 ONZAS MARCA: KARAT",
        "product_key": "14111702",   # Paper cups
        "price": 855.27,
        "tax_included": False,
        "taxes": [{"type": "IVA", "rate": 0.16}],
        "unit_key": "H87",
    },
    {
        "description": "POPOTE DE PLASTICO GIGANTE ENVUELTO DE 9 PULGADAS VERDE MARCA: KARAT",
        "product_key": "52121600",   # Straws and stirrers (popotes)
        "price": 310.33,
        "tax_included": False,
        "taxes": [{"type": "IVA", "rate": 0.16}],
        "unit_key": "H87",
    },
]

created_products = []
for p in products_to_create:
    r = show(f"POST /products — {p['description'][:40]}...", post("/products", p))
    prod = r.json()
    if prod.get("id"):
        created_products.append(prod)
        print(f"   >>> product_id = {prod['id']}")

# List
show("GET /products", get("/products"))

# Get first product by ID
if created_products:
    show("GET /products/{id}", get(f"/products/{created_products[0]['id']}"))


# ─── 5. invoices ─────────────────────────────────────────────────────────────

section("5. INVOICES — create (PUE, pago en una exhibición)")

invoice_body = {
    "customer": customer_id or {
        "legal_name": "Carlos Alberto Amaro Reyes",
        "tax_id": "AARC700811CL4",
        "tax_system": "616",
        "address": {"zip": "22504"},
    },
    "use": "G01",                  # Adquisición de mercancias
    "payment_form": "03",          # Transferencia electrónica
    "payment_method": "PUE",       # Pago en una sola exhibición
    "items": [
        {
            "quantity": 2,
            "product": {
                "description": "TAPA DE ALUMINIO PARA CONTENEDOR MEDIANO MARCA: KARAT",
                "product_key": "25172300",
                "price": 347.00,
                "tax_included": False,
                "taxes": [{"type": "IVA", "rate": 0.16}],
                "unit_key": "H87",
            },
        },
        {
            "quantity": 15,
            "product": {
                "description": "POPOTE DE PLASTICO GIGANTE ENVUELTO 9 PULGADAS VERDE MARCA: KARAT",
                "product_key": "52121600",
                "price": 310.33,
                "tax_included": False,
                "taxes": [{"type": "IVA", "rate": 0.16}],
                "unit_key": "H87",
            },
        },
    ],
}

r = show("POST /invoices", post("/invoices", invoice_body))
invoice = r.json()
invoice_id = invoice.get("id")
print(f"\n   >>> invoice_id  = {invoice_id}")
print(f"   >>> uuid        = {invoice.get('uuid')}")
print(f"   >>> status      = {invoice.get('status')}")
print(f"   >>> total       = {invoice.get('total')}")


# ─── 6. invoice queries ───────────────────────────────────────────────────────

section("6. INVOICES — list & retrieve")
show("GET /invoices", get("/invoices"))

if invoice_id:
    show("GET /invoices/{id}", get(f"/invoices/{invoice_id}"))


# ─── 7. download links (streams — just check headers) ────────────────────────

section("7. INVOICES — download (checking response headers only)")

if invoice_id:
    for fmt in ("pdf", "xml", "zip"):
        r = requests.get(
            f"{BASE}/invoices/{invoice_id}/{fmt}",
            headers={"Authorization": f"Bearer {API_KEY}"},
            stream=True,
        )
        print(f"\n── GET /invoices/{{id}}/{fmt}")
        print(f"   Status          : {r.status_code}")
        print(f"   Content-Type    : {r.headers.get('Content-Type')}")
        print(f"   Content-Length  : {r.headers.get('Content-Length', 'chunked')}")


# ─── 8. send by email ────────────────────────────────────────────────────────

section("8. INVOICES — send by email")
if invoice_id:
    show(
        "POST /invoices/{id}/email",
        post(f"/invoices/{invoice_id}/email", {"email": "test@example.com"}),
    )


# ─── 9. invoice preview (PDF preview before stamping) ────────────────────────

section("9. INVOICES — PDF preview (draft check)")
r = post("/invoices/preview/pdf", invoice_body)
print(f"\n── POST /invoices/preview/pdf")
print(f"   Status       : {r.status_code}")
print(f"   Content-Type : {r.headers.get('Content-Type')}")
print(f"   Size         : {len(r.content)} bytes")


# ─── 10. cancellation ────────────────────────────────────────────────────────

section("10. INVOICES — cancel")
if invoice_id:
    # motive 02 = "Comprobante emitido con errores sin relación" (most common test reason)
    r = show(
        f"DELETE /invoices/{invoice_id}?motive=02",
        delete(f"/invoices/{invoice_id}", motive="02"),
    )
    print(f"   >>> cancellation_status = {r.json().get('cancellation_status')}")


# ─── 11. clean up — delete test customer & products ──────────────────────────

section("11. CLEANUP — delete test data")

for prod in created_products:
    show(f"DELETE /products/{prod['id']}", delete(f"/products/{prod['id']}"))

if customer_id:
    show(f"DELETE /customers/{customer_id}", delete(f"/customers/{customer_id}"))


# ─── done ─────────────────────────────────────────────────────────────────────

section("DONE")
print("\nAll endpoints exercised. Check output above for response shapes.\n")