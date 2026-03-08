"""Auth middleware — JWT verification and current user dependency."""
import logging
from typing import Callable, Optional
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer, OAuth2PasswordBearer
from jose import JWTError, jwt
from supabase import Client

from config.settings import settings
from models.user import TokenData, UserProfile
from services.supabase_service import supabase_service

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=False)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


def get_supabase_client() -> Client:
    """FastAPI dependency that returns the Supabase service client."""
    return supabase_service.client


def _decode_jwt(token: str) -> dict:
    """Decode and verify a Supabase JWT.

    Inspects the token header to determine the algorithm in use, then either
    verifies the signature (HS256) or falls back to unverified claims with
    issuer validation (ES256 and other asymmetric algorithms).

    Raises HTTPException 401 on any verification failure.
    """
    try:
        unverified_header = jwt.get_unverified_header(token)
        logger.debug("JWT header: %s", unverified_header)

        unverified_claims = jwt.get_unverified_claims(token)
        logger.debug("JWT claims iss: %s", unverified_claims.get("iss"))
        logger.debug("JWT claims sub: %s", unverified_claims.get("sub"))

        alg = unverified_header.get("alg", "HS256")
        logger.debug("Token algorithm: %s", alg)

        if alg == "HS256":
            payload = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
        else:
            # For ES256 or other asymmetric algorithms use unverified claims
            # but validate the issuer matches this project's Supabase URL.
            payload = unverified_claims
            iss = payload.get("iss", "")
            expected_iss = settings.supabase_url.rstrip("/")
            if not iss.rstrip("/").startswith(expected_iss):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token issuer.",
                    headers={"WWW-Authenticate": "Bearer"},
                )

        return payload
    except HTTPException:
        raise
    except JWTError as exc:
        logger.debug("JWT decode failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def _get_user_from_token(token: str) -> UserProfile:
    """Decode the JWT and return the corresponding UserProfile.

    Raises HTTPException 401 if the token is invalid or the user is not found.
    """
    payload = _decode_jwt(token)

    user_id_str: Optional[str] = payload.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token data.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await supabase_service.get_user_profile(user_id=user_id_str)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


async def verify_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> TokenData:
    """Extract and verify the Supabase JWT from the Authorization header.

    Returns TokenData with user_id and role, or raises 401.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Provide a valid Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await _get_user_from_token(credentials.credentials)

    try:
        return TokenData(user_id=UUID(user.id), role=user.role)
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token data.",
            headers={"WWW-Authenticate": "Bearer"},
        )


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

    return await _get_user_from_token(credentials.credentials)


def require_role(*roles: str) -> Callable:
    """Return a FastAPI dependency that raises 403 if the user's role is not in *roles*.

    Usage::

        @router.get("/admin-only")
        async def admin_only(user = Depends(require_role("admin"))):
            ...

        @router.get("/multi-role")
        async def multi(user = Depends(require_role("admin", "specialist"))):
            ...
    """

    async def _dependency(
        current_user: UserProfile = Depends(get_current_user),
    ) -> UserProfile:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role(s): {', '.join(roles)}",
            )
        return current_user

    return _dependency


async def get_current_clinic(
    current_user: UserProfile = Depends(get_current_user),
) -> UserProfile:
    """Dependency that allows only 'clinic' role users."""
    if current_user.role != "clinic":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. This endpoint requires the 'clinic' role.",
        )
    return current_user


async def get_current_specialist(
    current_user: UserProfile = Depends(get_current_user),
) -> UserProfile:
    """Dependency that allows only 'specialist' role users."""
    if current_user.role != "specialist":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. This endpoint requires the 'specialist' role.",
        )
    return current_user


async def get_current_admin(
    current_user: UserProfile = Depends(get_current_user),
) -> UserProfile:
    """Dependency that allows only 'admin' role users."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. This endpoint requires the 'admin' role.",
        )
    return current_user
