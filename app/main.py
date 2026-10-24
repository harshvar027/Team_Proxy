"""
Baari — app/main.py
FastAPI application entry point.
Mounts routers, static files, security middleware, and security headers.
"""

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from app.config import settings
from app.routers import auth, patient, staff, admin, simulation


# ── Lifespan ───────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"🏥 Baari is running at http://{settings.host}:{settings.port}")
    print(f"   Database: {settings.database_url}")
    yield


# ── App ────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Baari — Hospital OPD Queue Manager",
    description="Come at your time, not at 4 AM.",
    version="1.0.0",
    docs_url="/docs" if os.getenv("ENVIRONMENT") != "production" else None,
    redoc_url=None,
    lifespan=lifespan,
)


# ── Security headers middleware ────────────────────────────────────────────

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to every response."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(self), microphone=(self), geolocation=()"
        # CSP: allow inline scripts/styles for our SPA, camera, audio, QR libraries
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: blob:; "
            "media-src 'self' blob: data:; "
            "connect-src 'self'; "
            "frame-ancestors 'none';"
        )
        return response


app.add_middleware(SecurityHeadersMiddleware)


# ── Register routers ──────────────────────────────────────────────────────

app.include_router(auth.router)
app.include_router(patient.router)
app.include_router(staff.router)
app.include_router(admin.router)
app.include_router(simulation.router)


@app.get("/api/health")
async def health():
    return {"ok": True, "service": "baari"}


@app.api_route("/api/voice/tts", methods=["GET", "HEAD"])
async def tts_alias(request: Request):
    """Direct alias for neural TTS."""
    from app.routers.patient import get_speech_audio
    params = request.query_params
    text = params.get("text", "")
    lang = params.get("language", "hi")
    voice = params.get("voice", None)
    return await get_speech_audio(text=text, language=lang, voice=voice)


# ── Static files ───────────────────────────────────────────────────────────

# Resolve frontend from the project root so HTML/CSS/JS stay in sync with the API.
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
static_dir = os.path.join(BASE_DIR, "static")
frontend_dirs = [BASE_DIR]
if os.path.isdir(static_dir):
    frontend_dirs.append(static_dir)
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

# Mount root-level asset folders for direct URL access
_asset_dirs = ["assets", "css", "js"]
for _d in _asset_dirs:
    _abs = os.path.join(BASE_DIR, _d)
    if os.path.isdir(_abs):
        app.mount(f"/{_d}", StaticFiles(directory=_abs), name=_d)


def _first_existing(*relative_paths: str) -> str | None:
    for folder in frontend_dirs:
        for relative in relative_paths:
            path = os.path.join(folder, relative)
            if os.path.isfile(path):
                return path
    return None


# ── Page routes: serve named HTML files ────────────────────────────────────

_HTML_PAGES = {
    "": "index.html",
    "index": "index.html",
    "login": "login.html",
    "staff": "staff.html",
    "admin": "admin.html",
    "token": "token.html",
    "status": "status.html",
    "change-password": "change-password.html",
    "403": "403.html",
    "404": "404.html",
}


@app.api_route("/{full_path:path}", methods=["GET", "HEAD"])
async def serve_frontend(request: Request, full_path: str):
    """Serve named HTML pages or fall back to index.html for the SPA."""
    # Don't serve static/html for API routes
    if full_path.startswith("api/"):
        return JSONResponse(status_code=404, content={"detail": "Not found"})

    # Strip trailing slash and .html extension for clean routing
    page_key = full_path.rstrip("/").removesuffix(".html").lower()

    # Check for known page
    filename = _HTML_PAGES.get(page_key)
    if filename:
        page_path = _first_existing(filename)
        if page_path:
            return FileResponse(page_path)

    # Fallback: try to serve the file directly (CSS, JS, images, etc.)
    file_path = _first_existing(full_path)
    if file_path:
        return FileResponse(file_path)

    # Final fallback: 404 page or JSON
    not_found = _first_existing("404.html")
    if not_found:
        return FileResponse(not_found, status_code=404)

    return JSONResponse(
        status_code=404,
        content={"detail": "Page not found"},
    )
