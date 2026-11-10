# Imagen del frontend (Next.js) para Cloud Run. Se construye con Cloud Build: no requiere Docker local.
# Las URL de la API se toman de .env.production, que escribe desplegar-cloud-run.ps1 antes de construir.

# ─── Dependencias ────────────────────────────────────────────────────────────
FROM node:22-slim AS dependencias
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# ─── Compilación ─────────────────────────────────────────────────────────────
FROM node:22-slim AS compilacion
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencias /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ─── Ejecución ───────────────────────────────────────────────────────────────
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0
COPY --from=compilacion /app/.next/standalone ./
COPY --from=compilacion /app/.next/static ./.next/static
EXPOSE 8080
USER node
CMD ["node", "server.js"]
