#!/usr/bin/env bash
# Levanta el Postgres de Ingreso Contenedores en Docker. Idempotente: si ya
# existe .env reutiliza la password (no la regenera, para no romper la app).
#
# NO toca el Postgres de Odoo (5432) ni el de App Etiquetas (5433): contenedor,
# volumen, BD y puerto (5436) propios. Verifica antes:  ss -lntp | grep 5436
set -euo pipefail
cd "$(dirname "$0")"

# --- 1. Password (se genera una vez y queda en .env, fuera de git) -----------
if [ ! -f .env ]; then
  echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" > .env
  chmod 600 .env
  echo "==> .env creado con password nueva"
else
  echo "==> .env ya existe, reutilizo la password"
fi
# shellcheck disable=SC1091
set -a; . ./.env; set +a

# --- 2. Certificado autofirmado para TLS ------------------------------------
# Postgres exige key con permisos 600 y dueño = usuario del contenedor (uid 70 en alpine).
if [ ! -f certs/server.key ]; then
  mkdir -p certs
  openssl req -new -x509 -days 3650 -nodes \
    -out certs/server.crt -keyout certs/server.key \
    -subj "/CN=contenedores-db" >/dev/null 2>&1
  chmod 600 certs/server.key
  chown 70:70 certs/server.key certs/server.crt 2>/dev/null || true
  echo "==> Certificado TLS autofirmado generado (10 años)"
else
  echo "==> Certificado TLS ya existe"
fi

# --- 3. Arranca el contenedor ----------------------------------------------
docker compose up -d
echo "==> Esperando a que Postgres acepte conexiones..."
for i in $(seq 1 30); do
  if docker compose exec -T contenedores-db pg_isready -U contenedores -d contenedores >/dev/null 2>&1; then
    echo "==> Postgres listo"
    break
  fi
  sleep 2
done

# --- 4. Cadena de conexion para Vercel --------------------------------------
IP="$(curl -s https://api.ipify.org || echo 'TU_IP')"
echo
echo "============================================================"
echo "DATABASE_URL para Vercel (Production):"
echo
echo "postgres://contenedores:${POSTGRES_PASSWORD}@${IP}:5436/contenedores?sslmode=require"
echo
echo "============================================================"
echo "Recuerda abrir el puerto 5436 en el firewall (ufw / Linode Cloud Firewall)."
