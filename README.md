# AquaZen — Estética y Spa

Sitio web completo para AquaZen: página pública con catálogo de servicios y productos, sistema de reservas en tiempo real, y panel de administración para gestionar todo el contenido y el calendario.

Aplicación full-stack real (no una maqueta): backend en Node.js/Express, base de datos SQLite, autenticación de administrador con JWT. Está lista para funcionar en tu computador y para desplegarse en un hosting con Node.js.

## Qué incluye

- **Página pública** (`/`): inicio, sección "Qué es AquaZen" (misión/visión), catálogo de servicios por categoría (faciales, corporales, relajación, quiropraxia), planes por grupo de edad, sistema de reservas con calendario de disponibilidad real, catálogo de productos, sección de pedido personalizado, galería, testimonios y contacto. Botones de WhatsApp en toda la página con mensajes prellenados según la sección.
- **Sistema de reservas**: el cliente elige un servicio y una fecha, ve los horarios realmente disponibles (calculados según el horario del negocio, la duración del servicio, las reservas ya existentes y los días/fechas bloqueados), reserva y recibe un enlace de WhatsApp para confirmar.
- **Panel de administración** (`/admin`): panel general con estadísticas, gestión de servicios (crear/editar/eliminar, imágenes, precios, duración, grupos de edad, destacado/activo), gestión de productos, calendario de reservas (ver por día, cambiar estado, eliminar, bloquear/desbloquear fechas), testimonios, galería y configuración del negocio (WhatsApp, horario, días de atención, contraseña de acceso).

El contenido de servicios y productos (16 servicios, 8 productos, textos de misión/visión) se generó a partir de la investigación de mercado y la teoría del documento de formulación del problema que compartiste, enfocándose únicamente en servicios virtuales/de atención (sin presupuestos de local físico, planos ni estudios de ubicación). Todo esto es editable desde el panel de administración.

## Requisitos

- **Node.js 22.5 o superior** (usa el módulo nativo `node:sqlite`, todavía experimental). Verifica tu versión con `node -v`.
- No necesitas instalar ninguna base de datos aparte: SQLite se crea automáticamente como un archivo local.

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

## Poner el sitio en línea (dominio público)

Este proyecto es una aplicación Node.js con estado (base de datos SQLite en disco), así que necesita un hosting que mantenga un servidor corriendo — no sirve un hosting de archivos estáticos. Opciones sencillas y económicas:

1. **Railway** o **Render**: conecta el repositorio, configura la variable `JWT_SECRET` (y opcionalmente `ADMIN_USER`/`ADMIN_PASS`), y el comando de arranque `npm start`. Ambos ofrecen disco persistente para que la base de datos SQLite no se borre entre despliegues (revisa la sección de "persistent disk/volume" del servicio).
2. **VPS propio** (DigitalOcean, Hetzner, etc.): instala Node 22+, sube estos archivos, corre `npm install && npm start` detrás de un proceso administrador como `pm2`, y usa Nginx como proxy inverso con tu dominio y HTTPS (por ejemplo con Certbot).

En cualquier caso, antes de publicar:

- Define un `JWT_SECRET` propio y largo en las variables de entorno de producción (no dejes el valor de ejemplo).
- Cambia la contraseña del panel admin.
- Haz respaldos periódicos del archivo `data/aquazen.db`.

## Notas técnicas

- El backend usa el módulo nativo `node:sqlite` (por eso el flag `--experimental-sqlite` en el script de arranque) para evitar dependencias nativas que requieren compilación.
- Las imágenes que subas desde el panel (servicios, productos, galería) se guardan directamente en la base de datos como texto (base64), así que no necesitas configurar almacenamiento de archivos aparte.
- La autenticación del panel usa JWT con contraseñas cifradas (bcrypt); el token se guarda en el navegador y expira automáticamente.
