// AQUAZEN - Servidor principal (Express + SQLite nativo)
'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, getSetting, setSetting } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'aquazen-dev-secret-change-me-in-production';

app.use(cors());
app.use(express.json({ limit: '15mb' })); // suficiente para imagenes en base64
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// AUTH MIDDLEWARE
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// AUTH
// ---------------------------------------------------------------------------
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, username: user.username });
});

app.post('/api/admin/change-password', requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.admin.id);
  if (!user || !bcrypt.compareSync(currentPassword || '', user.password_hash)) {
    return res.status(401).json({ error: 'Contraseña actual incorrecta' });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(hash, user.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// PUBLICO: SERVICIOS
// ---------------------------------------------------------------------------
app.get('/api/services', (req, res) => {
  const rows = db.prepare('SELECT * FROM services WHERE active = 1 ORDER BY sort_order ASC, id ASC').all();
  res.json(rows);
});

app.get('/api/service-categories', (req, res) => {
  const rows = db.prepare('SELECT * FROM service_categories ORDER BY sort_order ASC').all();
  res.json(rows);
});

// ---------------------------------------------------------------------------
// PUBLICO: PRODUCTOS
// ---------------------------------------------------------------------------
app.get('/api/products', (req, res) => {
  const rows = db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY sort_order ASC, id ASC').all();
  res.json(rows);
});

// ---------------------------------------------------------------------------
// PUBLICO: TESTIMONIOS Y GALERIA
// ---------------------------------------------------------------------------
app.get('/api/testimonials', (req, res) => {
  const rows = db.prepare('SELECT * FROM testimonials WHERE active = 1 ORDER BY sort_order ASC, id ASC').all();
  res.json(rows);
});

app.get('/api/gallery', (req, res) => {
  const rows = db.prepare('SELECT * FROM gallery ORDER BY sort_order ASC, id DESC').all();
  res.json(rows);
});

// ---------------------------------------------------------------------------
// PUBLICO: CONFIGURACION (solo lo necesario para el frontend)
// ---------------------------------------------------------------------------
app.get('/api/settings', (req, res) => {
  res.json({
    whatsapp_number: getSetting('whatsapp_number', '573174204778'),
    business_name: getSetting('business_name', 'AQUAZEN Estética y Spa'),
    business_hours_start: getSetting('business_hours_start', '09:00'),
    business_hours_end: getSetting('business_hours_end', '18:00'),
    working_days: getSetting('working_days', '1,2,3,4,5,6'),
  });
});

// ---------------------------------------------------------------------------
// RESERVAS - DISPONIBILIDAD
// ---------------------------------------------------------------------------
function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function minutesToTime(mins) {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

app.get('/api/availability', (req, res) => {
  const { date, serviceId } = req.query;
  if (!date) return res.status(400).json({ error: 'Fecha requerida (YYYY-MM-DD)' });

  const workingDays = getSetting('working_days', '1,2,3,4,5,6').split(',').map(Number);
  const dow = new Date(date + 'T12:00:00').getDay();
  if (!workingDays.includes(dow)) {
    return res.json({ date, available: false, reason: 'cerrado', slots: [] });
  }

  const blocked = db.prepare('SELECT * FROM blocked_dates WHERE date = ?').get(date);
  if (blocked && blocked.full_day) {
    return res.json({ date, available: false, reason: blocked.reason || 'fecha no disponible', slots: [] });
  }

  const hoursStart = timeToMinutes(getSetting('business_hours_start', '09:00'));
  const hoursEnd = timeToMinutes(getSetting('business_hours_end', '18:00'));
  const interval = Number(getSetting('slot_interval_minutes', '30'));

  let duration = interval;
  if (serviceId) {
    const svc = db.prepare('SELECT duration_minutes FROM services WHERE id = ?').get(serviceId);
    if (svc) duration = svc.duration_minutes;
  }

  const existingBookings = db
    .prepare("SELECT booking_time, service_id FROM bookings WHERE booking_date = ? AND status != 'cancelada'")
    .all(date);

  const bookedRanges = existingBookings.map((b) => {
    const start = timeToMinutes(b.booking_time);
    let dur = interval;
    if (b.service_id) {
      const svc = db.prepare('SELECT duration_minutes FROM services WHERE id = ?').get(b.service_id);
      if (svc) dur = svc.duration_minutes;
    }
    return { start, end: start + dur };
  });

  const now = new Date();
  const isToday = date === now.toISOString().slice(0, 10);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const slots = [];
  for (let t = hoursStart; t + duration <= hoursEnd; t += interval) {
    if (isToday && t <= nowMinutes + 30) continue; // margen minimo de 30 min
    const overlaps = bookedRanges.some((r) => t < r.end && t + duration > r.start);
    if (!overlaps) slots.push(minutesToTime(t));
  }

  res.json({ date, available: slots.length > 0, slots });
});

// ---------------------------------------------------------------------------
// RESERVAS - CREAR
// ---------------------------------------------------------------------------
app.post('/api/bookings', (req, res) => {
  const { serviceId, customerName, customerPhone, customerEmail, date, time, notes } = req.body || {};
  if (!customerName || !customerPhone || !date || !time) {
    return res.status(400).json({ error: 'Faltan datos obligatorios (nombre, teléfono, fecha, hora)' });
  }

  let serviceName = null;
  if (serviceId) {
    const svc = db.prepare('SELECT name FROM services WHERE id = ?').get(serviceId);
    if (svc) serviceName = svc.name;
  }

  const stmt = db.prepare(`INSERT INTO bookings
    (service_id, service_name, customer_name, customer_phone, customer_email, booking_date, booking_time, notes, status)
    VALUES (?,?,?,?,?,?,?,?,'pendiente')`);
  const result = stmt.run(
    serviceId || null,
    serviceName,
    customerName,
    customerPhone,
    customerEmail || null,
    date,
    time,
    notes || null
  );

  const whatsapp = getSetting('whatsapp_number', '573174204778');
  const msg = `Hola AQUAZEN! Quiero confirmar mi reserva:%0A- Servicio: ${serviceName || 'Por definir'}%0A- Fecha: ${date}%0A- Hora: ${time}%0A- Nombre: ${customerName}%0A- Teléfono: ${customerPhone}`;
  const whatsappUrl = `https://wa.me/${whatsapp}?text=${msg}`;

  res.status(201).json({ id: result.lastInsertRowid, status: 'pendiente', whatsappUrl });
});

// ---------------------------------------------------------------------------
// ADMIN: SERVICIOS (CRUD)
// ---------------------------------------------------------------------------
app.get('/api/admin/services', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM services ORDER BY sort_order ASC, id ASC').all());
});

app.post('/api/admin/services', requireAdmin, (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.category_slug || b.price == null || !b.duration_minutes) {
    return res.status(400).json({ error: 'Nombre, categoría, precio y duración son obligatorios' });
  }
  const stmt = db.prepare(`INSERT INTO services
    (category_slug,name,short_description,long_description,price,price_max,duration_minutes,image_data,age_groups,active,featured,sort_order)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const result = stmt.run(
    b.category_slug, b.name, b.short_description || '', b.long_description || '',
    b.price, b.price_max || b.price, b.duration_minutes, b.image_data || null,
    b.age_groups || '', b.active === false ? 0 : 1, b.featured ? 1 : 0, b.sort_order || 0
  );
  res.status(201).json(db.prepare('SELECT * FROM services WHERE id = ?').get(result.lastInsertRowid));
});

app.put('/api/admin/services/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Servicio no encontrado' });
  const b = req.body || {};
  const merged = { ...existing, ...b };
  db.prepare(`UPDATE services SET
      category_slug=?, name=?, short_description=?, long_description=?, price=?, price_max=?,
      duration_minutes=?, image_data=?, age_groups=?, active=?, featured=?, sort_order=?, updated_at=datetime('now')
    WHERE id=?`).run(
    merged.category_slug, merged.name, merged.short_description, merged.long_description,
    merged.price, merged.price_max, merged.duration_minutes, merged.image_data, merged.age_groups,
    merged.active ? 1 : 0, merged.featured ? 1 : 0, merged.sort_order, req.params.id
  );
  res.json(db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id));
});

app.delete('/api/admin/services/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM services WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// ADMIN: PRODUCTOS (CRUD)
// ---------------------------------------------------------------------------
app.get('/api/admin/products', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM products ORDER BY sort_order ASC, id ASC').all());
});

app.post('/api/admin/products', requireAdmin, (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.category || b.price == null) {
    return res.status(400).json({ error: 'Nombre, categoría y precio son obligatorios' });
  }
  const stmt = db.prepare(`INSERT INTO products
    (category,name,short_description,long_description,price,rating,image_data,stock,active,sort_order)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const result = stmt.run(
    b.category, b.name, b.short_description || '', b.long_description || '',
    b.price, b.rating || 5, b.image_data || null, b.stock ?? 999,
    b.active === false ? 0 : 1, b.sort_order || 0
  );
  res.status(201).json(db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid));
});

app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Producto no encontrado' });
  const b = req.body || {};
  const merged = { ...existing, ...b };
  db.prepare(`UPDATE products SET
      category=?, name=?, short_description=?, long_description=?, price=?, rating=?,
      image_data=?, stock=?, active=?, sort_order=?, updated_at=datetime('now')
    WHERE id=?`).run(
    merged.category, merged.name, merged.short_description, merged.long_description,
    merged.price, merged.rating, merged.image_data, merged.stock,
    merged.active ? 1 : 0, merged.sort_order, req.params.id
  );
  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id));
});

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// ADMIN: RESERVAS / CALENDARIO
// ---------------------------------------------------------------------------
app.get('/api/admin/bookings', requireAdmin, (req, res) => {
  const { from, to, status } = req.query;
  let query = 'SELECT * FROM bookings WHERE 1=1';
  const params = [];
  if (from) { query += ' AND booking_date >= ?'; params.push(from); }
  if (to) { query += ' AND booking_date <= ?'; params.push(to); }
  if (status) { query += ' AND status = ?'; params.push(status); }
  query += ' ORDER BY booking_date ASC, booking_time ASC';
  res.json(db.prepare(query).all(...params));
});

