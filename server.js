// AQUAZEN - Servidor principal (Express + SQLite local / Postgres en Vercel)
'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, getSetting, setSetting, init } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'aquazen-dev-secret-change-me-in-production';

const wrap = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

app.use(cors());
app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, 'public')));

let dbReady;
function ensureDb(req, res, next) {
  if (!dbReady) dbReady = init();
  dbReady.then(() => next()).catch(next);
}
app.use(ensureDb);

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}

app.get('/api/health', (req, res) => {
  const cloud = Boolean(process.env.DATABASE_URL || (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY));
  res.json({ ok: true, db: cloud ? 'postgres' : 'sqlite' });
});

app.post('/api/admin/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  const user = await db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, username: user.username });
}));

app.post('/api/admin/change-password', requireAdmin, wrap(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const user = await db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.admin.id);
  if (!user || !bcrypt.compareSync(currentPassword || '', user.password_hash)) {
    return res.status(401).json({ error: 'Contraseña actual incorrecta' });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  await db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(hash, user.id);
  res.json({ ok: true });
}));

app.get('/api/services', wrap(async (req, res) => {
  res.json(await db.prepare('SELECT * FROM services WHERE active = 1 ORDER BY sort_order ASC, id ASC').all());
}));

app.get('/api/service-categories', wrap(async (req, res) => {
  res.json(await db.prepare('SELECT * FROM service_categories ORDER BY sort_order ASC').all());
}));

