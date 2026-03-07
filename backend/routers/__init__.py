from routers.auth import router as auth_router
from routers.cases import router as cases_router
from routers.uploads import router as uploads_router
from routers.analysis import router as analysis_router
from routers.reviews import router as reviews_router
from routers.reports import router as reports_router

__all__ = [
    "auth_router",
    "cases_router",
    "uploads_router",
    "analysis_router",
    "reviews_router",
    "reports_router",
]
