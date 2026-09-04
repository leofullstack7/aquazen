# AquaZen — Estética y Spa

Sitio web completo para AquaZen: página pública con catálogo de servicios y productos, sistema de reservas en tiempo real, y panel de administración para gestionar todo el contenido y el calendario.

Aplicación full-stack real (no una maqueta): backend en Node.js/Express, SQLite en local o Postgres en **Supabase** en producción, autenticación de administrador con JWT.

## Qué incluye

- **Página pública** (`/`): inicio, sección "Qué es AquaZen" (misión/visión), catálogo de servicios por categoría (faciales, corporales, relajación, quiropraxia), planes por grupo de edad, sistema de reservas con calendario de disponibilidad real, catálogo de productos, sección de pedido personalizado, galería, testimonios y contacto. Botones de WhatsApp en toda la página con mensajes prellenados según la sección.
- **Sistema de reservas**: el cliente elige un servicio y una fecha, ve los horarios realmente disponibles (calculados según el horario del negocio, la duración del servicio, las reservas ya existentes y los días/fechas bloqueados), reserva y recibe un enlace de WhatsApp para confirmar.
- **Panel de administración** (`/admin`): panel general con estadísticas, gestión de servicios (crear/editar/eliminar, imágenes, precios, duración, grupos de edad, destacado/activo), gestión de productos, calendario de reservas (ver por día, cambiar estado, eliminar, bloquear/desbloquear fechas), testimonios, galería y configuración del negocio (WhatsApp, horario, días de atención, contraseña de acceso).

El contenido de servicios y productos (16 servicios, 8 productos, textos de misión/visión) se generó a partir de la investigación de mercado y la teoría del documento de formulación del problema que compartiste, enfocándose únicamente en servicios virtuales/de atención (sin presupuestos de local físico, planos ni estudios de ubicación). Todo esto es editable desde el panel de administración.

## Requisitos

- **Node.js 22.5 o superior** (usa el módulo nativo `node:sqlite`, todavía experimental). Verifica tu versión con `node -v`.
- En local, sin `DATABASE_URL` ni claves de Supabase, SQLite se crea automáticamente como un archivo en `data/`.

## Instalación y uso local

```bash
# 1. Instalar dependencias
npm install

# 2. (Opcional) copiar el archivo de variables de entorno y ajustarlo
cp .env.example .env

# 3. Iniciar el servidor
npm start
```

Luego abre:

- Sitio público: **http://localhost:3000**
- Panel admin: **http://localhost:3000/admin**

La primera vez que arranca, el servidor crea la base de datos en `data/aquazen.db` y la llena con el contenido inicial (servicios, productos, testimonios) y un usuario administrador.

## Acceso al panel de administración

Usuario y contraseña por defecto (se crean solo la primera vez que arranca el servidor):

- **Usuario:** `aquazen_admin`
- **Contraseña:** `AquaZen#2026`

**Recomendado:** cambia esta contraseña apenas entres, desde *Configuración → Cambiar contraseña* dentro del panel. También puedes definir credenciales distintas desde el inicio poniendo `ADMIN_USER` y `ADMIN_PASS` en tu archivo `.env` **antes** de arrancar el servidor por primera vez (una vez que la base de datos ya existe, esos valores del `.env` ya no tienen efecto — el cambio de contraseña se hace desde el panel).

## Configuración del negocio

Desde *Configuración* en el panel admin puedes cambiar en cualquier momento:

- Número de WhatsApp (por defecto `573174204778`, es decir +57 317 420 4778)
- Horario de apertura y cierre
- Días de atención
- Intervalo entre turnos de reserva

## Estructura del proyecto

```
aquazen/
├── server.js           # Servidor Express y todas las rutas de la API
├── db.js                # Esquema de la base de datos y datos iniciales (seed)
├── package.json
├── .env.example          # Plantilla de variables de entorno
├── data/                 # Aquí se crea aquazen.db (no se incluye en el paquete)
└── public/
    ├── index.html         # Página pública
    ├── admin.html          # Panel de administración
    ├── css/
    │   ├── styles.css        # Estilos del sitio público
    │   └── admin.css          # Estilos del panel admin
    ├── js/
    │   ├── main.js             # Lógica del sitio público (catálogo, reservas, modales)
    │   └── admin.js             # Lógica del panel admin (CRUD, calendario)
    └── img/
        └── logo_final.png        # Logo de AquaZen (fondo removido)
```

## Poner el sitio en línea (Vercel)

Vercel no puede usar SQLite en disco: cada función serverless es efímera. En producción la app usa **Postgres de Supabase**. El backend Express sigue siendo la única puerta a la base (no se usa Supabase Auth ni RLS en el cliente).

En el proyecto de Vercel (Settings → Environment Variables) define:

- `DATABASE_URL` — URI del **pooler** de Supabase (puerto `6543`, `sslmode=require`), **o**
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — alternativa si no tienes la URI de Postgres
- `JWT_SECRET` — cadena larga y aleatoria
- `ADMIN_USER` / `ADMIN_PASS` — opcional; solo aplican la primera vez que se crea la base

Luego vuelve a desplegar. El sitio público queda en `/` y el panel en `/admin`.

Otras opciones si no usas Vercel:

1. **Railway** o **Render**: conecta el repositorio. Puedes usar `DATABASE_URL` (Postgres) o SQLite con disco persistente.
2. **VPS propio**: Node 22+, `npm install && npm start` con `pm2` y Nginx + HTTPS.

Antes de publicar: cambia la contraseña del panel admin y no dejes el `JWT_SECRET` de ejemplo.

## Notas técnicas

- En local, sin `DATABASE_URL` ni claves de Supabase, el backend usa `node:sqlite` (por eso `--experimental-sqlite` en `npm start`).
- En Vercel usa el paquete `postgres` contra el pooler de **Supabase**, o `@supabase/supabase-js` si configuras `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
- Las imágenes del panel se guardan en la base como texto (base64). El límite de body en Vercel es ~4 MB.
- La autenticación del panel usa JWT con contraseñas cifradas (bcrypt).