app.get('/api/products', wrap(async (req, res) => {
  res.json(await db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY sort_order ASC, id ASC').all());
}));

app.get('/api/testimonials', wrap(async (req, res) => {
  res.json(await db.prepare('SELECT * FROM testimonials WHERE active = 1 ORDER BY sort_order ASC, id ASC').all());
}));

app.get('/api/gallery', wrap(async (req, res) => {
  res.json(await db.prepare('SELECT * FROM gallery ORDER BY sort_order ASC, id DESC').all());
}));

app.get('/api/settings', wrap(async (req, res) => {
  res.json({
    whatsapp_number: await getSetting('whatsapp_number', '573174204778'),
    business_name: await getSetting('business_name', 'AQUAZEN Estética y Spa'),
    business_hours_start: await getSetting('business_hours_start', '09:00'),
    business_hours_end: await getSetting('business_hours_end', '18:00'),
    working_days: await getSetting('working_days', '1,2,3,4,5,6'),
  });
}));

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function minutesToTime(mins) {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

app.get('/api/availability', wrap(async (req, res) => {
  const { date, serviceId } = req.query;
  if (!date) return res.status(400).json({ error: 'Fecha requerida (YYYY-MM-DD)' });

  const workingDays = (await getSetting('working_days', '1,2,3,4,5,6')).split(',').map(Number);
  const dow = new Date(date + 'T12:00:00').getDay();
  if (!workingDays.includes(dow)) {
    return res.json({ date, available: false, reason: 'cerrado', slots: [] });
  }

  const blocked = await db.prepare('SELECT * FROM blocked_dates WHERE date = ?').get(date);
  if (blocked && blocked.full_day) {
    return res.json({ date, available: false, reason: blocked.reason || 'fecha no disponible', slots: [] });
  }

  const hoursStart = timeToMinutes(await getSetting('business_hours_start', '09:00'));
  const hoursEnd = timeToMinutes(await getSetting('business_hours_end', '18:00'));
  const interval = Number(await getSetting('slot_interval_minutes', '30'));

  let duration = interval;
  if (serviceId) {
    const svc = await db.prepare('SELECT duration_minutes FROM services WHERE id = ?').get(serviceId);
    if (svc) duration = svc.duration_minutes;
  }

  const existingBookings = await db
    .prepare("SELECT booking_time, service_id FROM bookings WHERE booking_date = ? AND status != 'cancelada'")
    .all(date);

  const bookedRanges = [];
  for (const b of existingBookings) {
    const start = timeToMinutes(b.booking_time);
    let dur = interval;
    if (b.service_id) {
      const svc = await db.prepare('SELECT duration_minutes FROM services WHERE id = ?').get(b.service_id);
      if (svc) dur = svc.duration_minutes;
    }
    bookedRanges.push({ start, end: start + dur });
  }

  const now = new Date();
  const isToday = date === now.toISOString().slice(0, 10);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const slots = [];
  for (let t = hoursStart; t + duration <= hoursEnd; t += interval) {
    if (isToday && t <= nowMinutes + 30) continue;
    const overlaps = bookedRanges.some((r) => t < r.end && t + duration > r.start);
    if (!overlaps) slots.push(minutesToTime(t));
  }

  res.json({ date, available: slots.length > 0, slots });
}));

app.post('/api/bookings', wrap(async (req, res) => {
  const { serviceId, customerName, customerPhone, customerEmail, date, time, notes } = req.body || {};
  if (!customerName || !customerPhone || !date || !time) {
    return res.status(400).json({ error: 'Faltan datos obligatorios (nombre, teléfono, fecha, hora)' });
  }

  let serviceName = null;
  if (serviceId) {
    const svc = await db.prepare('SELECT name FROM services WHERE id = ?').get(serviceId);
    if (svc) serviceName = svc.name;
  }

  const result = await db.prepare(`INSERT INTO bookings
    (service_id, service_name, customer_name, customer_phone, customer_email, booking_date, booking_time, notes, status)
    VALUES (?,?,?,?,?,?,?,?,'pendiente')`).run(
    serviceId || null,
    serviceName,
    customerName,
    customerPhone,
    customerEmail || null,
    date,
    time,
    notes || null
  );

  const whatsapp = await getSetting('whatsapp_number', '573174204778');
  const msg = `Hola AQUAZEN! Quiero confirmar mi reserva:%0A- Servicio: ${serviceName || 'Por definir'}%0A- Fecha: ${date}%0A- Hora: ${time}%0A- Nombre: ${customerName}%0A- Teléfono: ${customerPhone}`;
  const whatsappUrl = `https://wa.me/${whatsapp}?text=${msg}`;

  res.status(201).json({ id: result.lastInsertRowid, status: 'pendiente', whatsappUrl });
}));

app.get('/api/admin/services', requireAdmin, wrap(async (req, res) => {
  res.json(await db.prepare('SELECT * FROM services ORDER BY sort_order ASC, id ASC').all());
}));

app.post('/api/admin/services', requireAdmin, wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.category_slug || b.price == null || !b.duration_minutes) {
    return res.status(400).json({ error: 'Nombre, categoría, precio y duración son obligatorios' });
  }
  const result = await db.prepare(`INSERT INTO services
    (category_slug,name,short_description,long_description,price,price_max,duration_minutes,image_data,age_groups,active,featured,sort_order)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    b.category_slug, b.name, b.short_description || '', b.long_description || '',
    b.price, b.price_max || b.price, b.duration_minutes, b.image_data || null,
    b.age_groups || '', b.active === false ? 0 : 1, b.featured ? 1 : 0, b.sort_order || 0
  );
  res.status(201).json(await db.prepare('SELECT * FROM services WHERE id = ?').get(result.lastInsertRowid));
}));

app.put('/api/admin/services/:id', requireAdmin, wrap(async (req, res) => {
  const existing = await db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Servicio no encontrado' });
  const b = req.body || {};
  const merged = { ...existing, ...b };
  await db.prepare(`UPDATE services SET
      category_slug=?, name=?, short_description=?, long_description=?, price=?, price_max=?,
      duration_minutes=?, image_data=?, age_groups=?, active=?, featured=?, sort_order=?, updated_at=datetime('now')
    WHERE id=?`).run(
    merged.category_slug, merged.name, merged.short_description, merged.long_description,
    merged.price, merged.price_max, merged.duration_minutes, merged.image_data, merged.age_groups,
    merged.active ? 1 : 0, merged.featured ? 1 : 0, merged.sort_order, req.params.id
  );
  res.json(await db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id));
}));

app.delete('/api/admin/services/:id', requireAdmin, wrap(async (req, res) => {
  await db.prepare('DELETE FROM services WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

app.get('/api/admin/products', requireAdmin, wrap(async (req, res) => {
  res.json(await db.prepare('SELECT * FROM products ORDER BY sort_order ASC, id ASC').all());
}));

app.post('/api/admin/products', requireAdmin, wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.category || b.price == null) {
    return res.status(400).json({ error: 'Nombre, categoría y precio son obligatorios' });
  }
  const result = await db.prepare(`INSERT INTO products
    (category,name,short_description,long_description,price,rating,image_data,stock,active,sort_order)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    b.category, b.name, b.short_description || '', b.long_description || '',
    b.price, b.rating || 5, b.image_data || null, b.stock ?? 999,
    b.active === false ? 0 : 1, b.sort_order || 0
  );
  res.status(201).json(await db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid));
}));