app.put('/api/admin/bookings/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Reserva no encontrada' });
  const b = req.body || {};
  const status = b.status ?? null;
  const notes = b.notes ?? null;
  const booking_date = b.booking_date ?? null;
  const booking_time = b.booking_time ?? null;
  db.prepare(`UPDATE bookings SET
      status = COALESCE(?, status),
      notes = COALESCE(?, notes),
      booking_date = COALESCE(?, booking_date),
      booking_time = COALESCE(?, booking_time)
    WHERE id = ?`).run(status, notes, booking_date, booking_time, req.params.id);
  res.json(db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id));
});

app.delete('/api/admin/bookings/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM bookings WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// ADMIN: FECHAS BLOQUEADAS
// ---------------------------------------------------------------------------
app.get('/api/admin/blocked-dates', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM blocked_dates ORDER BY date ASC').all());
});

app.post('/api/admin/blocked-dates', requireAdmin, (req, res) => {
  const { date, reason } = req.body || {};
  if (!date) return res.status(400).json({ error: 'Fecha requerida' });
  db.prepare(
    'INSERT INTO blocked_dates (date, reason, full_day) VALUES (?,?,1) ON CONFLICT(date) DO UPDATE SET reason=excluded.reason'
  ).run(date, reason || 'No disponible');
  res.status(201).json(db.prepare('SELECT * FROM blocked_dates WHERE date = ?').get(date));
});

