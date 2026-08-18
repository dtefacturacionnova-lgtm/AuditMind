// AuditMind — PM2 ecosystem (Hostinger VPS)
// Web (Next.js):  puerto 3008
// API (NestJS):   puerto 4003
// ai-service:     puerto 8003 (interno — solo 127.0.0.1)
//
// REQUISITO: /home/deploy/auditmind/.env debe existir con todas las variables.
require('dotenv').config({ path: '/home/deploy/auditmind/.env' });

const e = process.env;

// Variables compartidas entre web y api
const envBase = {
  NODE_ENV:                  'production',
  DATABASE_URL:              e.DATABASE_URL,
  DIRECT_URL:                e.DIRECT_URL,
  SUPABASE_URL:              e.SUPABASE_URL,
  SUPABASE_ANON_KEY:         e.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: e.SUPABASE_SERVICE_ROLE_KEY,
  JWT_SECRET:                e.JWT_SECRET,
  ENCRYPTION_KEY:            e.ENCRYPTION_KEY,
  PORTAL_TOKEN_SECRET:       e.PORTAL_TOKEN_SECRET,
  GEMINI_API_KEY:            e.GEMINI_API_KEY,
  ANTHROPIC_API_KEY:         e.ANTHROPIC_API_KEY,
  RESEND_API_KEY:            e.RESEND_API_KEY,
  EMAIL_FROM:                e.EMAIL_FROM,
  EMAIL_FROM_NAME:           e.EMAIL_FROM_NAME,
};

module.exports = {
  apps: [
    // ── Next.js frontend ──────────────────────────────────────────────────
    {
      name: 'auditmind-web',
      cwd: '/home/deploy/auditmind/apps/web',
      script: '../../node_modules/.bin/next',
      args: 'start -p 3008',
      env: {
        ...envBase,
        PORT: 3008,
        // NEXT_PUBLIC_* se hornean en el bundle durante next build.
        // Estos valores aquí solo afectan SSR; el build los toma del .env
        // que se sourcea en deploy.sh antes de ejecutar next build.
        NEXT_PUBLIC_SUPABASE_URL:      e.SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: e.SUPABASE_ANON_KEY,
        NEXT_PUBLIC_API_URL:           'https://auditoria.ianovatechsystems.com/api/v1',
        NEXT_PUBLIC_APP_ENV:           'production',
        NEXT_PUBLIC_PORTAL_URL:        'https://auditoria.ianovatechsystems.com/portal',
        GOOGLE_OAUTH_CLIENT_ID:        e.GOOGLE_OAUTH_CLIENT_ID,
        GOOGLE_OAUTH_CLIENT_SECRET:    e.GOOGLE_OAUTH_CLIENT_SECRET,
      },
      max_memory_restart: '1G',
      autorestart: true,
      watch: false,
    },

    // ── NestJS API ────────────────────────────────────────────────────────
    {
      name: 'auditmind-api',
      cwd: '/home/deploy/auditmind/apps/api',
      script: 'dist/main.js',
      env: {
        ...envBase,
        PORT: 4003,
        // CORS: permite el frontend VPS
        APP_URL: 'https://auditoria.ianovatechsystems.com',
        // ai-service corre internamente en el mismo VPS
        AI_SERVICE_URL:          'http://127.0.0.1:8003',
        AI_SERVICE_INTERNAL_KEY: e.AI_SERVICE_INTERNAL_KEY,
      },
      max_memory_restart: '1G',
      autorestart: true,
      watch: false,
    },

    // ── FastAPI ai-service (Python) ────────────────────────────────────────
    // PM2 gestiona uvicorn directamente con interpreter: 'none'.
    // El venv se crea/actualiza en deploy.sh paso [4/7].
    {
      name: 'auditmind-ai',
      cwd: '/home/deploy/auditmind/apps/ai-service',
      script: 'venv/bin/uvicorn',
      args: 'main:app --host 127.0.0.1 --port 8003 --workers 2',
      interpreter: 'none',
      env: {
        GEMINI_API_KEY:            e.GEMINI_API_KEY,
        ANTHROPIC_API_KEY:         e.ANTHROPIC_API_KEY,
        DATABASE_URL:              e.DATABASE_URL,
        SUPABASE_URL:              e.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: e.SUPABASE_SERVICE_ROLE_KEY,
        INTERNAL_API_KEY:          e.AI_SERVICE_INTERNAL_KEY,
        API_URL:                   'https://auditoria.ianovatechsystems.com/api',
        WEB_URL:                   'https://auditoria.ianovatechsystems.com',
        // Evidencia de campo (EVD-03/EVD-12) — este bloque enumera vars explícitas,
        // no hereda el .env, así que hay que propagarlas a mano (§6.7/§6.12 del diseño).
        WHISPER_MODEL_SIZE:        e.WHISPER_MODEL_SIZE || 'base',
        WHISPER_COMPUTE_TYPE:      e.WHISPER_COMPUTE_TYPE || 'int8',
        WHISPER_DEVICE:            e.WHISPER_DEVICE || 'cpu',
        HUGGINGFACE_TOKEN:         e.HUGGINGFACE_TOKEN,
      },
      // Subido de 800M — pyannote-audio (diarización, EVD-12) trae torch/torchaudio y
      // usa 1-2GB de RAM en inferencia; el VPS tiene sobra (26GB libres verificado
      // 2026-08-17). Las entrevistas formales son un flujo poco frecuente, no constante.
      max_memory_restart: '2500M',
      autorestart: true,
      watch: false,
    },
  ],
};
