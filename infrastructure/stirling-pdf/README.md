# Stirling-PDF — herramientas de PDF self-hosted

Servicio Docker separado, no gestionado por `deploy/deploy.sh` ni PM2. Provee OCR
(y a futuro: fusionar, marca de agua, firma digital, redacción) sin límite de
cuota de API — ver el plan de OCR de 2026-08-24 para el contexto completo de
por qué existe y qué decisiones se tomaron (imagen oficial aceptando el riesgo
de licencia residual, primera funcionalidad conectada: OCR de evidencia).

## Desplegar / actualizar (manual, en el VPS)

```bash
cd /home/deploy/auditmind/infrastructure/stirling-pdf
docker compose pull
docker compose up -d
```

## Verificar

```bash
# Desde el VPS — debe responder
curl -s http://127.0.0.1:8090/api/v1/info/status

# Desde una máquina externa al VPS — debe FALLAR (aislamiento de red)
curl -m 5 http://<IP-PUBLICA-VPS>:8090/
```

## Notas

- Puerto publicado SOLO en `127.0.0.1:8090` — nunca exponerlo públicamente,
  el servicio no trae autenticación propia (`SECURITY_ENABLELOGIN=false`).
- `apps/api` lo consume vía `STIRLING_PDF_URL` (`pdf-tools.service.ts`) y
  `apps/ai-service` vía `STIRLING_PDF_URL` en `.env` (fallback de OCR en
  `rag_pipeline.py`, antes de caer a Gemini vision).
- Español (`spa`) ya viene preinstalado en la imagen oficial — no hace falta
  montar `tessdata` a mano salvo que se necesite otro idioma.
