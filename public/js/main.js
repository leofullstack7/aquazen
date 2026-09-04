// AQUAZEN — Frontend público
(function () {
  'use strict';

  const API = '';
  const WA_NUMBER_FALLBACK = '573174204778';
  let SETTINGS = { whatsapp_number: WA_NUMBER_FALLBACK };
  let SERVICES = [];
  let CATEGORIES = [];
  let PRODUCTS = [];
  let activeCategory = 'all';

  // ---------- helpers ----------
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));
  const money = (n) => '$' + Number(n || 0).toLocaleString('es-CO');
  const stars = (rating) => {
    const r = Math.round(Number(rating || 5) * 2) / 2;
    let out = '';
    for (let i = 1; i <= 5; i++) {
      if (r >= i) out += '★';
      else if (r >= i - 0.5) out += '★'; // simplificado (media estrella visual)
      else out += '☆';
    }
    return out;
  };
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2600);
  }
  function waLink(message) {
    const num = (SETTINGS.whatsapp_number || WA_NUMBER_FALLBACK).replace(/\D/g, '');
    return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
  }
  function bindWaButtons(scope) {
    $$('.js-wa', scope).forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const msg = btn.getAttribute('data-wa-msg') || 'Hola AQUAZEN!';
        window.open(waLink(msg), '_blank');
      });
    });
  }

  // Iconos SVG por categoría/uso (placeholders elegantes cuando no hay foto)
  const ICONS = {
    faciales: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M9 10h.01M15 10h.01M9 15c1 1 5 1 6 0"/></svg>',
    corporales: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2"/><path d="M12 7v6M8 9l4-2 4 2M9 21l3-8 3 8M8 13l-2 3M16 13l2 3"/></svg>',
    relajacion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c-2.5 3-4 6-4 9a4 4 0 0 0 8 0c0-3-1.5-6-4-9Z"/></svg>',
    quiropraxia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M9 5l3-3 3 3M9 19l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/></svg>',
    producto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6l1 4H8l1-4Z"/><path d="M6 7h12l1 13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1L6 7Z"/></svg>',
  };
  function iconFor(catSlug) { return ICONS[catSlug] || ICONS.relajacion; }

  const FALLBACK_SERVICE = {
    faciales: 'img/img-facial.jpg',
    corporales: 'img/img-massage.jpg',
    relajacion: 'img/img-stones.jpg',
    quiropraxia: 'img/img-chiro.jpg',
  };
  const FALLBACK_PRODUCT = {
    'Cuidado Facial': 'img/img-serum.jpg',
    Corporal: 'img/img-oil.jpg',
    'Bienestar Postural': 'img/img-chiro.jpg',
    Aromaterapia: 'img/img-candle.jpg',
    Kits: 'img/img-ritual.jpg',
  };
  const DEFAULT_GALLERY = [
    { src: 'img/img-lounge.jpg', caption: 'Lounge AquaZen', span: 'g-big' },
    { src: 'img/img-facial.jpg', caption: 'Facial', span: 'g-tall' },
    { src: 'img/img-massage.jpg', caption: 'Masaje', span: 'g-med' },
    { src: 'img/img-jade.jpg', caption: 'Ritual', span: 'g-small' },
    { src: 'img/img-stones.jpg', caption: 'Piedras', span: 'g-small' },
    { src: 'img/img-reception.jpg', caption: 'Recepción', span: 'g-med' },
    { src: 'img/img-serum.jpg', caption: 'Productos', span: 'g-small' },
    { src: 'img/img-chiro.jpg', caption: 'Quiropraxia', span: 'g-tall' },
  ];
  function mediaForService(s) {
    if (s.image_data) return `<img src="${s.image_data}" alt="${s.name}">`;
    const src = FALLBACK_SERVICE[s.category_slug] || 'img/img-lounge.jpg';
    return `<img src="${src}" alt="${s.name}">`;
  }
  function mediaForProduct(p) {
    if (p.image_data) return `<img src="${p.image_data}" alt="${p.name}">`;
    const src = FALLBACK_PRODUCT[p.category] || 'img/img-serum.jpg';
    return `<img src="${src}" alt="${p.name}">`;
  }

  // ---------- NAV ----------
  function initNav() {
    const nav = $('#nav');
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 20);
    });
    const burger = $('#burgerBtn');
    const menu = $('#mobileMenu');
    const closeBtn = $('#mobileMenuClose');
    burger.addEventListener('click', () => menu.classList.add('open'));
    closeBtn.addEventListener('click', () => menu.classList.remove('open'));
    $$('#mobileMenu a').forEach((a) => a.addEventListener('click', () => menu.classList.remove('open')));
  }

  // ---------- REVEAL ON SCROLL ----------
  function initReveal() {
    const items = $$('.reveal');
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target); }
        });
      },
      { threshold: 0.12 }
    );
    items.forEach((i) => obs.observe(i));
  }

  // ---------- DATA LOADING ----------
  async function loadSettings() {
    try {
      SETTINGS = await fetch(API + '/api/settings').then((r) => r.json());
    } catch (e) { /* usa fallback */ }
  }

  async function loadCategories() {
    try {
      CATEGORIES = await fetch(API + '/api/service-categories').then((r) => r.json());
    } catch (e) { CATEGORIES = []; }
    renderCategorySwitch();
  }

  function renderCategorySwitch() {
    const wrap = $('#categorySwitch');
    let html = `<button data-cat="all" class="active">Todos los servicios</button>`;
    CATEGORIES.forEach((c) => { html += `<button data-cat="${c.slug}">${c.name}</button>`; });
    wrap.innerHTML = html;
    $$('button', wrap).forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('button', wrap).forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        activeCategory = btn.dataset.cat;
        renderServices();
      });
    });
  }

  async function loadServices() {
    try {
      SERVICES = await fetch(API + '/api/services').then((r) => r.json());
    } catch (e) { SERVICES = []; }
    renderServices();
    populateServiceSelect();
  }

  function renderServices() {
    const grid = $('#servicesGrid');
    const list = activeCategory === 'all' ? SERVICES : SERVICES.filter((s) => s.category_slug === activeCategory);
    if (!list.length) {
      grid.innerHTML = '<p style="color:var(--ink-soft)">Muy pronto agregaremos servicios en esta categoría.</p>';
      return;
    }
    grid.innerHTML = list.map((s) => serviceCardHTML(s)).join('');
    $$('.service-card', grid).forEach((card) => {
      card.addEventListener('click', () => openServiceModal(Number(card.dataset.id)));
    });
  }

  function serviceCardHTML(s) {
    const media = mediaForService(s);
    return `
      <div class="service-card reveal in" data-id="${s.id}">
        <div class="card-media">
          ${media}
          ${s.featured ? '<span class="card-badge featured">Popular</span>' : ''}
        </div>
        <div class="card-body">
          <h3>${s.name}</h3>
          <p class="desc">${s.short_description || ''}</p>
          <div class="card-meta">
            <span class="card-duration">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              ${s.duration_minutes} min
            </span>
          </div>
          <div class="card-price-row">
            <span class="card-price"><small>Desde</small>${money(s.price)}</span>
            <button type="button" class="btn btn-ghost btn-sm">Ver detalle</button>
          </div>
        </div>
      </div>`;
  }

  function populateServiceSelect() {
    const sel = $('#bkService');
    sel.innerHTML = '<option value="">Selecciona un servicio…</option>' +
      SERVICES.map((s) => `<option value="${s.id}">${s.name} — ${money(s.price)}</option>`).join('');
  }

  async function loadProducts() {
    try {
      PRODUCTS = await fetch(API + '/api/products').then((r) => r.json());
    } catch (e) { PRODUCTS = []; }
    const grid = $('#productsGrid');
    if (!PRODUCTS.length) {
      grid.innerHTML = '<p style="color:var(--ink-soft)">Muy pronto tendremos productos disponibles.</p>';
      return;
    }
    grid.innerHTML = PRODUCTS.map((p) => productCardHTML(p)).join('');
    $$('.product-card', grid).forEach((card) => {
      card.addEventListener('click', () => openProductModal(Number(card.dataset.id)));
    });
  }

  function productCardHTML(p) {
    const media = mediaForProduct(p);
    return `
      <div class="product-card reveal in" data-id="${p.id}">
        <div class="card-media">${media}</div>
        <div class="card-body">
          <span class="product-cat">${p.category}</span>
          <h3>${p.name}</h3>
          <p class="desc">${p.short_description || ''}</p>
          <span class="card-stars">${stars(p.rating)} <span style="color:var(--ink-soft);font-weight:600;">(${p.rating})</span></span>
          <div class="card-price-row">
            <span class="card-price">${money(p.price)}</span>
            <button type="button" class="btn btn-whatsapp btn-sm js-buy-product" data-id="${p.id}">Comprar</button>
          </div>
        </div>
      </div>`;
  }

  async function loadTestimonials() {
    let items = [];
    try { items = await fetch(API + '/api/testimonials').then((r) => r.json()); } catch (e) {}
    const grid = $('#testimonialsGrid');
    if (!items.length) { grid.innerHTML = ''; return; }
    grid.innerHTML = items.map((t) => `
      <div class="testimonial-card reveal">
        <span class="quote-mark">”</span>
        <span class="card-stars">${stars(t.rating)}</span>
        <p class="quote">${t.text}</p>
        <div class="testimonial-author">
          <div class="testimonial-avatar">${t.name.charAt(0)}</div>
          <div><strong>${t.name}</strong><span>Cliente AQUAZEN</span></div>
        </div>
      </div>`).join('');
    initReveal();
  }

  const GALLERY_SPANS = ['g-big', 'g-med', 'g-tall', 'g-small', 'g-small', 'g-med', 'g-small', 'g-tall'];
  const GALLERY_PLACEHOLDER_ICONS = [ICONS.relajacion, ICONS.faciales, ICONS.corporales, ICONS.quiropraxia];
  async function loadGallery() {
    let items = [];
    try { items = await fetch(API + '/api/gallery').then((r) => r.json()); } catch (e) {}
    const mosaic = $('#galleryMosaic');
    if (items.length) {
      mosaic.innerHTML = items.map((g, i) => `
        <div class="gallery-item ${GALLERY_SPANS[i % GALLERY_SPANS.length]}">
          <img src="${g.image_data}" alt="${g.caption || 'AQUAZEN'}" loading="lazy">
        </div>`).join('');
    } else {
      mosaic.innerHTML = DEFAULT_GALLERY.map((g) => `
        <div class="gallery-item ${g.span}">
          <img src="${g.src}" alt="${g.caption}" loading="lazy">
        </div>`).join('');
    }
  }

  // ---------- MODALES SERVICIO / PRODUCTO ----------
  const itemModal = $('#itemModal');
  const modalMedia = $('#modalMedia');
  const modalContent = $('#modalContent');

  function openModal() { itemModal.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closeModal() { itemModal.classList.remove('open'); document.body.style.overflow = ''; }
  $('#modalClose').addEventListener('click', closeModal);
  itemModal.addEventListener('click', (e) => { if (e.target === itemModal) closeModal(); });

  function openServiceModal(id) {
    const s = SERVICES.find((x) => x.id === id);
    if (!s) return;
    modalMedia.innerHTML = `<button class="modal-close" id="modalCloseInner"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>` +
      mediaForService(s);
    modalContent.innerHTML = `
      <h3>${s.name}</h3>
      <div class="card-meta" style="margin-bottom:14px;">
        <span class="card-duration"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>${s.duration_minutes} minutos</span>
        <span class="card-price">${money(s.price)}${s.price_max && s.price_max !== s.price ? ' – ' + money(s.price_max) : ''}</span>
      </div>
      <p class="long">${s.long_description || s.short_description || ''}</p>
      <div class="modal-booking" id="modalBooking">
        <h4>Reserva este servicio</h4>
        <div class="pub-cal-nav">
          <button type="button" id="modalCalPrev" aria-label="Mes anterior">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <h4 id="modalCalLabel">Mes</h4>
          <button type="button" id="modalCalNext" aria-label="Mes siguiente">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        </div>
        <div class="pub-cal-grid mini-cal" id="modalCalGrid"></div>
        <div class="slot-grid" id="modalCalSlots"><div class="slot-empty">Selecciona un día</div></div>
        <div class="form-row" style="margin-top:14px;">
          <div class="field"><label for="modalBkName">Nombre</label><input type="text" id="modalBkName" required placeholder="Tu nombre"></div>
          <div class="field"><label for="modalBkPhone">WhatsApp</label><input type="tel" id="modalBkPhone" required placeholder="300 000 0000"></div>
        </div>
        <div class="modal-footer" style="border:0;padding-top:8px;">
          <button class="btn btn-primary" id="modalBookBtn" type="button">Confirmar reserva</button>
          <a href="#" class="btn btn-whatsapp js-wa" data-wa-msg="Hola AQUAZEN! Quiero más información sobre: ${s.name}">Preguntar por WhatsApp</a>
        </div>
      </div>`;
    $('#modalCloseInner').addEventListener('click', closeModal);
    bindEmbeddedCalendar(s.id);
    $('#modalBookBtn').addEventListener('click', () => submitEmbeddedBooking(s));
    bindWaButtons(modalContent);
    openModal();
  }

  function openProductModal(id) {
    const p = PRODUCTS.find((x) => x.id === id);
    if (!p) return;
    modalMedia.innerHTML = `<button class="modal-close" id="modalCloseInner"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>` +
      mediaForProduct(p);
    modalContent.innerHTML = `
      <span class="product-cat">${p.category}</span>
      <h3>${p.name}</h3>
      <span class="card-stars">${stars(p.rating)} <span style="color:var(--ink-soft);font-weight:600;">(${p.rating})</span></span>
      <p class="long" style="margin-top:14px;">${p.long_description || p.short_description || ''}</p>
      <div class="modal-footer">
        <span class="card-price">${money(p.price)}</span>
        <a href="#" class="btn btn-whatsapp js-wa" data-wa-msg="Hola AQUAZEN! Quiero comprar: ${p.name} (${money(p.price)})">Comprar por WhatsApp</a>
      </div>`;
    $('#modalCloseInner').addEventListener('click', closeModal);
    bindWaButtons(modalContent);
    openModal();
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.js-buy-product');
    if (!btn) return;
    e.stopPropagation();
    const p = PRODUCTS.find((x) => x.id === Number(btn.dataset.id));
    if (!p) return;
    window.open(waLink(`Hola AQUAZEN! Quiero comprar: ${p.name} (${money(p.price)})`), '_blank');
  });

  // ---------- RESERVAS ----------
  const bkService = $('#bkService');
  const bkDate = $('#bkDate');
  const bkTime = $('#bkTime');
  const MONTH_LABELS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const DOW_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  function todayStr() {
    const d = new Date();
    const off = d.getTimezoneOffset();
    const local = new Date(d.getTime() - off * 60000);
    return local.toISOString().slice(0, 10);
  }
  function maxDateStr() {
    const d = new Date();
    d.setDate(d.getDate() + 60);
    const off = d.getTimezoneOffset();
    const local = new Date(d.getTime() - off * 60000);
    return local.toISOString().slice(0, 10);
  }
  function workingDaysSet() {
    return new Set(String(SETTINGS.working_days || '1,2,3,4,5,6').split(',').map(Number));
  }
  function prettyDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function updateDateLabel() {
    const label = $('#bkDateLabel');
    if (!label) return;
    if (bkDate.value && bkTime.value) label.textContent = `${prettyDate(bkDate.value)} · ${bkTime.value}`;
    else if (bkDate.value) label.textContent = prettyDate(bkDate.value);
    else label.textContent = 'Elige día y hora';
  }

  function paintMonth(grid, year, month, selectedIso, onPick) {
    const first = new Date(year, month, 1);
    const startOffset = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const working = workingDaysSet();
    const today = todayStr();
    const max = maxDateStr();
    let html = DOW_SHORT.map((d) => `<div class="pub-cal-dow">${d}</div>`).join('');
    for (let i = 0; i < startOffset; i++) html += `<div></div>`;
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dow = new Date(iso + 'T12:00:00').getDay();
      const closed = !working.has(dow) || iso < today || iso > max;
      html += `<button type="button" class="pub-cal-day ${iso === today ? 'today' : ''} ${iso === selectedIso ? 'selected' : ''} ${closed ? 'closed' : ''}" data-date="${iso}" ${closed ? 'disabled' : ''}>${day}</button>`;
    }
    grid.innerHTML = html;
    $$('.pub-cal-day:not(:disabled)', grid).forEach((btn) => {
      btn.addEventListener('click', () => onPick(btn.dataset.date));
    });
  }

  async function paintSlots(el, date, serviceId, selectedTime, onPick) {
    if (!date) {
      el.innerHTML = '<div class="slot-empty">Selecciona un día</div>';
      return { available: false, slots: [] };
    }
    el.innerHTML = '<div class="slot-empty">Consultando disponibilidad…</div>';
    try {
      const qs = new URLSearchParams({ date });
      if (serviceId) qs.set('serviceId', serviceId);
      const data = await fetch(`${API}/api/availability?${qs.toString()}`).then((r) => r.json());
      if (!data.available || !data.slots.length) {
        const reason = data.reason === 'cerrado' ? 'día cerrado' : (data.reason || 'sin cupo');
        el.innerHTML = `<div class="slot-empty">No hay horarios (${reason}). Prueba otro día.</div>`;
        return data;
      }
      el.innerHTML = data.slots.map((s) => `<button type="button" class="slot-btn ${s === selectedTime ? 'selected' : ''}" data-time="${s}">${s}</button>`).join('');
      $$('.slot-btn', el).forEach((b) => {
        b.addEventListener('click', () => {
          $$('.slot-btn', el).forEach((x) => x.classList.remove('selected'));
          b.classList.add('selected');
          onPick(b.dataset.time);
        });
      });
      return data;
    } catch (e) {
      el.innerHTML = '<div class="slot-empty">No pudimos cargar la disponibilidad. Intenta de nuevo.</div>';
      return { available: false, slots: [] };
    }
  }

  const pubCal = { year: new Date().getFullYear(), month: new Date().getMonth(), date: '', time: '' };

  function renderPubCalMonth() {
    $('#pubCalLabel').textContent = `${MONTH_LABELS[pubCal.month]} ${pubCal.year}`;
    paintMonth($('#pubCalGrid'), pubCal.year, pubCal.month, pubCal.date, async (iso) => {
      pubCal.date = iso;
      pubCal.time = '';
      $('#pubCalConfirm').disabled = true;
      renderPubCalMonth();
      await paintSlots($('#pubCalSlots'), iso, bkService.value, '', (t) => {
        pubCal.time = t;
        $('#pubCalConfirm').disabled = false;
      });
    });
  }

  function openBookingCalendar() {
    if (!bkService.value) { toast('Primero selecciona un servicio'); return; }
    pubCal.year = new Date().getFullYear();
    pubCal.month = new Date().getMonth();
    if (bkDate.value) {
      const [y, m] = bkDate.value.split('-').map(Number);
      pubCal.year = y; pubCal.month = m - 1; pubCal.date = bkDate.value;
    } else { pubCal.date = ''; }
    pubCal.time = bkTime.value || '';
    $('#pubCalConfirm').disabled = !pubCal.time;
    $('#bookingCalendarModal').classList.add('open');
    document.body.style.overflow = 'hidden';
    renderPubCalMonth();
    if (pubCal.date) {
      paintSlots($('#pubCalSlots'), pubCal.date, bkService.value, pubCal.time, (t) => {
        pubCal.time = t;
        $('#pubCalConfirm').disabled = false;
      });
    } else {
      $('#pubCalSlots').innerHTML = '<div class="slot-empty">Selecciona un día</div>';
    }
  }
  function closeBookingCalendar() {
    $('#bookingCalendarModal').classList.remove('open');
    if (!$('#itemModal').classList.contains('open')) document.body.style.overflow = '';
  }
  $('#bkDateBtn').addEventListener('click', openBookingCalendar);
  $('#pubCalClose').addEventListener('click', closeBookingCalendar);
  $('#pubCalCancel').addEventListener('click', closeBookingCalendar);
  $('#bookingCalendarModal').addEventListener('click', (e) => { if (e.target === $('#bookingCalendarModal')) closeBookingCalendar(); });
  $('#pubCalPrev').addEventListener('click', () => {
    pubCal.month--; if (pubCal.month < 0) { pubCal.month = 11; pubCal.year--; }
    renderPubCalMonth();
  });
  $('#pubCalNext').addEventListener('click', () => {
    pubCal.month++; if (pubCal.month > 11) { pubCal.month = 0; pubCal.year++; }
    renderPubCalMonth();
  });
  $('#pubCalConfirm').addEventListener('click', () => {
    if (!pubCal.date || !pubCal.time) return;
    bkDate.value = pubCal.date;
    bkTime.value = pubCal.time;
    updateDateLabel();
    closeBookingCalendar();
  });
  bkService.addEventListener('change', () => {
    bkDate.value = '';
    bkTime.value = '';
    updateDateLabel();
  });

  const embedCal = { year: new Date().getFullYear(), month: new Date().getMonth(), date: '', time: '', serviceId: '' };
  function bindEmbeddedCalendar(serviceId) {
    embedCal.year = new Date().getFullYear();
    embedCal.month = new Date().getMonth();
    embedCal.date = '';
    embedCal.time = '';
    embedCal.serviceId = String(serviceId);
    const render = () => {
      $('#modalCalLabel').textContent = `${MONTH_LABELS[embedCal.month]} ${embedCal.year}`;
      paintMonth($('#modalCalGrid'), embedCal.year, embedCal.month, embedCal.date, async (iso) => {
        embedCal.date = iso;
        embedCal.time = '';
        render();
        await paintSlots($('#modalCalSlots'), iso, embedCal.serviceId, '', (t) => { embedCal.time = t; });
      });
    };
    $('#modalCalPrev').addEventListener('click', () => {
      embedCal.month--; if (embedCal.month < 0) { embedCal.month = 11; embedCal.year--; }
      render();
    });
    $('#modalCalNext').addEventListener('click', () => {
      embedCal.month++; if (embedCal.month > 11) { embedCal.month = 0; embedCal.year++; }
      render();
    });
    render();
  }
  async function submitEmbeddedBooking(service) {
    if (!embedCal.date || !embedCal.time) { toast('Selecciona un día y una hora'); return; }
    const name = $('#modalBkName').value.trim();
    const phone = $('#modalBkPhone').value.trim();
    if (!name || !phone) { toast('Completa tu nombre y teléfono'); return; }
    const btn = $('#modalBookBtn');
    btn.disabled = true;
    try {
      const res = await fetch(API + '/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: service.id,
          customerName: name,
          customerPhone: phone,
          date: embedCal.date,
          time: embedCal.time,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo crear la reserva');
      closeModal();
      $('#bookingWaLink').href = data.whatsappUrl;
      $('#bookingForm').style.display = 'none';
      $('#bookingConfirm').classList.add('show');
      document.getElementById('reservas').scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      toast(err.message || 'Ocurrió un error, intenta de nuevo');
    } finally {
      btn.disabled = false;
    }
  }

  const bookingForm = $('#bookingForm');
  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!bkDate.value || !bkTime.value) { toast('Selecciona un día y un horario disponible'); return; }
    const submitBtn = $('#bookingSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.style.opacity = '.7';
    try {
      const payload = {
        serviceId: bkService.value ? Number(bkService.value) : null,
        customerName: $('#bkName').value,
        customerPhone: $('#bkPhone').value,
        date: bkDate.value,
        time: bkTime.value,
        notes: $('#bkNotes').value,
      };
      const res = await fetch(API + '/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo crear la reserva');
      $('#bookingWaLink').href = data.whatsappUrl;
      bookingForm.style.display = 'none';
      $('#bookingConfirm').classList.add('show');
    } catch (err) {
      toast(err.message || 'Ocurrió un error, intenta de nuevo');
    } finally {
      submitBtn.disabled = false;
      submitBtn.style.opacity = '';
    }
  });
  $('#bookingAnotherBtn').addEventListener('click', () => {
    bookingForm.reset();
    bkDate.value = '';
    bkTime.value = '';
    updateDateLabel();
    bookingForm.style.display = '';
    $('#bookingConfirm').classList.remove('show');
  });

  // ---------- CONSULTA PERSONALIZADA ----------
  function initCustomForm() {
    const interestGroup = $('#chipInterest');
    const ageGroup = $('#chipAge');
    const notes = $('#customNotes');
    const summary = $('#customSummary');
    const waBtn = $('#customWaBtn');

    function toggle(group, e) {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      chip.classList.toggle('selected');
      updateSummary();
    }
    interestGroup.addEventListener('click', (e) => toggle(interestGroup, e));
    ageGroup.addEventListener('click', (e) => toggle(ageGroup, e));
    notes.addEventListener('input', updateSummary);

    function updateSummary() {
      const interests = $$('.chip.selected', interestGroup).map((c) => c.dataset.val);
      const ages = $$('.chip.selected', ageGroup).map((c) => c.dataset.val);
      let msg = 'Hola AQUAZEN! Quiero pedir mi consulta personalizada.';
      let html = '';
      if (interests.length) { html += `<strong>Interés:</strong> ${interests.join(', ')}<br>`; msg += `\nInterés: ${interests.join(', ')}`; }
      if (ages.length) { html += `<strong>Para:</strong> ${ages.join(', ')}<br>`; msg += `\nPara: ${ages.join(', ')}`; }
      if (notes.value.trim()) { html += `<strong>Detalles:</strong> ${notes.value.trim()}`; msg += `\nDetalles: ${notes.value.trim()}`; }
      summary.innerHTML = html || 'Selecciona tus preferencias para ver el resumen de tu consulta personalizada.';
      waBtn.setAttribute('data-wa-msg', msg);
    }
  }

  // ---------- LOGIN ADMIN ----------
  function initLogin() {
    const loginModal = $('#loginModal');
    const openBtn = $('#loginTrigger');
    const closeBtn = $('#loginModalClose');
    openBtn.addEventListener('click', () => loginModal.classList.add('open'));
    closeBtn.addEventListener('click', () => loginModal.classList.remove('open'));
    loginModal.addEventListener('click', (e) => { if (e.target === loginModal) loginModal.classList.remove('open'); });

    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = $('#loginUser').value;
      const password = $('#loginPass').value;
      const errEl = $('#loginError');
      errEl.classList.remove('show');
      try {
        const res = await fetch(API + '/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        localStorage.setItem('aquazen_token', data.token);
        localStorage.setItem('aquazen_user', data.username);
        window.location.href = '/admin';
      } catch (err) {
        errEl.classList.add('show');
      }
    });
  }

  function initPremiumMotion() {
    const nav = $('#nav');
    const bar = $('#scrollProgress');
    const cursor = $('#cursor');
    const dot = $('#cursorDot');
    const navCta = $('#navCta');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      nav.classList.toggle('scrolled', y > 40);
      if (navCta) navCta.style.display = y > 420 ? 'inline-flex' : 'none';
      if (bar) {
        const h = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
      }
    }, { passive: true });

    if (!reduced && cursor && dot && window.matchMedia('(hover:hover) and (pointer:fine)').matches) {
      let x = 0, y = 0, cx = 0, cy = 0;
      window.addEventListener('mousemove', (e) => { x = e.clientX; y = e.clientY; });
      const loop = () => {
        cx += (x - cx) * 0.18;
        cy += (y - cy) * 0.18;
        cursor.style.left = cx + 'px';
        cursor.style.top = cy + 'px';
        dot.style.left = x + 'px';
        dot.style.top = y + 'px';
        requestAnimationFrame(loop);
      };
      loop();
      document.addEventListener('mouseover', (e) => {
        cursor.classList.toggle('hover', Boolean(e.target.closest('a, button, .service-card, .product-card')));
      });
    }

    $$('[data-count]').forEach((el) => {
      const target = Number(el.dataset.count || 0);
      const suffix = el.dataset.suffix || '';
      const obs = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          obs.unobserve(el);
          const start = performance.now();
          const dur = 1400;
          const tick = (now) => {
            const t = Math.min(1, (now - start) / dur);
            const eased = 1 - Math.pow(1 - t, 3);
            el.textContent = Math.round(target * eased) + suffix;
            if (t < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      }, { threshold: 0.4 });
      obs.observe(el);
    });
  }

  // ---------- INIT ----------
  document.addEventListener('DOMContentLoaded', async () => {
    $('#year').textContent = new Date().getFullYear();
    initNav();
    initPremiumMotion();
    initCustomForm();
    initLogin();
    bindWaButtons(document);
    await loadSettings();
    bindWaButtons(document); // reasegurar tras actualizar SETTINGS
    await Promise.all([loadCategories(), loadServices(), loadProducts(), loadTestimonials(), loadGallery()]);
    initReveal();
  });
})();
