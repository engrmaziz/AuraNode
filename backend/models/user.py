"""User Pydantic models."""
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


UserRole = Literal["clinic", "specialist", "admin"]


# ─── Issue-spec models ────────────────────────────────────────

class UserBase(BaseModel):
    """Shared user fields."""

    email: EmailStr
    full_name: Optional[str] = None
    organization: Optional[str] = None


class UserCreate(UserBase):
    """Payload for creating a new user."""

    password: str = Field(..., min_length=8)
    role: UserRole = "clinic"


class UserUpdate(BaseModel):
    """Payload for updating an existing user."""

    full_name: Optional[str] = None
    organization: Optional[str] = None
    role: Optional[UserRole] = None


class UserResponse(UserBase):
    """Full user record returned by API endpoints."""

    id: UUID
    role: UserRole
    created_at: str

    model_config = {"from_attributes": True}


class UserInDB(UserResponse):
    """Internal model including the hashed password."""

    hashed_password: Optional[str] = None


class Token(BaseModel):
    """JWT token response."""

    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class TokenData(BaseModel):
    """Data extracted from a verified JWT."""

    user_id: Optional[UUID] = None
    role: Optional[str] = None


# ─── Legacy aliases (kept for backward compatibility) ─────────

class UserProfile(BaseModel):
    """Public user profile returned by API endpoints (legacy alias for UserResponse)."""

    id: str
    email: str
    role: UserRole
    full_name: Optional[str] = None
    organization: Optional[str] = None
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class RegisterRequest(BaseModel):
    """Payload for POST /auth/register."""

    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: str = Field(..., min_length=2, max_length=200)
    organization: Optional[str] = Field(default=None, max_length=200)
    role: UserRole = "clinic"


class LoginRequest(BaseModel):
    """Payload for POST /auth/login."""

    email: EmailStr
    password: str = Field(..., min_length=1)


class LoginResponse(BaseModel):
    """Response for POST /auth/login containing session tokens."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserProfile
