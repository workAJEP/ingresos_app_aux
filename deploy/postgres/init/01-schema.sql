-- Esquema de la cola de impresion de Ingreso Contenedores (reemplaza Upstash/Redis).
-- Se ejecuta UNA sola vez, cuando el volumen de datos se inicializa vacio.

-- Cola de trabajos de impresion. Un trabajo = un click de "Imprimir stickers".
-- `tomado_en IS NULL` => pendiente. El poller lo marca al drenarlo (equivalente
-- al RPOP atomico de Redis, usando FOR UPDATE SKIP LOCKED).
CREATE TABLE IF NOT EXISTS print_jobs (
  id        BIGSERIAL   PRIMARY KEY,
  tipo      TEXT        NOT NULL DEFAULT 'stickers',
  usuario   TEXT,
  filas     JSONB       NOT NULL,          -- las filas del CSV (rows)
  meta      JSONB,                         -- { by, departamento, rollos }
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  tomado_en TIMESTAMPTZ                    -- NULL = pendiente
);

-- Indice parcial: solo lo pendiente, que es lo unico que consulta el poller.
CREATE INDEX IF NOT EXISTS print_jobs_pendientes_idx
  ON print_jobs (tipo, id)
  WHERE tomado_en IS NULL;

-- Para la limpieza por antiguedad.
CREATE INDEX IF NOT EXISTS print_jobs_creado_en_idx ON print_jobs (creado_en);

-- Configuracion de la app (apartado Configuracion): pares clave/valor.
-- p.ej. api_key_externa = key generada por otra app para la conexion.
CREATE TABLE IF NOT EXISTS app_config (
  clave          TEXT        PRIMARY KEY,
  valor          TEXT        NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