app.put('/api/admin/products/:id', requireAdmin, wrap(async (req, res) => {
  const existing = await db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Producto no encontrado' });
  const b = req.body || {};
  const merged = { ...existing, ...b };
  await db.prepare(`UPDATE products SET
      category=?, name=?, short_description=?, long_description=?, price=?, rating=?,
      image_data=?, stock=?, active=?, sort_order=?, updated_at=datetime('now')
    WHERE id=?`).run(
    merged.category, merged.name, merged.short_description, merged.long_description,
    merged.price, merged.rating, merged.image_data, merged.stock,
    merged.active ? 1 : 0, merged.sort_order, req.params.id
  );
  res.json(await db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id));
}));

app.delete('/api/admin/products/:id', requireAdmin, wrap(async (req, res) => {
  await db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

app.get('/api/admin/bookings', requireAdmin, wrap(async (req, res) => {
  const { from, to, status } = req.query;
  let query = 'SELECT * FROM bookings WHERE 1=1';
  const params = [];
  if (from) { query += ' AND booking_date >= ?'; params.push(from); }
  if (to) { query += ' AND booking_date <= ?'; params.push(to); }
  if (status) { query += ' AND status = ?'; params.push(status); }
  query += ' ORDER BY booking_date ASC, booking_time ASC';
  res.json(await db.prepare(query).all(...params));
}));

app.put('/api/admin/bookings/:id', requireAdmin, wrap(async (req, res) => {
  const existing = await db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Reserva no encontrada' });
  const b = req.body || {};
  await db.prepare(`UPDATE bookings SET
      status = COALESCE(?, status),
      notes = COALESCE(?, notes),
      booking_date = COALESCE(?, booking_date),
      booking_time = COALESCE(?, booking_time)
    WHERE id = ?`).run(
    b.status ?? null, b.notes ?? null, b.booking_date ?? null, b.booking_time ?? null, req.params.id
  );
  res.json(await db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id));
}));

app.delete('/api/admin/bookings/:id', requireAdmin, wrap(async (req, res) => {
  await db.prepare('DELETE FROM bookings WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

app.get('/api/admin/blocked-dates', requireAdmin, wrap(async (req, res) => {
  res.json(await db.prepare('SELECT * FROM blocked_dates ORDER BY date ASC').all());
}));

app.post('/api/admin/blocked-dates', requireAdmin, wrap(async (req, res) => {
  const { date, reason } = req.body || {};
  if (!date) return res.status(400).json({ error: 'Fecha requerida' });
  await db.prepare(
    'INSERT INTO blocked_dates (date, reason, full_day) VALUES (?,?,1) ON CONFLICT (date) DO UPDATE SET reason = excluded.reason'
  ).run(date, reason || 'No disponible');
  res.status(201).json(await db.prepare('SELECT * FROM blocked_dates WHERE date = ?').get(date));
}));

app.delete('/api/admin/blocked-dates/:id', requireAdmin, wrap(async (req, res) => {
  await db.prepare('DELETE FROM blocked_dates WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

app.get('/api/admin/testimonials', requireAdmin, wrap(async (req, res) => {
  res.json(await db.prepare('SELECT * FROM testimonials ORDER BY sort_order ASC, id ASC').all());
}));

app.post('/api/admin/testimonials', requireAdmin, wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.text) return res.status(400).json({ error: 'Nombre y texto son obligatorios' });
  const result = await db.prepare(
    'INSERT INTO testimonials (name, text, rating, active, sort_order) VALUES (?,?,?,?,?)'
  ).run(b.name, b.text, b.rating || 5, b.active === false ? 0 : 1, b.sort_order || 0);
  res.status(201).json(await db.prepare('SELECT * FROM testimonials WHERE id = ?').get(result.lastInsertRowid));
}));

app.put('/api/admin/testimonials/:id', requireAdmin, wrap(async (req, res) => {
  const existing = await db.prepare('SELECT * FROM testimonials WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'No encontrado' });
  const merged = { ...existing, ...req.body };
  await db.prepare('UPDATE testimonials SET name=?, text=?, rating=?, active=?, sort_order=? WHERE id=?').run(
    merged.name, merged.text, merged.rating, merged.active ? 1 : 0, merged.sort_order, req.params.id
  );
  res.json(await db.prepare('SELECT * FROM testimonials WHERE id = ?').get(req.params.id));
}));

app.delete('/api/admin/testimonials/:id', requireAdmin, wrap(async (req, res) => {
  await db.prepare('DELETE FROM testimonials WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

app.get('/api/admin/gallery', requireAdmin, wrap(async (req, res) => {
  res.json(await db.prepare('SELECT * FROM gallery ORDER BY sort_order ASC, id DESC').all());
}));

app.post('/api/admin/gallery', requireAdmin, wrap(async (req, res) => {
  const { image_data, caption, sort_order } = req.body || {};
  if (!image_data) return res.status(400).json({ error: 'Imagen requerida' });
  const result = await db.prepare('INSERT INTO gallery (image_data, caption, sort_order) VALUES (?,?,?)').run(
    image_data, caption || '', sort_order || 0
  );
  res.status(201).json(await db.prepare('SELECT * FROM gallery WHERE id = ?').get(result.lastInsertRowid));
}));

app.delete('/api/admin/gallery/:id', requireAdmin, wrap(async (req, res) => {
  await db.prepare('DELETE FROM gallery WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

app.get('/api/admin/settings', requireAdmin, wrap(async (req, res) => {
  const rows = await db.prepare('SELECT * FROM settings').all();
  const obj = {};
  rows.forEach((r) => { obj[r.key] = r.value; });
  res.json(obj);
}));

app.put('/api/admin/settings', requireAdmin, wrap(async (req, res) => {
  const b = req.body || {};
  await Promise.all(Object.keys(b).map((key) => setSetting(key, b[key])));
  res.json({ ok: true });
}));

app.get('/api/admin/summary', requireAdmin, wrap(async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const totalServices = Number((await db.prepare('SELECT COUNT(*) AS c FROM services WHERE active=1').get()).c);
  const totalProducts = Number((await db.prepare('SELECT COUNT(*) AS c FROM products WHERE active=1').get()).c);
  const bookingsToday = Number((await db.prepare("SELECT COUNT(*) AS c FROM bookings WHERE booking_date=? AND status!='cancelada'").get(today)).c);
  const bookingsPending = Number((await db.prepare("SELECT COUNT(*) AS c FROM bookings WHERE status='pendiente'").get()).c);
  const upcoming = await db.prepare("SELECT * FROM bookings WHERE booking_date >= ? AND status != 'cancelada' ORDER BY booking_date ASC, booking_time ASC LIMIT 8").all(today);
  res.json({ totalServices, totalProducts, bookingsToday, bookingsPending, upcoming });
}));

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.use((err, req, res, next) => {
  console.error('[AQUAZEN]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: err.message || 'Error interno' });
});

if (!process.env.VERCEL) {
  dbReady = init();
  dbReady.then(() => {
    app.listen(PORT, () => {
      console.log(`\n=== AQUAZEN Estética y Spa ===`);
      console.log(`Servidor corriendo en http://localhost:${PORT}`);
      console.log(`Panel admin en http://localhost:${PORT}/admin\n`);
    });
  }).catch((err) => {
    console.error('[AQUAZEN] No se pudo iniciar:', err);
    process.exit(1);
  });
}

module.exports = app;
