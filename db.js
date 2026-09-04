// AQUAZEN - Capa de base de datos (SQLite nativo de Node, sin dependencias binarias)
'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'aquazen.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// ---------- ESQUEMA ----------
db.exec(`
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS service_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  short_description TEXT,
  long_description TEXT,
  price INTEGER NOT NULL,
  price_max INTEGER,
  duration_minutes INTEGER NOT NULL,
  image_data TEXT,
  age_groups TEXT,
  active INTEGER DEFAULT 1,
  featured INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  short_description TEXT,
  long_description TEXT,
  price INTEGER NOT NULL,
  rating REAL DEFAULT 5,
  image_data TEXT,
  stock INTEGER DEFAULT 999,
  active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id INTEGER,
  service_name TEXT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  booking_date TEXT NOT NULL,
  booking_time TEXT NOT NULL,
  status TEXT DEFAULT 'pendiente',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (service_id) REFERENCES services(id)
);

CREATE TABLE IF NOT EXISTS blocked_dates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT UNIQUE NOT NULL,
  reason TEXT,
  full_day INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS testimonials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  text TEXT NOT NULL,
  rating INTEGER DEFAULT 5,
  active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gallery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image_data TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

// ---------- HELPERS ----------
function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}
function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

// ---------- SEED (solo si la base esta vacia) ----------
function seed() {
  const svcCount = db.prepare('SELECT COUNT(*) AS c FROM services').get().c;

  // Categorias de servicio
  const categories = [
    { slug: 'faciales', name: 'Faciales', sort_order: 1 },
    { slug: 'corporales', name: 'Corporales & Reductores', sort_order: 2 },
    { slug: 'relajacion', name: 'Relajación & Bienestar', sort_order: 3 },
    { slug: 'quiropraxia', name: 'Quiropraxia', sort_order: 4 },
  ];
  const insCat = db.prepare(
    'INSERT OR IGNORE INTO service_categories (slug, name, sort_order) VALUES (?,?,?)'
  );
  for (const c of categories) insCat.run(c.slug, c.name, c.sort_order);

  if (svcCount === 0) {
    const insSvc = db.prepare(`INSERT INTO services
      (category_slug, name, short_description, long_description, price, price_max, duration_minutes, image_data, age_groups, active, featured, sort_order)
      VALUES (@category_slug,@name,@short_description,@long_description,@price,@price_max,@duration_minutes,@image_data,@age_groups,1,@featured,@sort_order)`);

    const services = [
      {
        category_slug: 'faciales',
        name: 'Limpieza Facial Profunda',
        short_description: 'Higienización, exfoliación, extracción y mascarilla nutritiva para una piel radiante.',
        long_description: 'Tratamiento estético completo enfocado en limpiar impurezas, células muertas, exceso de grasa y puntos negros. Incluye higienización, exfoliación, vaporización, extracción de impurezas y mascarilla calmante o nutritiva según tu tipo de piel (acné, resequedad, manchas o signos de envejecimiento).',
        price: 95000, price_max: 120000, duration_minutes: 60,
        image_data: null, age_groups: 'adolescentes,adultos-jovenes,adultos,adultos-mayores', featured: 1, sort_order: 1,
      },
      {
        category_slug: 'faciales',
        name: 'Peeling Ultrasónico',
        short_description: 'Exfoliación profunda no invasiva con tecnología de ultrasonido para renovar la piel.',
        long_description: 'Tecnología de espátula ultrasónica que remueve células muertas, impurezas y exceso de sebo sin agredir la piel. Mejora la absorción de activos, deja la piel más luminosa y uniforme. Ideal como complemento de la limpieza facial o de forma independiente.',
        price: 120000, price_max: 140000, duration_minutes: 45,
        image_data: null, age_groups: 'adultos-jovenes,adultos,adultos-mayores', featured: 0, sort_order: 2,
      },
      {
        category_slug: 'faciales',
        name: 'Facial LED + Alta Frecuencia',
        short_description: 'Terapia de luz LED y alta frecuencia para rejuvenecer, tonificar y controlar el acné.',
        long_description: 'Combinación de mascarilla LED (estimula colágeno y renovación celular) con alta frecuencia (efecto germicida, ideal para pieles con tendencia acneica). Un tratamiento no invasivo que potencia la luminosidad y firmeza de la piel.',
        price: 110000, price_max: 130000, duration_minutes: 40,
        image_data: null, age_groups: 'adolescentes,adultos-jovenes,adultos', featured: 0, sort_order: 3,
      },
      {
        category_slug: 'corporales',
        name: 'Masaje Reductor Zona Media',
        short_description: 'Técnica manual intensa para reducir medidas y mejorar la circulación en abdomen.',
        long_description: 'Maniobras firmes y rítmicas enfocadas en abdomen que estimulan la circulación sanguínea y linfática, ayudando a la eliminación de grasa localizada y toxinas. Resultados progresivos con sesiones periódicas.',
        price: 150000, price_max: 180000, duration_minutes: 45,
        image_data: null, age_groups: 'adultos-jovenes,adultos', featured: 0, sort_order: 4,
      },
      {
        category_slug: 'corporales',
        name: 'Masaje Reductor Zona Media + Piernas',
        short_description: 'Moldea abdomen y piernas en una sola sesión intensiva.',
        long_description: 'Ampliación del masaje reductor que trabaja abdomen, glúteos y piernas, favoreciendo la circulación, la reducción de medidas y la apariencia de la piel de naranja.',
        price: 210000, price_max: 220000, duration_minutes: 60,
        image_data: null, age_groups: 'adultos-jovenes,adultos', featured: 1, sort_order: 5,
      },
      {
        category_slug: 'corporales',
        name: 'Masaje Reductor Total',
        short_description: 'Tratamiento corporal completo: abdomen, piernas, glúteos y brazos.',
        long_description: 'Sesión completa de moldeamiento corporal que abarca todas las zonas con acumulación de grasa. Estimula el sistema linfático y la circulación para una figura más definida.',
        price: 295000, price_max: 310000, duration_minutes: 75,
        image_data: null, age_groups: 'adultos-jovenes,adultos', featured: 0, sort_order: 6,
      },
      {
        category_slug: 'corporales',
        name: 'Maderoterapia',
        short_description: 'Masaje con instrumentos de madera para moldear el cuerpo y activar la circulación.',
        long_description: 'Técnica ancestral que utiliza rodillos e instrumentos de madera para estimular la circulación, ayudar al drenaje y trabajar la apariencia de la celulitis. Complemento ideal de los masajes reductores.',
        price: 130000, price_max: 160000, duration_minutes: 50,
        image_data: null, age_groups: 'adultos-jovenes,adultos', featured: 0, sort_order: 7,
      },
      {
        category_slug: 'corporales',
        name: 'Vacumterapia + Presoterapia',
        short_description: 'Aparatología avanzada para el drenaje linfático y el moldeamiento corporal.',
        long_description: 'Combinación de vacumterapia manual (estimula tejido y circulación) con presoterapia (drenaje por compresión), ideal para reducir hinchazón, mejorar la circulación y complementar los tratamientos reductores.',
        price: 140000, price_max: 170000, duration_minutes: 40,
        image_data: null, age_groups: 'adultos-jovenes,adultos,adultos-mayores', featured: 0, sort_order: 8,
      },
      {
        category_slug: 'relajacion',
        name: 'Masaje Relajante Individual',
        short_description: 'Técnicas suaves con aceites esenciales para liberar tensión y renovar energía.',
        long_description: 'Masaje de cuerpo completo con movimientos suaves y armoniosos que ayudan a liberar tensiones musculares, reducir el estrés y mejorar la circulación. Un momento de desconexión total para equilibrar cuerpo y mente.',
        price: 190000, price_max: 200000, duration_minutes: 60,
        image_data: null, age_groups: 'ninos,adolescentes,adultos-jovenes,adultos,adultos-mayores', featured: 1, sort_order: 9,
      },
      {
        category_slug: 'relajacion',
        name: 'Masaje Relajante en Pareja',
        short_description: 'Vive la experiencia AquaZen acompañado, en cabinas paralelas.',
        long_description: 'La misma experiencia de relajación profunda, pensada para disfrutar en pareja o con alguien especial, en sesiones simultáneas dentro de nuestro ambiente cálido y sensorial.',
        price: 225000, price_max: 240000, duration_minutes: 60,
        image_data: null, age_groups: 'adultos-jovenes,adultos,adultos-mayores', featured: 0, sort_order: 10,
      },
      {
        category_slug: 'relajacion',
        name: 'Drenaje Linfático Manual',
        short_description: 'Estimulación suave y rítmica del sistema linfático para desinflamar y oxigenar la piel.',
        long_description: 'Técnica manual desarrollada para mejorar la retención de líquidos, favorecer la eliminación de toxinas y aportar luminosidad a la piel. Ideal post evento, post viaje o como parte de una rutina de bienestar.',
        price: 160000, price_max: 190000, duration_minutes: 50,
        image_data: null, age_groups: 'adultos-jovenes,adultos,adultos-mayores', featured: 0, sort_order: 11,
      },
      {
        category_slug: 'relajacion',
        name: 'Masaje con Piedras Volcánicas',
        short_description: 'Calor terapéutico y masaje profundo para una relajación muscular total.',
        long_description: 'El calor de las piedras volcánicas se combina con maniobras de masaje profundo para liberar tensión muscular acumulada, mejorar la circulación y brindar una experiencia sensorial única.',
        price: 210000, price_max: 230000, duration_minutes: 60,
        image_data: null, age_groups: 'adultos-jovenes,adultos,adultos-mayores', featured: 0, sort_order: 12,
      },
      {
        category_slug: 'quiropraxia',
        name: 'Ajuste Quiropráctico',
        short_description: 'Evaluación postural y ajuste manual para aliviar dolores cervicales, lumbares y de columna.',
        long_description: 'Sesión con profesional certificado en quiropraxia enfocada en el diagnóstico, tratamiento y prevención de trastornos del sistema musculoesquelético, especialmente de la columna vertebral. Mejora la postura, la movilidad y reduce el dolor crónico.',
        price: 140000, price_max: 170000, duration_minutes: 40,
        image_data: null, age_groups: 'adolescentes,adultos-jovenes,adultos,adultos-mayores', featured: 1, sort_order: 13,
      },
      {
        category_slug: 'quiropraxia',
        name: 'Masaje + Ajuste Quiropráctico',
        short_description: 'La combinación perfecta: relajación muscular profunda + corrección postural.',
        long_description: 'Nuestro servicio insignia: une un masaje descontracturante con un ajuste quiropráctico profesional, potenciando los beneficios de ambas técnicas para tu salud física y tu bienestar emocional.',
        price: 275000, price_max: 300000, duration_minutes: 60,
        image_data: null, age_groups: 'adultos-jovenes,adultos,adultos-mayores', featured: 1, sort_order: 14,
      },
      {
        category_slug: 'quiropraxia',
        name: 'Quiropraxia Pediátrica Suave',
        short_description: 'Evaluación y técnicas suaves adaptadas para niños y bebés.',
        long_description: 'Sesión adaptada a la anatomía y sensibilidad de niños y bebés, enfocada en prevención postural, alivio de tensión muscular leve y acompañamiento del crecimiento, siempre con profesionales certificados.',
        price: 110000, price_max: 130000, duration_minutes: 30,
        image_data: null, age_groups: 'ninos', featured: 0, sort_order: 15,
      },
      {
        category_slug: 'quiropraxia',
        name: 'Evaluación Postural Integral',
        short_description: 'Valoración inicial de columna y postura, punto de partida de tu plan personalizado.',
        long_description: 'Evaluación completa del estado físico y postural que permite diseñar un plan de tratamiento personalizado, combinando estética y quiropraxia según tu edad y necesidades.',
        price: 60000, price_max: 60000, duration_minutes: 30,
        image_data: null, age_groups: 'ninos,adolescentes,adultos-jovenes,adultos,adultos-mayores', featured: 0, sort_order: 16,
      },
    ];
    for (const s of services) insSvc.run(s);
  }

  const prodCount = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
  if (prodCount === 0) {
    const insProd = db.prepare(`INSERT INTO products
      (category, name, short_description, long_description, price, rating, image_data, stock, active, sort_order)
      VALUES (@category,@name,@short_description,@long_description,@price,@rating,@image_data,@stock,1,@sort_order)`);

    const products = [
      {
        category: 'Cuidado Facial',
        name: 'Sérum Facial Hidratante AquaZen',
        short_description: 'Ácido hialurónico + vitamina E para una hidratación profunda y duradera.',
        long_description: 'Fórmula concentrada recomendada por nuestros especialistas para potenciar los resultados de tus tratamientos faciales en casa. Ideal para todo tipo de piel.',
        price: 68000, rating: 5, image_data: null, stock: 40, sort_order: 1,
      },
      {
        category: 'Cuidado Facial',
        name: 'Crema Contorno de Ojos',
        short_description: 'Reduce ojeras y líneas de expresión con activos naturales.',
        long_description: 'Textura ligera de rápida absorción formulada para la piel delicada del contorno de ojos. Uso diario mañana y noche.',
        price: 54000, rating: 4.5, image_data: null, stock: 35, sort_order: 2,
      },
      {
        category: 'Corporal',
        name: 'Aceite Esencial de Masaje Relajante',
        short_description: 'Mezcla de lavanda y manzanilla, el mismo que usamos en cabina.',
        long_description: 'El aceite corporal utilizado en nuestros masajes relajantes, ahora disponible para continuar tu ritual de bienestar en casa.',
        price: 45000, rating: 5, image_data: null, stock: 60, sort_order: 3,
      },
      {
        category: 'Corporal',
        name: 'Crema Reafirmante Reductora',
        short_description: 'Fórmula anticelulítica que potencia los masajes moldeadores.',
        long_description: 'Complementa tus sesiones de masaje reductor con esta crema de uso diario, formulada con cafeína y centella asiática.',
        price: 72000, rating: 4.5, image_data: null, stock: 30, sort_order: 4,
      },
      {
        category: 'Bienestar Postural',
        name: 'Cojín Ergonómico Cervical',
        short_description: 'Soporte recomendado por nuestro especialista en quiropraxia.',
        long_description: 'Cojín de memoria viscoelástica diseñado para mantener la alineación cervical durante el descanso, recomendado tras tus sesiones de quiropraxia.',
        price: 89000, rating: 5, image_data: null, stock: 20, sort_order: 5,
      },
      {
        category: 'Bienestar Postural',
        name: 'Faja Postural Lumbar',
        short_description: 'Corrección postural para el día a día, recomendada por nuestros terapeutas.',
        long_description: 'Accesorio de uso diario que ayuda a mantener una postura correcta, ideal para quienes pasan muchas horas sentados o de pie.',
        price: 75000, rating: 4.5, image_data: null, stock: 25, sort_order: 6,
      },
      {
        category: 'Aromaterapia',
        name: 'Vela Aromática AquaZen',
        short_description: 'Aroma zen para llevar la experiencia del spa a tu hogar.',
        long_description: 'Vela de cera natural con fragancia relajante, elaborada especialmente para AquaZen. Duración aproximada de 40 horas.',
        price: 38000, rating: 5, image_data: null, stock: 50, sort_order: 7,
      },
      {
        category: 'Kits',
        name: 'Kit Ritual de Bienestar AquaZen',
        short_description: 'Sérum facial + aceite de masaje + vela aromática, en un set de regalo.',
        long_description: 'El set ideal para regalar o regalarte una experiencia AquaZen completa en casa. Incluye empaque especial.',
        price: 135000, rating: 5, image_data: null, stock: 15, sort_order: 8,
      },
    ];
    for (const p of products) insProd.run(p);
  }

  const testCount = db.prepare('SELECT COUNT(*) AS c FROM testimonials').get().c;
  if (testCount === 0) {
    const insTest = db.prepare(
      'INSERT INTO testimonials (name, text, rating, sort_order) VALUES (?,?,?,?)'
    );
    const testimonials = [
      ['Daniela R.', 'La combinación de masaje con ajuste quiropráctico cambió por completo mi manejo del dolor de espalda. Atención cálida y muy profesional.', 5, 1],
      ['Camilo V.', 'Llevé a mi hijo a la sesión de postura y quedé impresionado con el cuidado y la paciencia del equipo. Totalmente recomendado para toda la familia.', 5, 2],
      ['Laura M.', 'La limpieza facial dejó mi piel increíble desde la primera sesión. El ambiente es tan relajante que ya es mi ritual mensual.', 5, 3],
      ['Andrés P.', 'Empecé con dolores lumbares por el trabajo en oficina y ahora los ajustes quiroprácticos son parte de mi rutina de bienestar.', 4.5, 4],
    ];
    for (const t of testimonials) insTest.run(...t);
  }

  // Admin por defecto
  const adminExists = db.prepare('SELECT COUNT(*) AS c FROM admin_users').get().c;
  if (adminExists === 0) {
    const username = process.env.ADMIN_USER || 'aquazen_admin';
    const password = process.env.ADMIN_PASS || 'AquaZen#2026';
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run(username, hash);
    console.log(`[AQUAZEN] Usuario admin creado -> usuario: ${username} | contraseña: ${password}`);
    console.log('[AQUAZEN] Puedes cambiar estas credenciales luego desde variables de entorno o directamente en la base de datos.');
  }

  // Configuracion inicial
  if (!getSetting('whatsapp_number', null)) setSetting('whatsapp_number', '573174204778');
  if (!getSetting('business_name', null)) setSetting('business_name', 'AQUAZEN Estética y Spa');
  if (!getSetting('business_hours_start', null)) setSetting('business_hours_start', '09:00');
  if (!getSetting('business_hours_end', null)) setSetting('business_hours_end', '18:00');
  if (!getSetting('slot_interval_minutes', null)) setSetting('slot_interval_minutes', '30');
  if (!getSetting('working_days', null)) setSetting('working_days', '1,2,3,4,5,6'); // 0=domingo ... 6=sabado (cerrado domingo)
}

seed();

module.exports = { db, getSetting, setSetting };
