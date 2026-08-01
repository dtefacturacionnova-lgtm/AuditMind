#!/usr/bin/env bash
# AuditMind — Setup inicial en el VPS (correr como root, UNA SOLA VEZ)
# Subdominio: auditoria.ianovatechsystems.com
#
# Requisitos previos (ya deben estar en el VPS):
#   - Node.js v22+  (instalado para otros proyectos)
#   - npm + PM2     (instalados para otros proyectos)
#   - Nginx         (instalado para otros proyectos)
#   - Certbot       (instalado para otros proyectos)
#   - Usuario 'deploy' con home /home/deploy

set -euo pipefail

# ── 1. Python 3.12 ─────────────────────────────────────────────────────────
echo "==> Instalando Python 3.12..."
apt-get update -qq
apt-get install -y python3.12 python3.12-venv python3.12-dev

# Verificar
python3.12 --version

# ── 2. Clonar repositorio ──────────────────────────────────────────────────
REPO_DIR="/home/deploy/auditmind"

if [ -d "$REPO_DIR/.git" ]; then
  echo "==> Repo ya existe en $REPO_DIR — saltando clone"
else
  echo "==> Clonando repo..."
  # NOTA: la SSH key de deploy debe estar cargada o usar HTTPS con token.
  # Reemplaza la URL si es necesario:
  git clone git@github-auditmind:dtefacturacionnova-lgtm/AuditMind.git "$REPO_DIR"
fi

# ── 3. Permisos ────────────────────────────────────────────────────────────
echo "==> Ajustando propietario a deploy:deploy..."
chown -R deploy:deploy "$REPO_DIR"

# ── 4. Permisos de ejecución en scripts ───────────────────────────────────
chmod +x "$REPO_DIR/deploy/deploy.sh"

# ── 5. .env — crear plantilla si no existe ────────────────────────────────
ENV_FILE="$REPO_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  echo "==> .env ya existe — no se sobreescribe"
else
  echo "==> Creando .env de plantilla (debes rellenar los valores)..."
  cat > "$ENV_FILE" << 'ENVTEMPLATE'
# ── Supabase ────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres
SUPABASE_URL=https://[PROJECT_REF].supabase.co
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# ── Auth / tokens ───────────────────────────────────────────────────────────
JWT_SECRET=
ENCRYPTION_KEY=
PORTAL_TOKEN_SECRET=

# ── AI APIs ────────────────────────────────────────────────────────────────
GEMINI_API_KEY=
ANTHROPIC_API_KEY=

# ── Emails ─────────────────────────────────────────────────────────────────
RESEND_API_KEY=
EMAIL_FROM=noreply@ianovatechsystems.com
EMAIL_FROM_NAME=AuditMind

# ── Internos ───────────────────────────────────────────────────────────────
AI_SERVICE_INTERNAL_KEY=auditmind-internal-2026-xK9mP3qR

# ── URLs públicas (VPS) ────────────────────────────────────────────────────
NEXT_PUBLIC_API_URL=https://auditoria.ianovatechsystems.com/api/v1
NEXT_PUBLIC_SUPABASE_URL=https://[PROJECT_REF].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_PORTAL_URL=https://auditoria.ianovatechsystems.com/portal
ENVTEMPLATE
  chown deploy:deploy "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "   IMPORTANTE: Rellena $ENV_FILE antes de correr deploy.sh"
fi

# ── 6. Nginx — instalar site config ───────────────────────────────────────
NGINX_CONF="/etc/nginx/sites-available/auditoria.ianovatechsystems.com"
echo "==> Copiando config de Nginx..."
cp "$REPO_DIR/deploy/nginx.auditoria.ianovatechsystems.com.conf" "$NGINX_CONF"

if [ ! -L "/etc/nginx/sites-enabled/auditoria.ianovatechsystems.com" ]; then
  ln -s "$NGINX_CONF" "/etc/nginx/sites-enabled/auditoria.ianovatechsystems.com"
fi

nginx -t
systemctl reload nginx
echo "   Nginx OK"

# ── 7. Certificado SSL ────────────────────────────────────────────────────
echo ""
echo "==> Para generar el certificado SSL, correr (como root):"
echo "    certbot --nginx -d auditoria.ianovatechsystems.com"
echo ""

# ── 8. Primer deploy ──────────────────────────────────────────────────────
echo "==> Para hacer el primer deploy, una vez .env esté completo:"
echo "    su deploy -c 'cd $REPO_DIR && ./deploy/deploy.sh'"
echo ""
echo "==> Setup inicial completado."
