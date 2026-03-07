"""Auth router — registration and login via Supabase Auth."""
import logging

from fastapi import APIRouter, HTTPException, status

from models.user import (
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    UserProfile,
)
from services.supabase_service import supabase_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/register", response_model=UserProfile, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest) -> UserProfile:
    """Register a new user and create their profile in public.users."""
    try:
        user = await supabase_service.register_user(
            email=payload.email,
            password=payload.password,
            full_name=payload.full_name,
            organization=payload.organization,
            role=payload.role,
        )
        return user
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Registration failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed. Please try again.",
        ) from exc


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest) -> LoginResponse:
    """Authenticate a user and return a Supabase session."""
    try:
        session = await supabase_service.login_user(
            email=payload.email,
            password=payload.password,
        )
        return session
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except Exception as exc:
        logger.error("Login failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed. Please try again.",
        ) from exc


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(token: str) -> None:
    """Sign out the user (invalidate their Supabase session)."""
    try:
        await supabase_service.logout_user(token)
    except Exception as exc:
        logger.warning("Logout error (non-critical): %s", exc)
