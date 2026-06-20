# Despliegue de OpenFactu en Dokploy

Esta guía explica cómo desplegar OpenFactu en un VPS usando [Dokploy](https://dokploy.com/).

## Requisitos previos

- Un servidor VPS con Ubuntu 22.04/24.04 o Debian 12
- Docker y Docker Compose instalados
- Dokploy instalado en el VPS
- Un dominio apuntando al VPS (opcional pero recomendado)

## 1. Preparar el servidor

```bash
# Actualizar el sistema
sudo apt update && sudo apt upgrade -y

# Instalar Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Instalar Dokploy
curl -sSL https://dokploy.com/install.sh | sh
```

Accede a la UI de Dokploy en `http://<IP_DEL_VPS>:3000` y completa el setup inicial.

## 2. Crear el proyecto en Dokploy

1. En la UI de Dokploy, crea un nuevo **Project** llamado `openfactu`
2. Dentro del proyecto, crea una nueva **Application**
3. Selecciona **Git** como fuente y conecta tu repo de GitHub/GitLab
4. Selecciona la rama `main` (o `dev` para pre-producción)

## 3. Configurar variables de entorno

En la pestaña **Environment** de la aplicación en Dokploy, añade:

```env
# Base de datos
POSTGRES_USER=openfactu
POSTGRES_PASSWORD=tu_password_seguro_aqui
POSTGRES_DB=openfactudb
DATABASE_URL=postgresql://openfactu:tu_password_seguro_aqui@db:5432/openfactudb

# Servidor
SERVER_PORT=3000
WEB_PORT=8080
NODE_ENV=production
CORS_ORIGIN=https://tu-dominio.com

# Monitoreo (opcional)
PGADMIN_PORT=5050
PGADMIN_EMAIL=admin@openfactu.local
PGADMIN_PASSWORD=admin
GRAFANA_PORT=3001
GRAFANA_USER=admin
GRAFANA_PASSWORD=admin
PROMETHEUS_PORT=9090
PORTAINER_PORT=9000
```

> **Nota:** En Dokploy, las variables se inyectan automáticamente en todos los contenedores del compose.

## 4. Configurar Docker Compose

En la pestaña **Docker Compose**, Dokploy detectará automáticamente tu `docker-compose.yml`. Si quieres incluir monitoreo, sube también el `docker-compose.monitoring.yml` y usa el modo **Multiple Compose Files**.

O bien, usa un solo `docker-compose.yml` combinado para producción.

## 5. Volúmenes persistentes

En Dokploy, configura los siguientes **Volumes** para persistencia de datos:

| Volumen (host) | Contenedor | Descripción |
|----------------|------------|-------------|
| `./storage/db_data` | `/var/lib/postgresql/data` | Base de datos PostgreSQL |
| `./storage/plugins` | `/app/plugins` | Plugins de OpenFactu |
| `./storage/grafana_data` | `/var/lib/grafana` | Dashboards de Grafana |
| `./storage/prometheus_data` | `/prometheus` | Datos de Prometheus |
| `./storage/pgadmin_data` | `/var/lib/pgadmin` | Configuración de pgAdmin |
| `./storage/portainer_data` | `/data` | Datos de Portainer |

## 6. Dominio y SSL

1. Ve a la pestaña **Domains** de tu aplicación
2. Añade tu dominio (ej: `erp.tuempresa.com`)
3. Activa **HTTPS** — Dokploy gestionará automáticamente los certificados con Let's Encrypt

## 7. Desplegar

Haz clic en **Deploy** en Dokploy. El build puede tardar 5-10 minutos la primera vez.

## 8. Primer acceso

- **Web:** `https://tu-dominio.com`
- **API:** `https://tu-dominio.com/api`
- **Grafana:** `https://tu-dominio.com:3001` (o configura un subdominio)
- **pgAdmin:** `https://tu-dominio.com:5050`
- **Portainer:** `https://tu-dominio.com:9000`

## 9. Comandos útiles

```bash
# Ver logs desde el VPS
sudo docker logs -f openfactu-server-1

# Backup de la base de datos
sudo docker exec openfactu-db-1 pg_dump -U openfactu openfactudb > backup.sql

# Restaurar backup
sudo docker exec -i openfactu-db-1 psql -U openfactu openfactudb < backup.sql
```

## Troubleshooting

| Problema | Solución |
|----------|----------|
| Build falla por memoria | Aumenta swap: `sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile` |
| Puerto ya en uso | Cambia el puerto en las variables de entorno de Dokploy |
| No se conecta a la BD | Verifica que `DATABASE_URL` use `db` como hostname, no `localhost` |
| Grafana sin datos | Verifica que Prometheus esté accesible desde Grafana (`http://prometheus:9090`) |

## Arquitectura en Dokploy

```
┌─────────────────────────────────────────┐
│              Dokploy Proxy              │
│         (Traefik / Nginx)               │
│         SSL + Routing                   │
└─────────────────────────────────────────┘
                   │
     ┌─────────────┼─────────────┐
     ▼             ▼             ▼
┌─────────┐  ┌─────────┐  ┌──────────┐
│  Web    │  │ Server  │  │  DB      │
│ (nginx) │  │(Express)│  │(Postgres)│
└─────────┘  └─────────┘  └──────────┘
     │             │
     ▼             ▼
┌──────────────────────────────────────┐
│        Stack de Monitoreo            │
│  Grafana + Prometheus + Loki         │
│  pgAdmin + Portainer                 │
└──────────────────────────────────────┘
```
