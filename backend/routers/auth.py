"""Auth router — registration, login, and user profile management via Supabase Auth."""
import logging
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from middleware.auth_middleware import get_current_user
from models.user import (
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    UserProfile,
    UserUpdate,
)
from services.supabase_service import supabase_service

logger = logging.getLogger(__name__)
router = APIRouter()

_bearer = HTTPBearer(auto_error=False)


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


@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> dict:
    """Sign out the user (invalidate their Supabase session)."""
    token = credentials.credentials if credentials else None
    try:
        await supabase_service.logout_user(token or "")
    except Exception as exc:
        logger.warning("Logout error (non-critical): %s", exc)
    return {"message": "Logged out successfully."}


@router.get("/me", response_model=UserProfile)
async def get_me(current_user: UserProfile = Depends(get_current_user)) -> UserProfile:
    """Return the currently authenticated user's profile."""
    return current_user


@router.put("/me", response_model=UserProfile)
async def update_me(
    payload: UserUpdate,
    current_user: UserProfile = Depends(get_current_user),
) -> UserProfile:
    """Update the current user's profile fields."""
    update_data = payload.model_dump(exclude_none=True)
    if not update_data:
        return current_user
    try:
        updated = await supabase_service.update_user(
            user_id=current_user.id, data=update_data
        )
        return updated
    except Exception as exc:
        logger.error("Profile update failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Profile update failed. Please try again.",
        ) from exc


@router.post("/refresh", response_model=LoginResponse)
async def refresh_token(refresh_token: str = Body(..., embed=True)) -> LoginResponse:
    """Exchange a refresh token for a new session."""
    try:
        session = await supabase_service.refresh_session(refresh_token=refresh_token)
        return session
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except Exception as exc:
        logger.error("Token refresh failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Token refresh failed. Please log in again.",
        ) from exc


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
async def forgot_password(email: str = Body(..., embed=True)) -> dict:
    """Trigger a Supabase password reset email."""
    try:
        await supabase_service.send_password_reset(email=email)
    except Exception as exc:
        # Don't reveal whether the email exists — always return 200
        logger.warning("Password reset error (non-critical): %s", exc)
    return {"message": "If that email exists, a reset link has been sent."}
