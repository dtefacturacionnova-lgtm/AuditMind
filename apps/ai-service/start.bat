@echo off
title AuditMind AI Service - Puerto 3003
cd /d "%~dp0"

echo.
echo  AuditMind AI Service v2.0
echo  Modelo: Claude Sonnet + Gemini Embeddings (3072 dims)
echo  Puerto: http://localhost:3003
echo  Docs:   http://localhost:3003/docs
echo.

REM Usar el venv local si existe, si no usar Python del sistema
if exist "venv\Scripts\uvicorn.exe" (
    echo  Usando venv local...
    venv\Scripts\uvicorn.exe main:app --host 0.0.0.0 --port 3003 --reload --log-level info
) else (
    echo  Usando Python del sistema...
    python -m uvicorn main:app --host 0.0.0.0 --port 3003 --reload --log-level info
)
pause
