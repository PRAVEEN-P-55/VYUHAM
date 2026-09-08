"""Vyuham Intelligence backend -- FastAPI application entrypoint."""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import (
    analytics,
    audit,
    auth,
    cases,
    documents,
    entities,
    export,
    gaps,
    graph,
    identity,
    mo,
    patterns,
    search,
    timeline,
)
from app.services import graph_store, jobs


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not settings.db_path.exists():
        raise RuntimeError(
            f"No database at {settings.db_path}. Run: python scripts/seed_from_datasets.py"
        )
    jobs.ensure_schema()
    graph_store.ensure_loaded()
    yield


app = FastAPI(
    title="Vyuham Intelligence API",
    description="Criminal Network Intelligence Platform - SIH26189. "
    "Nothing returned here is a verdict: every AI-derived field carries a "
    "confidence and a review_status, and every link cites evidence.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"http://localhost:\d+|http://127\.0\.0\.1:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API = "/api/v1"
for module in (auth, cases, graph, entities, timeline, patterns, mo, identity, gaps,
               documents, export, audit, analytics, search):
    app.include_router(module.router, prefix=API)


_STATIC_DIR = Path(__file__).resolve().parent / "static"


@app.get("/tester", include_in_schema=False)
def tester_ui():
    """Dev API test harness (single page), kept alongside the real frontend."""
    return FileResponse(_STATIC_DIR / "index.html")


@app.get("/health", tags=["meta"])
def health():
    graph_store.ensure_loaded()
    st = graph_store._state
    return {
        "status": "ok",
        "graph_nodes": st["graph"].number_of_nodes(),
        "graph_edges": st["graph"].number_of_edges(),
        "relationships_loaded": len(st["rel_rows"]),
    }


# Serve FIR images (frontend evidence viewer expects /documents/FIR####.png).
settings.documents_dir.mkdir(parents=True, exist_ok=True)
app.mount("/documents", StaticFiles(directory=str(settings.documents_dir)), name="documents")

_uploads = Path(settings.db_path).parent / "uploads"
_uploads.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_uploads)), name="uploads")


# --------------------------------------------------------------------------
# Serve the built frontend (vite `dist/`) same-origin at `/`. Any client-side
# route falls back to index.html so a hard refresh on e.g. /network works.
# --------------------------------------------------------------------------
_FRONTEND = settings.frontend_dist
if (_FRONTEND / "index.html").is_file():
    if (_FRONTEND / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=str(_FRONTEND / "assets")), name="assets")

    from fastapi import HTTPException

    @app.get("/", include_in_schema=False)
    def _spa_root():
        return FileResponse(_FRONTEND / "index.html")

    @app.get("/{full_path:path}", include_in_schema=False)
    def _spa_fallback(full_path: str):
        if full_path.startswith(("api/", "docs", "redoc", "openapi.json")):
            raise HTTPException(404, "Not found")
        candidate = _FRONTEND / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_FRONTEND / "index.html")
else:  # frontend not built yet -- keep the tester on `/`
    @app.get("/", include_in_schema=False)
    def _tester_root():
        return FileResponse(_STATIC_DIR / "index.html")
