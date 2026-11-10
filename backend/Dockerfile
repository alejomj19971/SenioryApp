# Imagen de producción de la API de Seniory (M10). Tres etapas: compilar, instalar solo las dependencias de
# producción y armar la imagen final, que no trae compilador, ni pruebas, ni código fuente, ni .env.
#
# La versión de Node es la misma de .nvmrc (una prueba/CI lo vigila). «slim» (glibc) y no «alpine» (musl): el
# paquete de argon2 trae binarios nativos y los de glibc son los que más se prueban.

ARG NODE_VERSION=24.22.1

# ── 1. Compilar ─────────────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-slim AS compilacion
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ── 2. Dependencias de producción ───────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-slim AS dependencias
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ── 3. Imagen final ─────────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencias /app/node_modules ./node_modules
COPY --from=compilacion /app/dist ./dist
COPY package.json ./
# Las migraciones viajan con la imagen: el despliegue las aplica con
#   node dist/compartido/infraestructura/base-de-datos/migrar-cli.js
COPY drizzle ./drizzle

# El almacén LOCAL de archivos (desarrollo y staging, ALMACEN_DE_ARCHIVOS=local) escribe aquí en tiempo de
# ejecución. WORKDIR la crea como root; sin este chown, el usuario sin privilegios de abajo no podría
# escribir ni un solo archivo (el valor por defecto de DIRECTORIO_DE_ARCHIVOS es «./archivos-locales»: si se
# cambia esa variable, esta carpeta debe coincidir).
RUN mkdir -p archivos-locales && chown node:node archivos-locales

# Sin privilegios: si alguien explota una falla de la API, no es root en el contenedor.
USER node
EXPOSE 3001

# El proceso está vivo (la preparación —que la base responda— la mira el monitor en /salud/listo).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PUERTO ?? 3001) + '/salud').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["node", "dist/main"]
