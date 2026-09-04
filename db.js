// AQUAZEN - Capa de base de datos
// Local: SQLite nativo. Vercel: Postgres (Neon) vía DATABASE_URL.
'use strict';
require('dotenv').config();
const bcrypt = require('bcryptjs');

const DATABASE_URL = process.env.DATABASE_URL || '';
const usePostgres = Boolean(DATABASE_URL);

let sqliteDb = null;
let neonSql = null;
let ready = null;

function toPostgresSql(sql) {
  let i = 0;
  return sql
    .replace(/datetime\('now'\)/gi, 'NOW()')
    .replace(/\bINSERT OR IGNORE INTO\b/gi, 'INSERT INTO')
    .replace(/\?/g, () => `$${++i}`);
}

async function pgQuery(sql, params) {
  if (typeof neonSql.query === 'function') {
    const rows = await neonSql.query(sql, params);
    return Array.isArray(rows) ? rows : (rows?.rows || []);
  }
  const rows = await neonSql(sql, params);
  return Array.isArray(rows) ? rows : (rows?.rows || []);
}

async function exec(sql, params = []) {
  if (usePostgres) {
    let pgSql = toPostgresSql(sql);
    if (/insert or ignore into service_categories/i.test(sql) && !/on conflict/i.test(pgSql)) {
      pgSql += ' ON CONFLICT (slug) DO NOTHING';
    }
    if (/^\s*insert\s+/i.test(sql.trim()) && !/\breturning\b/i.test(pgSql)) {
      pgSql += ' RETURNING *';
    }
    return pgQuery(pgSql, params);
  }
  const stmt = sqliteDb.prepare(sql);
  if (/^\s*select\b/i.test(sql.trim())) {
    return stmt.all(...params);
  }
  if (/^\s*insert\b/i.test(sql.trim())) {
    const result = stmt.run(...params);
    return [{ id: Number(result.lastInsertRowid), lastInsertRowid: Number(result.lastInsertRowid), changes: result.changes }];
  }
  const result = stmt.run(...params);
  return [{ changes: result.changes }];
}

const db = {
  prepare(sql) {
    return {
      async get(...params) {
        const rows = await exec(sql, params);
        return rows[0];
      },
      async all(...params) {
        return exec(sql, params);
      },
      async run(...params) {
        const rows = await exec(sql, params);
        const id = rows[0] && rows[0].id != null ? Number(rows[0].id) : undefined;
        return { lastInsertRowid: id, changes: rows[0]?.changes ?? rows.length, rows };
      },
    };
  },
};

async function getSetting(key, fallback) {
  const row = await db.prepare('SELECT value FROM settings WHERE "key" = ?').get(key);
  return row ? row.value : fallback;
}

