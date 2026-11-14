"""Minimal FastAPI application exposing the lunar terrain routes."""
from fastapi import FastAPI

from backend.terrain_api import router as terrain_router

app = FastAPI(title="NASA Space Apps lunar terrain API")
app.include_router(terrain_router)
