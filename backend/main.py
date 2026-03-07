"""
AuraNode FastAPI Backend — Entry Point

Endpoints:
  GET  /                → Root info
  GET  /health          → Health check
  POST /api/v1/auth/*   → Authentication
  *    /api/v1/cases/*  → Case management
  *    /api/v1/uploads/*→ File uploads
  *    /api/v1/analysis/*→ AI analysis
  *    /api/v1/reviews/*→ Specialist reviews
  *    /api/v1/reports/*→ PDF reports
"""
import logging
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config.settings import settings
from routers import analysis, auth, cases, reports, reviews, uploads

# ─── Logging ────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG if settings.is_development else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("auranode")

# ─── Sentry ─────────────────────────────────────────────────
if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        traces_sample_rate=0.2 if settings.is_production else 1.0,
        environment=settings.environment,
        release=settings.app_version,
    )
    logger.info("Sentry initialized for environment: %s", settings.environment)


# ─── Lifespan ───────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[type-arg]
    logger.info("🚀 %s v%s starting up", settings.app_name, settings.app_version)
    logger.info("   Environment : %s", settings.environment)
    logger.info("   CORS origins: %s", settings.allowed_origins_list)
    logger.info("   Max upload  : %d MB", settings.max_file_size_mb)
    yield
    logger.info("🛑 %s shutting down", settings.app_name)


# ─── Application ────────────────────────────────────────────
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="AI-powered diagnostic image analysis API for AuraNode.",
    docs_url="/docs" if settings.is_development else None,
    redoc_url="/redoc" if settings.is_development else None,
    lifespan=lifespan,
)

# ─── CORS Middleware ─────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ────────────────────────────────────────────────
API_PREFIX = "/api/v1"

app.include_router(auth.router, prefix=f"{API_PREFIX}/auth", tags=["Auth"])
app.include_router(cases.router, prefix=f"{API_PREFIX}/cases", tags=["Cases"])
app.include_router(uploads.router, prefix=f"{API_PREFIX}/uploads", tags=["Uploads"])
app.include_router(analysis.router, prefix=f"{API_PREFIX}/analysis", tags=["Analysis"])
app.include_router(reviews.router, prefix=f"{API_PREFIX}/reviews", tags=["Reviews"])
app.include_router(reports.router, prefix=f"{API_PREFIX}/reports", tags=["Reports"])


# ─── Core Endpoints ──────────────────────────────────────────
@app.get("/", tags=["Root"], include_in_schema=False)
async def root() -> dict:
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
        "docs": "/docs" if settings.is_development else "disabled in production",
    }


@app.get("/health", tags=["Health"])
async def health_check() -> dict:
    """Returns 200 OK when the service is healthy."""
    return {"status": "healthy", "version": settings.app_version}


# ─── Exception Handlers ──────────────────────────────────────
@app.exception_handler(404)
async def not_found_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"error": "Resource not found", "path": str(request.url)},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    errors = [
        {"field": " → ".join(str(loc) for loc in err["loc"]), "message": err["msg"]}
        for err in exc.errors()
    ]
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"error": "Validation failed", "details": errors},
    )


@app.exception_handler(500)
async def internal_server_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error("Unhandled exception on %s: %s", request.url, exc, exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"error": "An internal server error occurred. Our team has been notified."},
    )
