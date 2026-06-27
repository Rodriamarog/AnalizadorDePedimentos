import os
import httpx

BASE = "https://www.facturapi.io/v2/"  # trailing slash required for httpx relative URL resolution


def get_client() -> httpx.AsyncClient:
    api_key = os.environ["FACTURAPI_API_KEY"]
    return httpx.AsyncClient(
        base_url=BASE,
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=30.0,
    )
