#!/usr/bin/env bash
# Publica el backend del CRM Contable en Cloud Run desde Cloud Shell (o cualquier
# terminal con gcloud). Construye la imagen en Cloud Build y la conecta a Cloud SQL.
#
#   bash desplegar-cloud-run.sh [PROJECT_ID]
#
# Variables opcionales: REGION (us-east1), SERVICIO (crm-contable-api),
# INSTANCIA_SQL (crm-contable-db), BUCKET, FRONTEND_URL, MIN_INSTANCIAS (0),
# DB_USER (crm_admin), DB_NAME (crm_contable).
set -euo pipefail

PROJECT_ID="${1:-$(gcloud config get-value project 2>/dev/null)}"
[ -n "$PROJECT_ID" ] || { echo "Indique el proyecto: bash desplegar-cloud-run.sh ID-DEL-PROYECTO"; exit 1; }
REGION="${REGION:-us-east1}"
SERVICIO="${SERVICIO:-crm-contable-api}"
INSTANCIA_SQL="${INSTANCIA_SQL:-crm-contable-db}"
BUCKET="${BUCKET:-$PROJECT_ID-crm-adjuntos}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3001}"
MIN_INSTANCIAS="${MIN_INSTANCIAS:-0}"
DB_USER="${DB_USER:-crm_admin}"
DB_NAME="${DB_NAME:-crm_contable}"

paso() { printf '\n\033[36m==> %s\033[0m\n' "$1"; }
cd "$(dirname "$0")"

paso "Proyecto $PROJECT_ID y APIs necesarias"
gcloud config set project "$PROJECT_ID" >/dev/null
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  sqladmin.googleapis.com secretmanager.googleapis.com storage.googleapis.com

CONEXION_SQL="$(gcloud sql instances describe "$INSTANCIA_SQL" --format='value(connectionName)')"
echo "Cloud SQL: $CONEXION_SQL"
NUMERO_PROYECTO="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
CUENTA="$NUMERO_PROYECTO-compute@developer.gserviceaccount.com"

# ─── Secret Manager ──────────────────────────────────────────────────────────
guardar_secreto() {
  local nombre="$1" pregunta="$2" generar="${3:-}"
  if ! gcloud secrets describe "$nombre" >/dev/null 2>&1; then
    local valor=""
    if [ -n "$generar" ]; then
      valor="$(openssl rand -base64 48 | tr -d '\n')"
      echo "Secreto $nombre generado aleatoriamente"
    else
      read -rsp "$pregunta: " valor; echo
      [ -n "$valor" ] || { echo "El valor no puede estar vacío"; exit 1; }
    fi
    printf '%s' "$valor" | gcloud secrets create "$nombre" --replication-policy=automatic --data-file=-
  else
    echo "Secreto $nombre ya existe (se reutiliza)"
  fi
  gcloud secrets add-iam-policy-binding "$nombre" --member="serviceAccount:$CUENTA" \
    --role=roles/secretmanager.secretAccessor --quiet >/dev/null
}

paso "Secretos"
guardar_secreto crm-db-password "Contraseña de la base ($DB_USER en Cloud SQL, la de DB_PASSWORD de su .env)"
guardar_secreto crm-jwt-secret "" generar
SECRETOS="DB_PASSWORD=crm-db-password:latest,JWT_SECRET=crm-jwt-secret:latest"
if gcloud secrets describe crm-smtp-password >/dev/null 2>&1; then
  gcloud secrets add-iam-policy-binding crm-smtp-password --member="serviceAccount:$CUENTA" \
    --role=roles/secretmanager.secretAccessor --quiet >/dev/null
  SECRETOS="$SECRETOS,SMTP_PASSWORD=crm-smtp-password:latest"
fi

# ─── Cloud Storage y permisos ────────────────────────────────────────────────
paso "Bucket gs://$BUCKET"
if ! gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://$BUCKET" --location="$REGION" --uniform-bucket-level-access --public-access-prevention
fi
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$CUENTA" \
  --role=roles/storage.objectAdmin >/dev/null
for ROL in roles/cloudsql.client roles/cloudsql.editor; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$CUENTA" \
    --role="$ROL" --condition=None --quiet >/dev/null
done

# ─── Despliegue ──────────────────────────────────────────────────────────────
paso "Construyendo y desplegando $SERVICIO en $REGION (tarda unos minutos)"
VARIABLES="^@^NODE_ENV=production@DB_HOST=/cloudsql/$CONEXION_SQL@DB_PORT=5432@DB_USER=$DB_USER@DB_NAME=$DB_NAME@DB_SSL=false"
VARIABLES="$VARIABLES@JWT_EXPIRATION=15m@REFRESH_TOKEN_EXPIRATION_DAYS=7@FRONTEND_URL=$FRONTEND_URL@APP_TIMEZONE=America/Bogota"
VARIABLES="$VARIABLES@TRUST_PROXY_HOPS=1@STORAGE_DRIVER=gcs@GCP_STORAGE_BUCKET_NAME=$BUCKET@GCP_PROJECT_ID=$PROJECT_ID"
VARIABLES="$VARIABLES@CLOUD_SQL_INSTANCE=$INSTANCIA_SQL@JOBS_WORKER=true"

gcloud run deploy "$SERVICIO" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --add-cloudsql-instances "$CONEXION_SQL" \
  --set-env-vars "$VARIABLES" \
  --set-secrets "$SECRETOS" \
  --no-cpu-throttling \
  --min-instances "$MIN_INSTANCIAS" \
  --memory 1Gi \
  --timeout 300

URL="$(gcloud run services describe "$SERVICIO" --region "$REGION" --format='value(status.url)')"

paso "Verificando"
curl -s "$URL/api/v1/health/ready"; echo

paso "Listo"
echo "API:     $URL/api/v1"
echo "Swagger: $URL/api/docs"
echo "En Bruno: entorno 'Cloud Run' → baseUrl = $URL/api/v1"
