"""Auth middleware — JWT verification and current user dependency."""
import logging
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from models.user import UserProfile
from services.supabase_service import supabase_service

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> UserProfile:
    """Extract and verify the Supabase JWT from the Authorization header.

    Returns the verified UserProfile or raises 401.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Provide a valid Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    user = await supabase_service.verify_token(token)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


async def require_role(
    required_roles: list[str],
    current_user: UserProfile = Depends(get_current_user),
) -> UserProfile:
    """Raise 403 if the current user's role is not in required_roles."""
    if current_user.role not in required_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. Required role(s): {', '.join(required_roles)}",
        )
    return current_user
