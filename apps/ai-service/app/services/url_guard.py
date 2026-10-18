"""Protección SSRF para cualquier descarga cuya URL la decide un usuario
(ingesta RAG por URL, conectores REST). Auditoría de seguridad 2026-10-18:
antes el servidor seguía cualquier URL y redirección — permitía alcanzar
servicios internos (127.0.0.1:8003 ai-service, 127.0.0.1:8090 Stirling,
metadatos de la nube) y devolver parte de su respuesta al usuario.

Regla: solo http/https, y el host debe resolver EXCLUSIVAMENTE a IPs
públicas. Las redirecciones se siguen a mano y se re-validan en cada salto.
Límite conocido: no evita un DNS rebinding entre la validación y la conexión
(ventana de milisegundos) — aceptable para este uso.
"""
from __future__ import annotations

import asyncio
import ipaddress
import socket
from urllib.parse import urljoin, urlparse

import httpx


class UnsafeUrlError(ValueError):
    """La URL no es http(s) o apunta a una dirección interna/privada."""


def _is_public_ip(ip_str: str) -> bool:
    ip = ipaddress.ip_address(ip_str)
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return not (
        ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast
        or ip.is_reserved or ip.is_unspecified
    )


async def assert_public_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise UnsafeUrlError("Solo se permiten URLs http:// o https://")
    if not parsed.hostname:
        raise UnsafeUrlError("La URL no tiene un host válido")
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    loop = asyncio.get_running_loop()
    try:
        infos = await loop.getaddrinfo(parsed.hostname, port, type=socket.SOCK_STREAM)
    except socket.gaierror as e:
        raise UnsafeUrlError(f"No se pudo resolver el host: {parsed.hostname}") from e
    if not infos:
        raise UnsafeUrlError(f"No se pudo resolver el host: {parsed.hostname}")
    for info in infos:
        if not _is_public_ip(info[4][0]):
            raise UnsafeUrlError("La URL apunta a una dirección interna o privada — no está permitido")


async def safe_get(
    url: str,
    *,
    headers: dict | None = None,
    timeout: float = 60.0,
    max_redirects: int = 3,
) -> httpx.Response:
    """GET con validación SSRF del destino inicial y de cada redirección."""
    current = url
    async with httpx.AsyncClient(follow_redirects=False, timeout=timeout) as client:
        for _ in range(max_redirects + 1):
            await assert_public_url(current)
            resp = await client.get(current, headers=headers)
            location = resp.headers.get("location")
            if resp.is_redirect and location:
                current = urljoin(current, location)
                continue
            return resp
    raise UnsafeUrlError("Demasiadas redirecciones")
