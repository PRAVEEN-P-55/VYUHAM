"""Runtime configuration for the Vyuham Intelligence backend.

Everything is env-overridable but ships with demo-friendly defaults so the
whole stack runs with a single `uvicorn app.main:app` after seeding.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="VYUHAM_", env_file=".env", extra="ignore")

    # Where the seed dataset lives (the 28 data files + 6 ground-truth files).
    dataset_dir: Path = REPO_DIR / "Datasets" / "Datasets"
    # SQLite source-of-truth store, produced by scripts/seed_from_datasets.py.
    db_path: Path = BACKEND_DIR / "data" / "vyuham.db"
    # Directory the frontend expects FIR images under (served at /documents/...).
    # The provided dataset only references FIR####.png paths; drop the actual
    # image files here (or point this at wherever they live) and they are served.
    documents_dir: Path = BACKEND_DIR / "data" / "documents"
    # Built frontend (vite `dist/`). Served same-origin at `/` so there is no
    # CORS surface and the SPA shares the API's host. Build with:
    #   cd frontend && npm install && npm run build
    frontend_dist: Path = REPO_DIR / "frontend" / "dist"

    jwt_secret: str = "vyuham-dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 12

    # Guard rails so the NetworkX canvas payload stays sane for the UI.
    max_graph_nodes: int = 300
    default_page_size: int = 25

    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ]
    # Allow all origins when set to ["*"] -- used in cloud deployments where
    # Vercel preview URLs are not known ahead of time.
    cors_allow_all: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
