// AQUAZEN — Panel administrativo
(function () {
  'use strict';

  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));
  const money = (n) => '$' + Number(n || 0).toLocaleString('es-CO');

  let TOKEN = localStorage.getItem('aquazen_token');
  let CATEGORIES = [];
  let SERVICES = [];
  let PRODUCTS = [];
  let TESTIMONIALS = [];
  let GALLERY = [];
  let BOOKINGS_CACHE = {}; // por mes cargado: 'YYYY-MM' -> bookings[]
  let BLOCKED_DATES = [];
  let calYear, calMonth; // 0-indexed month
  let selectedDay = null;

  function toast(msg, isError) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.toggle('error', !!isError);
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2800);
  }

  // ---------------------------------------------------------------------
  // FETCH helper con auth
  // ---------------------------------------------------------------------
  async function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (TOKEN) opts.headers.Authorization = 'Bearer ' + TOKEN;
    const res = await fetch(path, opts);
    if (res.status === 401) {
      logout();
      throw new Error('Sesión expirada, inicia sesión de nuevo');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Ocurrió un error');
    return data;
  }

  function logout() {
    localStorage.removeItem('aquazen_token');
    localStorage.removeItem('aquazen_user');
    TOKEN = null;
    $('#adminApp').classList.remove('ready');
    $('#gate').style.display = 'flex';
  }

  // ---------------------------------------------------------------------
  // GATE / LOGIN
  // ---------------------------------------------------------------------
  $('#gateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('#gateUser').value;
    const password = $('#gatePass').value;
    const errEl = $('#gateError');
    errEl.classList.remove('show');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      TOKEN = data.token;
      localStorage.setItem('aquazen_token', TOKEN);
      localStorage.setItem('aquazen_user', data.username);
      boot();
    } catch (err) {
      errEl.classList.add('show');
    }
  });
  $('#logoutBtn').addEventListener('click', logout);

  // ---------------------------------------------------------------------
  // NAV / VIEWS
  // ---------------------------------------------------------------------
  const VIEW_TITLES = {
    dashboard: 'Panel general', servicios: 'Servicios', productos: 'Productos',
    calendario: 'Reservas & Calendario', testimonios: 'Testimonios', galeria: 'Galería', configuracion: 'Configuración',
  };
  function showView(name) {
    $$('.view').forEach((v) => v.classList.remove('active'));
    $('#view-' + name).classList.add('active');
    $$('.sidebar-nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
    $('#viewTitle').textContent = VIEW_TITLES[name] || 'AQUAZEN';
    $('#sidebar').classList.remove('open');
    if (name === 'calendario' && !calYear) initCalendar();
  }
  $$('.sidebar-nav button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-view-link]');
    if (link) showView(link.dataset.viewLink);
  });

  // ---------------------------------------------------------------------
  // OVERLAY helpers
  // ---------------------------------------------------------------------
  function openOverlay(id) { $('#' + id).classList.add('open'); }
  function closeOverlay(id) { $('#' + id).classList.remove('open'); }
  $$('.js-close-overlay').forEach((btn) => btn.addEventListener('click', () => closeOverlay(btn.dataset.target)));
  $$('.overlay').forEach((ov) => ov.addEventListener('click', (e) => { if (e.target === ov) ov.classList.remove('open'); }));

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ---------------------------------------------------------------------
  // DASHBOARD
  // ---------------------------------------------------------------------
  async function loadDashboard() {
    try {
      const summary = await api('/api/admin/summary');
      $('#statToday').textContent = summary.bookingsToday;
      $('#statPending').textContent = summary.bookingsPending;
      $('#statServices').textContent = summary.totalServices;
      $('#statProducts').textContent = summary.totalProducts;
      const body = $('#upcomingBody');
      if (!summary.upcoming.length) {
        body.innerHTML = '';
        $('#upcomingEmpty').style.display = 'block';
      } else {
        $('#upcomingEmpty').style.display = 'none';
        body.innerHTML = summary.upcoming.map((b) => `
          <tr>
            <td>${formatDate(b.booking_date)}</td>
            <td>${b.booking_time}</td>
            <td class="name-cell"><strong>${b.customer_name}</strong><span>${b.customer_phone}</span></td>
            <td>${b.service_name || '—'}</td>
            <td>${statusBadge(b.status)}</td>
          </tr>`).join('');
      }
    } catch (e) { toast(e.message, true); }
  }

  function statusBadge(status) {
    const map = {
      pendiente: '<span class="badge badge-warn">Pendiente</span>',
      confirmada: '<span class="badge badge-ok">Confirmada</span>',
      cancelada: '<span class="badge badge-danger">Cancelada</span>',
      completada: '<span class="badge badge-muted">Completada</span>',
    };
    return map[status] || `<span class="badge badge-muted">${status}</span>`;
  }
  function formatDate(iso) {
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // ---------------------------------------------------------------------
  // SERVICIOS
  // ---------------------------------------------------------------------
  async function loadCategories() {
    CATEGORIES = await fetch('/api/service-categories').then((r) => r.json()).catch(() => []);
    const sel = $('#svcCategory');
    sel.innerHTML = CATEGORIES.map((c) => `<option value="${c.slug}">${c.name}</option>`).join('');
  }

  async function loadServices() {
    try {
      SERVICES = await api('/api/admin/services');
      const body = $('#servicesBody');
      body.innerHTML = SERVICES.map((s) => `
        <tr>
          <td>${s.image_data ? `<img class="thumb" src="${s.image_data}">` : `<div class="thumb"></div>`}</td>
          <td class="name-cell"><strong>${s.name}</strong><span>${s.short_description || ''}</span></td>
          <td>${categoryName(s.category_slug)}</td>
          <td>${money(s.price)}${s.price_max && s.price_max !== s.price ? ' – ' + money(s.price_max) : ''}</td>
          <td>${s.duration_minutes} min</td>
          <td>${s.active ? '<span class="badge badge-ok">Activo</span>' : '<span class="badge badge-muted">Oculto</span>'}${s.featured ? ' <span class="badge badge-warn">Popular</span>' : ''}</td>
          <td class="actions">
            <button class="btn btn-ghost btn-icon js-edit-service" data-id="${s.id}" title="Editar">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
            </button>
            <button class="btn btn-danger btn-icon js-del-service" data-id="${s.id}" title="Eliminar">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
            </button>
          </td>
        </tr>`).join('');
      bindServiceRowActions();
    } catch (e) { toast(e.message, true); }
  }
  function categoryName(slug) {
    const c = CATEGORIES.find((x) => x.slug === slug);
    return c ? c.name : slug;
  }
  function bindServiceRowActions() {
    $$('.js-edit-service').forEach((b) => b.addEventListener('click', () => openServiceForm(Number(b.dataset.id))));
    $$('.js-del-service').forEach((b) => b.addEventListener('click', () => deleteService(Number(b.dataset.id))));
  }

  function openServiceForm(id) {
    const form = $('#serviceForm');
    form.reset();
    $('#svcImagePreview').innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
    $$('.age-check-grid input', form).forEach((cb) => (cb.checked = false));
    if (id) {
      const s = SERVICES.find((x) => x.id === id);
      $('#serviceModalTitle').textContent = 'Editar servicio';
      $('#svcId').value = s.id;
      $('#svcName').value = s.name;
      $('#svcCategory').value = s.category_slug;
      $('#svcShort').value = s.short_description || '';
      $('#svcLong').value = s.long_description || '';
      $('#svcPrice').value = s.price;
      $('#svcPriceMax').value = s.price_max || '';
      $('#svcDuration').value = s.duration_minutes;
      $('#svcFeatured').checked = !!s.featured;
      $('#svcActive').checked = !!s.active;
      if (s.image_data) $('#svcImagePreview').innerHTML = `<img src="${s.image_data}">`;
      (s.age_groups || '').split(',').filter(Boolean).forEach((val) => {
        const cb = $(`.age-check-grid input[value="${val}"]`, form);
        if (cb) cb.checked = true;
      });
      form.dataset.image = s.image_data || '';
    } else {
      $('#serviceModalTitle').textContent = 'Nuevo servicio';
      $('#svcId').value = '';
      $('#svcActive').checked = true;
      form.dataset.image = '';
    }
    openOverlay('serviceOverlay');
  }
  $('#addServiceBtn').addEventListener('click', () => openServiceForm(null));
  $('#svcImageInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const b64 = await fileToBase64(file);
    $('#serviceForm').dataset.image = b64;
    $('#svcImagePreview').innerHTML = `<img src="${b64}">`;
  });

  $('#serviceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#svcId').value;
    const ageGroups = $$('.age-check-grid input:checked', e.target).map((cb) => cb.value).join(',');
    const payload = {
      name: $('#svcName').value,
      category_slug: $('#svcCategory').value,
      short_description: $('#svcShort').value,
      long_description: $('#svcLong').value,
      price: Number($('#svcPrice').value),
      price_max: $('#svcPriceMax').value ? Number($('#svcPriceMax').value) : Number($('#svcPrice').value),
      duration_minutes: Number($('#svcDuration').value),
      age_groups: ageGroups,
      featured: $('#svcFeatured').checked,
      active: $('#svcActive').checked,
      image_data: e.target.dataset.image || null,
    };
    try {
      if (id) await api('/api/admin/services/' + id, { method: 'PUT', body: JSON.stringify(payload) });
      else await api('/api/admin/services', { method: 'POST', body: JSON.stringify(payload) });
      closeOverlay('serviceOverlay');
      toast('Servicio guardado correctamente');
      await loadServices();
      await loadDashboard();
    } catch (err) { toast(err.message, true); }
  });
  async function deleteService(id) {
    if (!confirm('¿Eliminar este servicio? Esta acción no se puede deshacer.')) return;
    try {
      await api('/api/admin/services/' + id, { method: 'DELETE' });
      toast('Servicio eliminado');
      await loadServices();
      await loadDashboard();
    } catch (e) { toast(e.message, true); }
  }

  // ---------------------------------------------------------------------
  // PRODUCTOS
  // ---------------------------------------------------------------------
  async function loadProducts() {
    try {
      PRODUCTS = await api('/api/admin/products');
      const body = $('#productsBody');
      body.innerHTML = PRODUCTS.map((p) => `
        <tr>
          <td>${p.image_data ? `<img class="thumb" src="${p.image_data}">` : `<div class="thumb"></div>`}</td>
          <td class="name-cell"><strong>${p.name}</strong><span>${p.short_description || ''}</span></td>
          <td>${p.category}</td>
          <td>${money(p.price)}</td>
          <td>★ ${p.rating}</td>
          <td>${p.active ? '<span class="badge badge-ok">Activo</span>' : '<span class="badge badge-muted">Oculto</span>'}</td>
          <td class="actions">
            <button class="btn btn-ghost btn-icon js-edit-product" data-id="${p.id}" title="Editar">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
            </button>
            <button class="btn btn-danger btn-icon js-del-product" data-id="${p.id}" title="Eliminar">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
            </button>
          </td>
        </tr>`).join('');
      $$('.js-edit-product').forEach((b) => b.addEventListener('click', () => openProductForm(Number(b.dataset.id))));
      $$('.js-del-product').forEach((b) => b.addEventListener('click', () => deleteProduct(Number(b.dataset.id))));
    } catch (e) { toast(e.message, true); }
  }
  function openProductForm(id) {
    const form = $('#productForm');
    form.reset();
    $('#prdImagePreview').innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
    if (id) {
      const p = PRODUCTS.find((x) => x.id === id);
      $('#productModalTitle').textContent = 'Editar producto';
      $('#prdId').value = p.id;
      $('#prdName').value = p.name;
      $('#prdCategory').value = p.category;
      $('#prdShort').value = p.short_description || '';
      $('#prdLong').value = p.long_description || '';
      $('#prdPrice').value = p.price;
      $('#prdRating').value = p.rating;
      $('#prdActive').checked = !!p.active;
      if (p.image_data) $('#prdImagePreview').innerHTML = `<img src="${p.image_data}">`;
      form.dataset.image = p.image_data || '';
    } else {
      $('#productModalTitle').textContent = 'Nuevo producto';
      $('#prdId').value = '';
      $('#prdActive').checked = true;
      form.dataset.image = '';
    }
    openOverlay('productOverlay');
  }
  $('#addProductBtn').addEventListener('click', () => openProductForm(null));
  $('#prdImageInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const b64 = await fileToBase64(file);
    $('#productForm').dataset.image = b64;
    $('#prdImagePreview').innerHTML = `<img src="${b64}">`;
  });
  $('#productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#prdId').value;
    const payload = {
      name: $('#prdName').value,
      category: $('#prdCategory').value,
      short_description: $('#prdShort').value,
      long_description: $('#prdLong').value,
      price: Number($('#prdPrice').value),
      rating: Number($('#prdRating').value),
      active: $('#prdActive').checked,
      image_data: e.target.dataset.image || null,
    };
    try {
      if (id) await api('/api/admin/products/' + id, { method: 'PUT', body: JSON.stringify(payload) });
      else await api('/api/admin/products', { method: 'POST', body: JSON.stringify(payload) });
      closeOverlay('productOverlay');
      toast('Producto guardado correctamente');
      await loadProducts();
      await loadDashboard();
    } catch (err) { toast(err.message, true); }
  });
  async function deleteProduct(id) {
    if (!confirm('¿Eliminar este producto?')) return;
    try {
      await api('/api/admin/products/' + id, { method: 'DELETE' });
      toast('Producto eliminado');
      await loadProducts();
      await loadDashboard();
    } catch (e) { toast(e.message, true); }
  }

  // ---------------------------------------------------------------------
  // TESTIMONIOS
  // ---------------------------------------------------------------------
  async function loadTestimonials() {
    try {
      TESTIMONIALS = await api('/api/admin/testimonials');
      $('#testimonialsBody').innerHTML = TESTIMONIALS.map((t) => `
        <tr>
          <td><strong>${t.name}</strong></td>
          <td style="max-width:340px;">${t.text}</td>
          <td>★ ${t.rating}</td>
          <td>${t.active ? '<span class="badge badge-ok">Visible</span>' : '<span class="badge badge-muted">Oculto</span>'}</td>
          <td class="actions">
            <button class="btn btn-ghost btn-icon js-edit-test" data-id="${t.id}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg></button>
            <button class="btn btn-danger btn-icon js-del-test" data-id="${t.id}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg></button>
          </td>
        </tr>`).join('');
      $$('.js-edit-test').forEach((b) => b.addEventListener('click', () => openTestimonialForm(Number(b.dataset.id))));
      $$('.js-del-test').forEach((b) => b.addEventListener('click', () => deleteTestimonial(Number(b.dataset.id))));
    } catch (e) { toast(e.message, true); }
  }
  function openTestimonialForm(id) {
    const form = $('#testimonialForm');
    form.reset();
    if (id) {
      const t = TESTIMONIALS.find((x) => x.id === id);
      $('#testimonialModalTitle').textContent = 'Editar testimonio';
      $('#tstId').value = t.id;
      $('#tstName').value = t.name;
      $('#tstText').value = t.text;
      $('#tstRating').value = t.rating;
      $('#tstActive').checked = !!t.active;
    } else {
      $('#testimonialModalTitle').textContent = 'Nuevo testimonio';
      $('#tstId').value = '';
      $('#tstActive').checked = true;
    }
    openOverlay('testimonialOverlay');
  }
  $('#addTestimonialBtn').addEventListener('click', () => openTestimonialForm(null));
  $('#testimonialForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#tstId').value;
    const payload = {
      name: $('#tstName').value, text: $('#tstText').value,
      rating: Number($('#tstRating').value), active: $('#tstActive').checked,
    };
    try {
      if (id) await api('/api/admin/testimonials/' + id, { method: 'PUT', body: JSON.stringify(payload) });
      else await api('/api/admin/testimonials', { method: 'POST', body: JSON.stringify(payload) });
      closeOverlay('testimonialOverlay');
      toast('Testimonio guardado');
      await loadTestimonials();
    } catch (err) { toast(err.message, true); }
  });
  async function deleteTestimonial(id) {
    if (!confirm('¿Eliminar este testimonio?')) return;
    try { await api('/api/admin/testimonials/' + id, { method: 'DELETE' }); toast('Testimonio eliminado'); await loadTestimonials(); }
    catch (e) { toast(e.message, true); }
  }

  // ---------------------------------------------------------------------
  // GALERIA
  // ---------------------------------------------------------------------
  async function loadGallery() {
    try {
      GALLERY = await api('/api/admin/gallery');
      $('#galleryBody').innerHTML = GALLERY.map((g) => `
        <tr>
          <td><img class="thumb" src="${g.image_data}"></td>
          <td>${g.caption || '<span style="color:var(--ink-soft)">Sin descripción</span>'}</td>
          <td class="actions">
            <button class="btn btn-danger btn-icon js-del-gallery" data-id="${g.id}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg></button>
          </td>
        </tr>`).join('');
      $$('.js-del-gallery').forEach((b) => b.addEventListener('click', () => deleteGalleryItem(Number(b.dataset.id))));
    } catch (e) { toast(e.message, true); }
  }
  $('#addGalleryBtn').addEventListener('click', () => {
    $('#galleryForm').reset();
    $('#galImagePreview').innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
    $('#galleryForm').dataset.image = '';
    openOverlay('galleryOverlay');
  });
  $('#galImageInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const b64 = await fileToBase64(file);
    $('#galleryForm').dataset.image = b64;
    $('#galImagePreview').innerHTML = `<img src="${b64}">`;
  });
  $('#galleryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const image = e.target.dataset.image;
    if (!image) { toast('Selecciona una imagen', true); return; }
    try {
      await api('/api/admin/gallery', { method: 'POST', body: JSON.stringify({ image_data: image, caption: $('#galCaption').value }) });
      closeOverlay('galleryOverlay');
      toast('Imagen subida a la galería');
      await loadGallery();
    } catch (err) { toast(err.message, true); }
  });
  async function deleteGalleryItem(id) {
    if (!confirm('¿Eliminar esta imagen de la galería?')) return;
    try { await api('/api/admin/gallery/' + id, { method: 'DELETE' }); toast('Imagen eliminada'); await loadGallery(); }
    catch (e) { toast(e.message, true); }
  }

  // ---------------------------------------------------------------------
  // CALENDARIO / RESERVAS
  // ---------------------------------------------------------------------
  const DOW_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const MONTH_LABELS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  function initCalendar() {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
    renderCalendar();
  }
  $('#calPrev').addEventListener('click', () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); });
  $('#calNext').addEventListener('click', () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); });
  $('#calTodayBtn').addEventListener('click', () => { initCalendar(); });

  async function renderCalendar() {
    $('#calLabel').textContent = `${MONTH_LABELS[calMonth]} ${calYear}`;
    const first = new Date(calYear, calMonth, 1);
    const startOffset = first.getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const monthKey = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;

    const from = `${monthKey}-01`;
    const to = `${monthKey}-${String(daysInMonth).padStart(2, '0')}`;

    let bookings = [];
    try {
      bookings = await api(`/api/admin/bookings?from=${from}&to=${to}`);
      BLOCKED_DATES = await api('/api/admin/blocked-dates');
    } catch (e) { toast(e.message, true); }

    const countByDay = {};
    bookings.forEach((b) => {
      countByDay[b.booking_date] = (countByDay[b.booking_date] || 0) + (b.status !== 'cancelada' ? 1 : 0);
    });
    const blockedSet = new Set(BLOCKED_DATES.map((b) => b.date));

    const todayIso = new Date().toISOString().slice(0, 10);
    let html = DOW_LABELS.map((d) => `<div class="calendar-dow">${d}</div>`).join('');
    for (let i = 0; i < startOffset; i++) html += `<div class="calendar-cell empty"></div>`;
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${monthKey}-${String(day).padStart(2, '0')}`;
      const count = countByDay[iso] || 0;
      const isToday = iso === todayIso;
      const isBlocked = blockedSet.has(iso);
      html += `<div class="calendar-cell ${isToday ? 'today' : ''} ${isBlocked ? 'blocked' : ''}" data-date="${iso}">
        <span class="daynum">${day}</span>
        ${isBlocked ? '<span class="blocked-tag">Bloqueado</span>' : ''}
        ${count > 0 ? `<span class="count">${count}</span>` : ''}
      </div>`;
    }
    $('#calendarGrid').innerHTML = html;
    BOOKINGS_CACHE[monthKey] = bookings;

    $$('.calendar-cell[data-date]').forEach((cell) => {
      cell.addEventListener('click', () => selectDay(cell.dataset.date, monthKey));
    });

    if (selectedDay && selectedDay.slice(0, 7) === monthKey) selectDay(selectedDay, monthKey);
  }

  function selectDay(iso, monthKey) {
    selectedDay = iso;
    const bookings = (BOOKINGS_CACHE[monthKey] || []).filter((b) => b.booking_date === iso);
    const isBlocked = BLOCKED_DATES.some((b) => b.date === iso);
    $('#dayPanelTitle').textContent = `Reservas del ${formatDate(iso)}`;
    $('#blockDayBtn').style.display = isBlocked ? 'none' : 'inline-flex';
    $('#unblockDayBtn').style.display = isBlocked ? 'inline-flex' : 'none';
    $('#blockDayBtn').dataset.date = iso;
    $('#unblockDayBtn').dataset.date = iso;

    const list = $('#dayPanelList');
    const empty = $('#dayPanelEmpty');
    if (!bookings.length) {
      list.innerHTML = '';
      empty.style.display = 'block';
      empty.querySelector('p').textContent = isBlocked ? 'Este día está bloqueado y no tiene reservas.' : 'No hay reservas para este día.';
    } else {
      empty.style.display = 'none';
      list.innerHTML = bookings.sort((a, b) => a.booking_time.localeCompare(b.booking_time)).map((b) => `
        <div class="day-booking-row" data-id="${b.id}">
          <span class="time">${b.booking_time}</span>
          <div class="who"><strong>${b.customer_name}</strong><span>${b.customer_phone} · ${b.service_name || 'Sin servicio'}</span></div>
          <select class="js-status-select" data-id="${b.id}">
            <option value="pendiente" ${b.status === 'pendiente' ? 'selected' : ''}>Pendiente</option>
            <option value="confirmada" ${b.status === 'confirmada' ? 'selected' : ''}>Confirmada</option>
            <option value="completada" ${b.status === 'completada' ? 'selected' : ''}>Completada</option>
            <option value="cancelada" ${b.status === 'cancelada' ? 'selected' : ''}>Cancelada</option>
          </select>
          <button class="btn btn-danger btn-icon js-del-booking" data-id="${b.id}" title="Eliminar reserva">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
          </button>
        </div>`).join('');
      $$('.js-status-select', list).forEach((sel) => sel.addEventListener('change', () => updateBookingStatus(sel.dataset.id, sel.value)));
      $$('.js-del-booking', list).forEach((btn) => btn.addEventListener('click', () => deleteBooking(btn.dataset.id)));
    }
  }

  async function updateBookingStatus(id, status) {
    try {
      await api('/api/admin/bookings/' + id, { method: 'PUT', body: JSON.stringify({ status }) });
      toast('Estado actualizado');
      await renderCalendar();
      await loadDashboard();
    } catch (e) { toast(e.message, true); }
  }
  async function deleteBooking(id) {
    if (!confirm('¿Eliminar esta reserva?')) return;
    try {
      await api('/api/admin/bookings/' + id, { method: 'DELETE' });
      toast('Reserva eliminada');
      await renderCalendar();
      await loadDashboard();
    } catch (e) { toast(e.message, true); }
  }
  $('#blockDayBtn').addEventListener('click', async () => {
    const date = $('#blockDayBtn').dataset.date;
    try {
      await api('/api/admin/blocked-dates', { method: 'POST', body: JSON.stringify({ date, reason: 'Bloqueado desde el panel admin' }) });
      toast('Día bloqueado');
      await renderCalendar();
    } catch (e) { toast(e.message, true); }
  });
  $('#unblockDayBtn').addEventListener('click', async () => {
    const date = $('#unblockDayBtn').dataset.date;
    const item = BLOCKED_DATES.find((b) => b.date === date);
    if (!item) return;
    try {
      await api('/api/admin/blocked-dates/' + item.id, { method: 'DELETE' });
      toast('Día desbloqueado');
      await renderCalendar();
    } catch (e) { toast(e.message, true); }
  });

  // ---------------------------------------------------------------------
  // CONFIGURACION
  // ---------------------------------------------------------------------
  const DAY_OPTIONS = [
    { val: '0', label: 'Domingo' }, { val: '1', label: 'Lunes' }, { val: '2', label: 'Martes' },
    { val: '3', label: 'Miércoles' }, { val: '4', label: 'Jueves' }, { val: '5', label: 'Viernes' }, { val: '6', label: 'Sábado' },
  ];
  async function loadSettings() {
    try {
      const cfg = await api('/api/admin/settings');
      $('#cfgWhatsapp').value = cfg.whatsapp_number || '';
      $('#cfgHourStart').value = cfg.business_hours_start || '09:00';
      $('#cfgHourEnd').value = cfg.business_hours_end || '18:00';
      const workingDays = (cfg.working_days || '1,2,3,4,5,6').split(',');
      $('#workingDaysGrid').innerHTML = DAY_OPTIONS.map((d) => `
        <label class="age-check"><input type="checkbox" value="${d.val}" ${workingDays.includes(d.val) ? 'checked' : ''}> ${d.label}</label>
      `).join('');
    } catch (e) { toast(e.message, true); }
  }
  $('#settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const days = $$('#workingDaysGrid input:checked').map((cb) => cb.value).join(',');
    try {
      await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({
        whatsapp_number: $('#cfgWhatsapp').value.replace(/\D/g, ''),
        business_hours_start: $('#cfgHourStart').value,
        business_hours_end: $('#cfgHourEnd').value,
        working_days: days,
      })});
      toast('Configuración guardada');
    } catch (err) { toast(err.message, true); }
  });
  $('#passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/admin/change-password', { method: 'POST', body: JSON.stringify({
        currentPassword: $('#cfgCurrentPass').value, newPassword: $('#cfgNewPass').value,
      })});
      toast('Contraseña actualizada correctamente');
      e.target.reset();
    } catch (err) { toast(err.message, true); }
  });

  // ---------------------------------------------------------------------
  // BOOT
  // ---------------------------------------------------------------------
  async function boot() {
    $('#gate').style.display = 'none';
    $('#adminApp').classList.add('ready');
    $('#adminUsername').textContent = localStorage.getItem('aquazen_user') || 'admin';
    await loadCategories();
    await Promise.all([loadDashboard(), loadServices(), loadProducts(), loadTestimonials(), loadGallery(), loadSettings()]);
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (TOKEN) boot().catch(() => logout());
  });
})();
