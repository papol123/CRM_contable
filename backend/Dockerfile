# Imagen del backend para Cloud Run (se construye con Cloud Build: no requiere Docker local)

# ─── Compilación ─────────────────────────────────────────────────────────────
FROM node:22-slim AS compilacion
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ─── Ejecución ───────────────────────────────────────────────────────────────
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=compilacion /app/dist ./dist

# Cloud Run inyecta PORT (8080 por defecto)
ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "dist/main.js"]
