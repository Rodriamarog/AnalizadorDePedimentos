# FacturAPI v2 — Reference Docs

Base URL: `https://www.facturapi.io/v2`

Auth: `Authorization: Bearer <API_KEY>`
- Test key: `sk_test_...`
- Live key: `sk_live_...`

## Source

**[api-es.yaml](api-es.yaml)** — full OpenAPI 3.1 spec, downloaded directly from `https://docs.facturapi.io/redocusaurus/api-es.yaml` (664 KB). This is the authoritative source.

## Endpoints that returned 404 in sandbox

Despite appearing in the spec, these do not respond on the test API:

- `GET /health`
- `GET /catalogs/product-key`
- `GET /catalogs/rfc-validation`

`GET /catalogs/units` works fine.
