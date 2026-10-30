FROM node:20-alpine AS builder

ARG VITE_API_URL=http://localhost:3000

WORKDIR /app
COPY package*.json ./
COPY apps/web ./apps/web
# El motor de formularios es compartido con el servidor (alias @forms-engine en vite.config.ts).
COPY apps/server/src/core/forms/engine.ts ./apps/server/src/core/forms/engine.ts

RUN npm install

ENV VITE_API_URL=$VITE_API_URL
WORKDIR /app/apps/web
RUN npm run build

FROM nginx:alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
