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

static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
if os.path.isdir(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


# ── SPA fallback: serve index.html for all non-API, non-static routes ─────

@app.api_route("/{full_path:path}", methods=["GET", "HEAD"])
async def serve_spa(request: Request, full_path: str):
    """Serve the single-page app for all frontend routes."""
    # Don't serve SPA for API routes
    if full_path.startswith("api/"):
        return JSONResponse(status_code=404, content={"detail": "Not found"})

    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)

    return JSONResponse(
        status_code=404,
        content={"detail": "Frontend not built yet. Run from the baari/ directory."},
    )

