# Cola de impresión en Postgres (migrada desde Upstash/Redis)

Runbook completo: `App_etiquetas/deploy/postgres/MIGRACION-DESDE-REDIS.md`.

## Levantar (servidor propio, Docker)

```bash
# copiar esta carpeta al servidor y:
./setup.sh          # genera password + certs TLS y levanta contenedores-db (puerto 5436)
ufw allow 5436/tcp  # + firewall del proveedor (Linode Cloud Firewall) si aplica
```

Aislamiento: Odoo usa 5432, etiquetas-db 5433, despachos-db 5434, mia-test-db 5435, **esta BD usa 5436**.
Verifica que esté libre: `ss -lntp | grep 5436`.

### Alternativa: reusar el contenedor de App Etiquetas

Si etiquetas-db ya corre en el servidor, en vez de otro contenedor puedes crear
BD + usuario dentro de él (y usar puerto 5433 en la URL):

```bash
docker compose -f /ruta/a/etiquetas/docker-compose.yml exec etiquetas-db \
  psql -U etiquetas -c "CREATE USER contenedores PASSWORD '...';" \
       -c "CREATE DATABASE contenedores OWNER contenedores;"
# luego correr init/01-schema.sql conectado a esa BD como `contenedores`
```

## Vercel

1. `DATABASE_URL = postgres://contenedores:PASS@IP:5436/contenedores?sslmode=require`
2. **Redeploy** (las variables se congelan en el build — sin redeploy no hace nada).
3. Verificar backend activo: `POST /api/print/jobs?debug=1` con `x-pull-token`
   debe responder `{ "store": "postgres", ... }`. Si dice `kv`, falta redeploy.
4. Con todo verificado, borrar `KV_REST_API_URL` / `KV_REST_API_TOKEN`.

## Operación

```bash
docker compose ps
docker compose logs -f contenedores-db

# pendientes
docker compose exec contenedores-db psql -U contenedores -d contenedores -c \
  "SELECT count(*) FILTER (WHERE tomado_en IS NULL) AS pendientes, count(*) AS total FROM print_jobs;"

# backup
docker compose exec -T contenedores-db pg_dump -U contenedores contenedores | gzip > backup_$(date +%F).sql.gz

# purga del histórico
docker compose exec contenedores-db psql -U contenedores -d contenedores -c \
  "DELETE FROM print_jobs WHERE tomado_en IS NOT NULL AND creado_en < now() - interval '30 days';"
```
