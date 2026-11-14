"""Error categories and their HTTP mapping.

Every error body is backwards compatible with the existing frontend, which reads
``detail``::

    {"detail": "<user-safe message>", "error": {"code": "...", "message": "...", "details": {...}|null}}

Request-validation errors keep FastAPI's standard ``detail`` list and add ``error``.
Never put local paths, credentials or tracebacks in messages; log them instead.
"""
import logging
from contextlib import contextmanager

import requests
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.calculations.sun_earth import SpiceCalculationError
from backend.spice_kernels import KernelError
from backend.terrain.horizon import HorizonError

log = logging.getLogger("backend.errors")


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details: dict | None = None):
        super().__init__(message)
        self.status, self.code, self.message, self.details = status, code, message, details

    def body(self) -> dict:
        return {"detail": self.message,
                "error": {"code": self.code, "message": self.message, "details": self.details}}


def classify(exc: Exception) -> ApiError:
    """Map internal exceptions to user-facing error categories."""
    if isinstance(exc, ApiError):
        return exc
    if isinstance(exc, KeyError):
        return ApiError(404, "unknown_site", "landing site not found")
    if isinstance(exc, HorizonError):  # before ValueError: HorizonError subclasses it
        return ApiError(503, "terrain_unavailable", str(exc))
    if isinstance(exc, KernelError):
        return ApiError(503, "kernels_unavailable", str(exc))
    if isinstance(exc, SpiceCalculationError):
        return ApiError(502, "calculation_failed", str(exc))
    from terrain.catalogue import TerrainUnavailable  # cloud terrain package (optional deps)
    if isinstance(exc, TerrainUnavailable):
        if isinstance(exc.__cause__, requests.Timeout):
            return ApiError(504, "external_data_timeout", "Remote terrain data did not respond in time.")
        return ApiError(503, "terrain_data_unavailable", str(exc))
    if isinstance(exc, requests.Timeout):
        return ApiError(504, "external_data_timeout", "Remote terrain data did not respond in time.")
    if isinstance(exc, ValueError):
        return ApiError(422, "invalid_request", str(exc))
    log.exception("Unclassified error", exc_info=exc)
    return ApiError(500, "internal_error", "Unexpected server error. See server logs for diagnostics.")


@contextmanager
def api_errors():
    """Wrap route bodies: converts known exceptions into ApiError with the right status."""
    try:
        yield
    except ApiError:
        raise
    except Exception as exc:  # noqa: BLE001 - classified below
        raise classify(exc) from exc


def install_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError):
        if exc.status >= 500:
            log.warning("%s (%s): %s", exc.code, exc.status, exc.message)
        return JSONResponse(status_code=exc.status, content=exc.body())

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        errors = [{k: v for k, v in e.items() if k in ("loc", "msg", "type")} for e in exc.errors()]
        message = "; ".join(
            f"{'.'.join(str(p) for p in e['loc'] if p not in ('query', 'body'))}: {e['msg']}" for e in errors
        ) or "Invalid request."
        return JSONResponse(status_code=422, content={
            "detail": errors, "error": {"code": "invalid_request", "message": message, "details": None}})

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException):
        code = {404: "not_found", 405: "method_not_allowed"}.get(exc.status_code, "http_error")
        return JSONResponse(status_code=exc.status_code, content={
            "detail": exc.detail, "error": {"code": code, "message": str(exc.detail), "details": None}})

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        log.exception("Unhandled error", exc_info=exc)
        return JSONResponse(status_code=500, content={
            "detail": "Unexpected server error. See server logs for diagnostics.",
            "error": {"code": "internal_error", "message": "Unexpected server error.", "details": None}})