app.delete('/api/admin/blocked-dates/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM blocked_dates WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// ADMIN: TESTIMONIOS
// ---------------------------------------------------------------------------
app.get('/api/admin/testimonials', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM testimonials ORDER BY sort_order ASC, id ASC').all());
});
app.post('/api/admin/testimonials', requireAdmin, (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.text) return res.status(400).json({ error: 'Nombre y texto son obligatorios' });
  const result = db.prepare(
    'INSERT INTO testimonials (name, text, rating, active, sort_order) VALUES (?,?,?,?,?)'
  ).run(b.name, b.text, b.rating || 5, b.active === false ? 0 : 1, b.sort_order || 0);
  res.status(201).json(db.prepare('SELECT * FROM testimonials WHERE id = ?').get(result.lastInsertRowid));
});
app.put('/api/admin/testimonials/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM testimonials WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'No encontrado' });
  const merged = { ...existing, ...req.body };
  db.prepare('UPDATE testimonials SET name=?, text=?, rating=?, active=?, sort_order=? WHERE id=?').run(
    merged.name, merged.text, merged.rating, merged.active ? 1 : 0, merged.sort_order, req.params.id
  );
  res.json(db.prepare('SELECT * FROM testimonials WHERE id = ?').get(req.params.id));
});
app.delete('/api/admin/testimonials/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM testimonials WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// ADMIN: GALERIA
// ---------------------------------------------------------------------------
app.get('/api/admin/gallery', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM gallery ORDER BY sort_order ASC, id DESC').all());
});
app.post('/api/admin/gallery', requireAdmin, (req, res) => {
  const { image_data, caption, sort_order } = req.body || {};
  if (!image_data) return res.status(400).json({ error: 'Imagen requerida' });
  const result = db.prepare('INSERT INTO gallery (image_data, caption, sort_order) VALUES (?,?,?)').run(
    image_data, caption || '', sort_order || 0
  );
  res.status(201).json(db.prepare('SELECT * FROM gallery WHERE id = ?').get(result.lastInsertRowid));
});
app.delete('/api/admin/gallery/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM gallery WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// ADMIN: CONFIGURACION
// ---------------------------------------------------------------------------
app.get('/api/admin/settings', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all();
  const obj = {};
  rows.forEach((r) => { obj[r.key] = r.value; });
  res.json(obj);
});
app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const b = req.body || {};
  Object.keys(b).forEach((key) => setSetting(key, b[key]));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// ADMIN: DASHBOARD (resumen)
// ---------------------------------------------------------------------------
app.get('/api/admin/summary', requireAdmin, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const totalServices = db.prepare('SELECT COUNT(*) c FROM services WHERE active=1').get().c;
  const totalProducts = db.prepare('SELECT COUNT(*) c FROM products WHERE active=1').get().c;
  const bookingsToday = db.prepare("SELECT COUNT(*) c FROM bookings WHERE booking_date=? AND status!='cancelada'").get(today).c;
  const bookingsPending = db.prepare("SELECT COUNT(*) c FROM bookings WHERE status='pendiente'").get().c;
  const upcoming = db.prepare("SELECT * FROM bookings WHERE booking_date >= ? AND status != 'cancelada' ORDER BY booking_date ASC, booking_time ASC LIMIT 8").all(today);
  res.json({ totalServices, totalProducts, bookingsToday, bookingsPending, upcoming });
});

// ---------------------------------------------------------------------------
// SPA fallback (admin.html / index.html directos)
// ---------------------------------------------------------------------------
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.listen(PORT, () => {
  console.log(`\n=== AQUAZEN Estética y Spa ===`);
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Panel admin en http://localhost:${PORT}/admin\n`);
});
