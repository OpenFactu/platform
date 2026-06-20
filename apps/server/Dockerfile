FROM node:20-alpine

# Install postgresql-client for pg_dump (tenant export)
RUN apk add --no-cache postgresql-client

WORKDIR /app

# 0. Chromium del sistema para Puppeteer (render de PDFs vía @openfactu/pdf).
#    En Alpine el Chrome bundleado que descarga Puppeteer es build glibc y no
#    arranca (musl) -> "spawn .../chrome-linux64/chrome ENOENT". Usamos el
#    chromium de Alpine, saltamos la descarga bundleada y apuntamos Puppeteer
#    a él. @openfactu/pdf llama a launch() sin executablePath y ya pasa
#    --no-sandbox, así que respeta PUPPETEER_EXECUTABLE_PATH y corre como root.
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# 1. Copiar manifiestos y server
COPY package*.json ./
COPY apps/server ./apps/server

# 2. Instalar dependencias (incluye @openfactu/* desde npm)
RUN npm install

# 3. Compilar el servidor
WORKDIR /app/apps/server
RUN npm run build

# 4. Copiar assets no-TS a dist/. `tsc` solo compila TS y deja fuera:
#   - .sql de migraciones (sin esto el MigrationManager no aplica nada y el
#     tenant queda sin tablas).
#   - geo.json y .xlsx en seed-data/ (sin esto seedGeo no carga países y el
#     selector del wizard de setup sale vacío).
RUN mkdir -p dist/core/tenant/migrations dist/seed-data \
    && cp src/core/tenant/migrations/*.sql dist/core/tenant/migrations/ \
    && cp src/seed-data/* dist/seed-data/ \
    && echo "[Dockerfile] Copiadas $(ls -1 dist/core/tenant/migrations | wc -l) migraciones y $(ls -1 dist/seed-data | wc -l) assets de seed."

# 5. Ejecutar
CMD ["npm", "start"]
