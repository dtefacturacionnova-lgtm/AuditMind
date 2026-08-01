#!/usr/bin/env bash
set -euo pipefail

# AuditMind — Deploy script para Hostinger VPS
# Subdominio:     auditoria.ianovatechsystems.com
# Web (Next.js):  puerto 3008  — público vía nginx /
# API (NestJS):   puerto 4003  — público vía nginx /api/
# ai-service:     puerto 8003  — interno solo (127.0.0.1)
#
# IMPORTANTE: correr como usuario 'deploy', nunca como root.
# Si corres como root los archivos de build quedan con owner root
# y el siguiente deploy falla con EACCES.

REPO_DIR="/home/deploy/auditmind"

# Guardia: abortar si se corre como root
if [ "$(id -u)" = "0" ]; then
  echo "ERROR: No corras este script como root." >&2
  echo "  Usa: su deploy -c 'cd $REPO_DIR && ./deploy/deploy.sh'" >&2
  exit 1
fi

cd "$REPO_DIR"

# Cargar .env para que las variables NEXT_PUBLIC_* estén disponibles
# durante el build de Next.js (se hornean en el bundle)
if [ -f "$REPO_DIR/.env" ]; then
  set -o allexport
  # shellcheck disable=SC1091
  source "$REPO_DIR/.env"
  set +o allexport
fi

echo "==> [1/7] Pull latest code"
git fetch origin main
git reset --hard origin/main

echo "==> [2/7] Install Node dependencies"
npm install --no-audit

# Sanity check: binarios críticos deben existir tras npm install
MISSING=""
[ -x "$REPO_DIR/node_modules/.bin/next" ]   || MISSING="$MISSING next"
[ -x "$REPO_DIR/node_modules/.bin/nest" ]   || MISSING="$MISSING nest"
[ -x "$REPO_DIR/node_modules/.bin/prisma" ] || MISSING="$MISSING prisma"
if [ -n "$MISSING" ]; then
  echo "ERROR: faltan binarios críticos tras npm install:$MISSING" >&2
  echo "Reintentar: cd $REPO_DIR && npm install --no-audit" >&2
  exit 1
fi

echo "==> [3/7] Generate Prisma client"
cd "$REPO_DIR/apps/api"
"$REPO_DIR/node_modules/.bin/prisma" generate
cd "$REPO_DIR"

echo "==> [4/7] Install Python dependencies (ai-service)"
cd "$REPO_DIR/apps/ai-service"
if [ ! -d "venv" ]; then
  echo "   Creando virtualenv Python 3.12..."
  python3.12 -m venv venv
fi
venv/bin/pip install --quiet --no-cache-dir -r requirements.txt
echo "   Python deps OK"
cd "$REPO_DIR"

echo "==> [5/7] Build NestJS API"
rm -f apps/api/tsconfig.build.tsbuildinfo
cd "$REPO_DIR/apps/api"
"$REPO_DIR/node_modules/.bin/nest" build
cd "$REPO_DIR"

echo "==> [6/7] Build Next.js web"
rm -rf apps/web/.next node_modules/.cache

BUILD_LOG="/tmp/build-auditmind-$(date +%s).log"
echo "   Build intento 1 — log en $BUILD_LOG"
if cd "$REPO_DIR/apps/web" && NODE_OPTIONS="--max-old-space-size=2048" "$REPO_DIR/node_modules/.bin/next" build 2>&1 | tee "$BUILD_LOG"; then
  echo "   Build OK"
  cd "$REPO_DIR"
else
  BUILD_EXIT=${PIPESTATUS[0]}
  cd "$REPO_DIR"
  if grep -q "WebpackError is not a constructor" "$BUILD_LOG"; then
    echo "   Bug webpack cache detectado — limpieza profunda y retry"
    rm -rf node_modules apps/web/.next
    npm install --no-audit
    cd "$REPO_DIR/apps/api" && "$REPO_DIR/node_modules/.bin/prisma" generate
    cd "$REPO_DIR"
    cd "$REPO_DIR/apps/web" && NODE_OPTIONS="--max-old-space-size=2048" "$REPO_DIR/node_modules/.bin/next" build
    cd "$REPO_DIR"
  else
    echo "   Build falló (exit=$BUILD_EXIT). Últimas 30 líneas:"
    tail -30 "$BUILD_LOG"
    exit "$BUILD_EXIT"
  fi
fi

echo "==> [7/7] Reload PM2 processes"
if pm2 list | grep -q "auditmind-web\|auditmind-api\|auditmind-ai"; then
  pm2 reload "$REPO_DIR/ecosystem.config.cjs" --update-env
else
  pm2 start "$REPO_DIR/ecosystem.config.cjs"
fi
pm2 save

echo "==> Deploy completado exitosamente."
echo "    Web:       https://auditoria.ianovatechsystems.com"
echo "    API docs:  https://auditoria.ianovatechsystems.com/api/docs"
