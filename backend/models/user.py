"""User Pydantic models."""
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field


UserRole = Literal["clinic", "specialist", "admin"]


class UserProfile(BaseModel):
    """Public user profile returned by API endpoints."""

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
