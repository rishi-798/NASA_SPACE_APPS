"""2026-11-14: bounded NASA reads; upstream URLs and keys never enter errors."""
from functools import lru_cache
import time
import requests
from fastapi import HTTPException

ALLOWED = {'https://api.nasa.gov/planetary/apod', 'https://images-api.nasa.gov/search',
           'https://science.nasa.gov/wp-json/wp/v2/apod-basic'}


@lru_cache(maxsize=128)
def _read(url, parameters, bucket):
    try:
        response = requests.get(url, params=dict(parameters), timeout=(3, 15))
        if response.status_code == 429:
            raise HTTPException(429, 'NASA is rate-limiting requests. Please try again later.')
        if response.status_code in (401, 403):
            raise HTTPException(503, 'The NASA API key is unavailable or has reached its limit.')
        response.raise_for_status()
        return response.json()
    except (requests.RequestException, ValueError) as exc:
        raise HTTPException(502, 'NASA could not be reached. Please retry shortly.') from None


def nasa_json(url, parameters, ttl=3600):
    if url not in ALLOWED:
        raise ValueError('Only configured NASA endpoints are permitted')
    return _read(url, tuple(sorted(parameters.items())), int(time.monotonic() // ttl))