async function setSetting(key, value) {
  await db.prepare(
    'INSERT INTO settings ("key", value) VALUES (?, ?) ON CONFLICT("key") DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

function sqliteSchema() {
  sqliteDb.exec(`
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
  rating REAL DEFAULT 5,
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
  "key" TEXT PRIMARY KEY,
  value TEXT
);
`);
}

async function postgresSchema() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS service_categories (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS services (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
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
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS products (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
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
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      service_id INTEGER,
      service_name TEXT,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_email TEXT,
      booking_date TEXT NOT NULL,
      booking_time TEXT NOT NULL,
      status TEXT DEFAULT 'pendiente',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS blocked_dates (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      date TEXT UNIQUE NOT NULL,
      reason TEXT,
      full_day INTEGER DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS testimonials (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      name TEXT NOT NULL,
      text TEXT NOT NULL,
      rating DOUBLE PRECISION DEFAULT 5,
      active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS gallery (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      image_data TEXT NOT NULL,
      caption TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      "key" TEXT PRIMARY KEY,
      value TEXT
    )`,
  ];
  for (const sql of statements) await pgQuery(sql, []);
  await pgQuery('ALTER TABLE testimonials ALTER COLUMN rating TYPE DOUBLE PRECISION', []);
}

async function seed() {
  const categories = [
    { slug: 'faciales', name: 'Faciales', sort_order: 1 },
    { slug: 'corporales', name: 'Corporales & Reductores', sort_order: 2 },
    { slug: 'relajacion', name: 'Relajación & Bienestar', sort_order: 3 },
    { slug: 'quiropraxia', name: 'Quiropraxia', sort_order: 4 },
  ];
  for (const c of categories) {
    await db.prepare(
      'INSERT OR IGNORE INTO service_categories (slug, name, sort_order) VALUES (?,?,?)'
    ).run(c.slug, c.name, c.sort_order);
  }

  const svcCount = (await db.prepare('SELECT COUNT(*) AS c FROM services').get()).c;
  if (Number(svcCount) === 0) {
    const insSvc = db.prepare(`INSERT INTO services
      (category_slug, name, short_description, long_description, price, price_max, duration_minutes, image_data, age_groups, active, featured, sort_order)
      VALUES (?,?,?,?,?,?,?,?,?,1,?,?)`);
    const services = [
      ['faciales', 'Limpieza Facial Profunda', 'Higienización, exfoliación, extracción y mascarilla nutritiva para una piel radiante.', 'Tratamiento estético completo enfocado en limpiar impurezas, células muertas, exceso de grasa y puntos negros. Incluye higienización, exfoliación, vaporización, extracción de impurezas y mascarilla calmante o nutritiva según tu tipo de piel (acné, resequedad, manchas o signos de envejecimiento).', 95000, 120000, 60, null, 'adolescentes,adultos-jovenes,adultos,adultos-mayores', 1, 1],
      ['faciales', 'Peeling Ultrasónico', 'Exfoliación profunda no invasiva con tecnología de ultrasonido para renovar la piel.', 'Tecnología de espátula ultrasónica que remueve células muertas, impurezas y exceso de sebo sin agredir la piel. Mejora la absorción de activos, deja la piel más luminosa y uniforme. Ideal como complemento de la limpieza facial o de forma independiente.', 120000, 140000, 45, null, 'adultos-jovenes,adultos,adultos-mayores', 0, 2],
      ['faciales', 'Facial LED + Alta Frecuencia', 'Terapia de luz LED y alta frecuencia para rejuvenecer, tonificar y controlar el acné.', 'Combinación de mascarilla LED (estimula colágeno y renovación celular) con alta frecuencia (efecto germicida, ideal para pieles con tendencia acneica). Un tratamiento no invasivo que potencia la luminosidad y firmeza de la piel.', 110000, 130000, 40, null, 'adolescentes,adultos-jovenes,adultos', 0, 3],
      ['corporales', 'Masaje Reductor Zona Media', 'Técnica manual intensa para reducir medidas y mejorar la circulación en abdomen.', 'Maniobras firmes y rítmicas enfocadas en abdomen que estimulan la circulación sanguínea y linfática, ayudando a la eliminación de grasa localizada y toxinas. Resultados progresivos con sesiones periódicas.', 150000, 180000, 45, null, 'adultos-jovenes,adultos', 0, 4],
      ['corporales', 'Masaje Reductor Zona Media + Piernas', 'Moldea abdomen y piernas en una sola sesión intensiva.', 'Ampliación del masaje reductor que trabaja abdomen, glúteos y piernas, favoreciendo la circulación, la reducción de medidas y la apariencia de la piel de naranja.', 210000, 220000, 60, null, 'adultos-jovenes,adultos', 1, 5],
      ['corporales', 'Masaje Reductor Total', 'Tratamiento corporal completo: abdomen, piernas, glúteos y brazos.', 'Sesión completa de moldeamiento corporal que abarca todas las zonas con acumulación de grasa. Estimula el sistema linfático y la circulación para una figura más definida.', 295000, 310000, 75, null, 'adultos-jovenes,adultos', 0, 6],
      ['corporales', 'Maderoterapia', 'Masaje con instrumentos de madera para moldear el cuerpo y activar la circulación.', 'Técnica ancestral que utiliza rodillos e instrumentos de madera para estimular la circulación, ayudar al drenaje y trabajar la apariencia de la celulitis. Complemento ideal de los masajes reductores.', 130000, 160000, 50, null, 'adultos-jovenes,adultos', 0, 7],
      ['corporales', 'Vacumterapia + Presoterapia', 'Aparatología avanzada para el drenaje linfático y el moldeamiento corporal.', 'Combinación de vacumterapia manual (estimula tejido y circulación) con presoterapia (drenaje por compresión), ideal para reducir hinchazón, mejorar la circulación y complementar los tratamientos reductores.', 140000, 170000, 40, null, 'adultos-jovenes,adultos,adultos-mayores', 0, 8],
      ['relajacion', 'Masaje Relajante Individual', 'Técnicas suaves con aceites esenciales para liberar tensión y renovar energía.', 'Masaje de cuerpo completo con movimientos suaves y armoniosos que ayudan a liberar tensiones musculares, reducir el estrés y mejorar la circulación. Un momento de desconexión total para equilibrar cuerpo y mente.', 190000, 200000, 60, null, 'ninos,adolescentes,adultos-jovenes,adultos,adultos-mayores', 1, 9],
      ['relajacion', 'Masaje Relajante en Pareja', 'Vive la experiencia AquaZen acompañado, en cabinas paralelas.', 'La misma experiencia de relajación profunda, pensada para disfrutar en pareja o con alguien especial, en sesiones simultáneas dentro de nuestro ambiente cálido y sensorial.', 225000, 240000, 60, null, 'adultos-jovenes,adultos,adultos-mayores', 0, 10],
      ['relajacion', 'Drenaje Linfático Manual', 'Estimulación suave y rítmica del sistema linfático para desinflamar y oxigenar la piel.', 'Técnica manual desarrollada para mejorar la retención de líquidos, favorecer la eliminación de toxinas y aportar luminosidad a la piel. Ideal post evento, post viaje o como parte de una rutina de bienestar.', 160000, 190000, 50, null, 'adultos-jovenes,adultos,adultos-mayores', 0, 11],
      ['relajacion', 'Masaje con Piedras Volcánicas', 'Calor terapéutico y masaje profundo para una relajación muscular total.', 'El calor de las piedras volcánicas se combina con maniobras de masaje profundo para liberar tensión muscular acumulada, mejorar la circulación y brindar una experiencia sensorial única.', 210000, 230000, 60, null, 'adultos-jovenes,adultos,adultos-mayores', 0, 12],
      ['quiropraxia', 'Ajuste Quiropráctico', 'Evaluación postural y ajuste manual para aliviar dolores cervicales, lumbares y de columna.', 'Sesión con profesional certificado en quiropraxia enfocada en el diagnóstico, tratamiento y prevención de trastornos del sistema musculoesquelético, especialmente de la columna vertebral. Mejora la postura, la movilidad y reduce el dolor crónico.', 140000, 170000, 40, null, 'adolescentes,adultos-jovenes,adultos,adultos-mayores', 1, 13],
      ['quiropraxia', 'Masaje + Ajuste Quiropráctico', 'La combinación perfecta: relajación muscular profunda + corrección postural.', 'Nuestro servicio insignia: une un masaje descontracturante con un ajuste quiropráctico profesional, potenciando los beneficios de ambas técnicas para tu salud física y tu bienestar emocional.', 275000, 300000, 60, null, 'adultos-jovenes,adultos,adultos-mayores', 1, 14],
      ['quiropraxia', 'Quiropraxia Pediátrica Suave', 'Evaluación y técnicas suaves adaptadas para niños y bebés.', 'Sesión adaptada a la anatomía y sensibilidad de niños y bebés, enfocada en prevención postural, alivio de tensión muscular leve y acompañamiento del crecimiento, siempre con profesionales certificados.', 110000, 130000, 30, null, 'ninos', 0, 15],
      ['quiropraxia', 'Evaluación Postural Integral', 'Valoración inicial de columna y postura, punto de partida de tu plan personalizado.', 'Evaluación completa del estado físico y postural que permite diseñar un plan de tratamiento personalizado, combinando estética y quiropraxia según tu edad y necesidades.', 60000, 60000, 30, null, 'ninos,adolescentes,adultos-jovenes,adultos,adultos-mayores', 0, 16],
    ];
    for (const s of services) await insSvc.run(...s);
  }

  const prodCount = (await db.prepare('SELECT COUNT(*) AS c FROM products').get()).c;
  if (Number(prodCount) === 0) {
    const insProd = db.prepare(`INSERT INTO products
      (category, name, short_description, long_description, price, rating, image_data, stock, active, sort_order)
      VALUES (?,?,?,?,?,?,?,?,1,?)`);
    const products = [
      ['Cuidado Facial', 'Sérum Facial Hidratante AquaZen', 'Ácido hialurónico + vitamina E para una hidratación profunda y duradera.', 'Fórmula concentrada recomendada por nuestros especialistas para potenciar los resultados de tus tratamientos faciales en casa. Ideal para todo tipo de piel.', 68000, 5, null, 40, 1],
      ['Cuidado Facial', 'Crema Contorno de Ojos', 'Reduce ojeras y líneas de expresión con activos naturales.', 'Textura ligera de rápida absorción formulada para la piel delicada del contorno de ojos. Uso diario mañana y noche.', 54000, 4.5, null, 35, 2],
      ['Corporal', 'Aceite Esencial de Masaje Relajante', 'Mezcla de lavanda y manzanilla, el mismo que usamos en cabina.', 'El aceite corporal utilizado en nuestros masajes relajantes, ahora disponible para continuar tu ritual de bienestar en casa.', 45000, 5, null, 60, 3],
      ['Corporal', 'Crema Reafirmante Reductora', 'Fórmula anticelulítica que potencia los masajes moldeadores.', 'Complementa tus sesiones de masaje reductor con esta crema de uso diario, formulada con cafeína y centella asiática.', 72000, 4.5, null, 30, 4],
      ['Bienestar Postural', 'Cojín Ergonómico Cervical', 'Soporte recomendado por nuestro especialista en quiropraxia.', 'Cojín de memoria viscoelástica diseñado para mantener la alineación cervical durante el descanso, recomendado tras tus sesiones de quiropraxia.', 89000, 5, null, 20, 5],
      ['Bienestar Postural', 'Faja Postural Lumbar', 'Corrección postural para el día a día, recomendada por nuestros terapeutas.', 'Accesorio de uso diario que ayuda a mantener una postura correcta, ideal para quienes pasan muchas horas sentados o de pie.', 75000, 4.5, null, 25, 6],
      ['Aromaterapia', 'Vela Aromática AquaZen', 'Aroma zen para llevar la experiencia del spa a tu hogar.', 'Vela de cera natural con fragancia relajante, elaborada especialmente para AquaZen. Duración aproximada de 40 horas.', 38000, 5, null, 50, 7],
      ['Kits', 'Kit Ritual de Bienestar AquaZen', 'Sérum facial + aceite de masaje + vela aromática, en un set de regalo.', 'El set ideal para regalar o regalarte una experiencia AquaZen completa en casa. Incluye empaque especial.', 135000, 5, null, 15, 8],
    ];
    for (const p of products) await insProd.run(...p);
  }

  const testCount = (await db.prepare('SELECT COUNT(*) AS c FROM testimonials').get()).c;
  if (Number(testCount) === 0) {
    const insTest = db.prepare('INSERT INTO testimonials (name, text, rating, sort_order) VALUES (?,?,?,?)');
    const testimonials = [
      ['Daniela R.', 'La combinación de masaje con ajuste quiropráctico cambió por completo mi manejo del dolor de espalda. Atención cálida y muy profesional.', 5, 1],
      ['Camilo V.', 'Llevé a mi hijo a la sesión de postura y quedé impresionado con el cuidado y la paciencia del equipo. Totalmente recomendado para toda la familia.', 5, 2],
      ['Laura M.', 'La limpieza facial dejó mi piel increíble desde la primera sesión. El ambiente es tan relajante que ya es mi ritual mensual.', 5, 3],
      ['Andrés P.', 'Empecé con dolores lumbares por el trabajo en oficina y ahora los ajustes quiroprácticos son parte de mi rutina de bienestar.', 4.5, 4],
    ];
    for (const t of testimonials) await insTest.run(...t);
  }

  const adminExists = (await db.prepare('SELECT COUNT(*) AS c FROM admin_users').get()).c;
  if (Number(adminExists) === 0) {
    const username = process.env.ADMIN_USER || 'aquazen_admin';
    const password = process.env.ADMIN_PASS || 'AquaZen#2026';
    const hash = bcrypt.hashSync(password, 10);
    await db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run(username, hash);
    if (!process.env.VERCEL) {
      console.log(`[AQUAZEN] Usuario admin creado -> usuario: ${username} | contraseña: ${password}`);
    }
  }

  if (!(await getSetting('whatsapp_number', null))) await setSetting('whatsapp_number', '573174204778');
  if (!(await getSetting('business_name', null))) await setSetting('business_name', 'AQUAZEN Estética y Spa');
  if (!(await getSetting('business_hours_start', null))) await setSetting('business_hours_start', '09:00');
  if (!(await getSetting('business_hours_end', null))) await setSetting('business_hours_end', '18:00');
  if (!(await getSetting('slot_interval_minutes', null))) await setSetting('slot_interval_minutes', '30');
  if (!(await getSetting('working_days', null))) await setSetting('working_days', '1,2,3,4,5,6');
}

async function init() {
  if (ready) return ready;
  ready = (async () => {
    if (usePostgres) {
      const { neon } = require('@neondatabase/serverless');
      const url = DATABASE_URL.replace(/&?channel_binding=require/, '');
      neonSql = neon(url);
      await postgresSchema();
    } else {
      if (process.env.VERCEL) {
        throw new Error('En Vercel hace falta DATABASE_URL (Postgres/Neon). SQLite no funciona en serverless.');
      }
      const fs = require('fs');
      const path = require('path');
      const { DatabaseSync } = require('node:sqlite');
      const DATA_DIR = path.join(__dirname, 'data');
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      sqliteDb = new DatabaseSync(path.join(DATA_DIR, 'aquazen.db'));
      sqliteDb.exec('PRAGMA journal_mode = WAL;');
      sqliteDb.exec('PRAGMA foreign_keys = ON;');
      sqliteSchema();
    }
    await seed();
  })();
  return ready;
}

module.exports = { db, getSetting, setSetting, init };
