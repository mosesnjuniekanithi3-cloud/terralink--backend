const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json({ limit: '15mb' }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const ADMIN_KEY = process.env.ADMIN_KEY || 'change-me';

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS listings (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      location TEXT NOT NULL,
      price TEXT,
      type TEXT NOT NULL,
      description TEXT,
      photo_data TEXT,
      photo_mime TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
}
init().catch(err => console.error('DB init failed:', err));

function requireAdmin(req, res, next) {
  if (req.get('x-admin-key') !== ADMIN_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// ---------- API ----------

app.get('/api/listings', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, title, location, price, type, description, (photo_data IS NOT NULL) AS has_photo, created_at FROM listings ORDER BY created_at DESC'
  );
  res.json(rows);
});

app.post('/api/admin/listings', requireAdmin, async (req, res) => {
  const { title, location, price, type, description, photo_base64, photo_mime } = req.body;
  if (!title || !location || !type) {
    return res.status(400).json({ error: 'title, location and type are required' });
  }
  const { rows } = await pool.query(
    `INSERT INTO listings (title, location, price, type, description, photo_data, photo_mime)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [title, location, price || 'On request', type, description || '', photo_base64 || null, photo_mime || null]
  );
  res.json({ ok: true, id: rows[0].id });
});

app.delete('/api/admin/listings/:id', requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM listings WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

app.get('/photo/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT photo_data, photo_mime FROM listings WHERE id=$1', [req.params.id]);
  if (!rows.length || !rows[0].photo_data) return res.status(404).send('Not found');
  res.set('Content-Type', rows[0].photo_mime || 'image/jpeg');
  res.send(Buffer.from(rows[0].photo_data, 'base64'));
});

// ---------- Site ----------

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function listingCard(l) {
  const img = l.has_photo
    ? `<img src="/photo/${l.id}" alt="${escapeHtml(l.title)}" style="width:100%;height:180px;object-fit:cover;margin-bottom:14px;border-radius:2px;">`
    : '';
  return `
    <div class="listing-card">
      ${img}
      <div class="listing-tag">${escapeHtml(l.type)}</div>
      <div class="listing-name">${escapeHtml(l.title)}</div>
      <div class="listing-loc">${escapeHtml(l.location)}</div>
      <div class="listing-price">${escapeHtml(l.price)} <a href="#contact">Enquire</a></div>
    </div>`;
}

app.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM listings ORDER BY created_at DESC LIMIT 12');
  const listingsHtml = rows.length
    ? rows.map(listingCard).join('')
    : `<div style="padding:40px;color:#6b7686;grid-column:1/-1;text-align:center;">New listings coming soon — check back shortly.</div>`;

  res.send(PAGE_TEMPLATE.replace('<!--LISTINGS-->', listingsHtml));
});

const PAGE_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Terralink Kenya Limited | Real Estate, Ngong Town</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Work+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--navy:#14213D;--navy-deep:#0D1730;--gold:#C9A24B;--gold-soft:#E4CE93;--paper:#F6F3EC;--ink:#1C2430;--line:rgba(20,33,61,0.14);--font-display:'Fraunces',serif;--font-body:'Work Sans',sans-serif;}
*{box-sizing:border-box;margin:0;padding:0;}
html{scroll-behavior:smooth;}
body{background:var(--paper);color:var(--ink);font-family:var(--font-body);line-height:1.55;-webkit-font-smoothing:antialiased;}
a{color:inherit;}
img{max-width:100%;display:block;}
.wrap{max-width:1120px;margin:0 auto;padding:0 28px;}
header{position:sticky;top:0;z-index:50;background:var(--paper);border-bottom:1px solid var(--line);}
.nav{display:flex;align-items:center;justify-content:space-between;padding:18px 28px;max-width:1120px;margin:0 auto;}
.brand{display:flex;align-items:center;gap:10px;}
.brand-name{font-family:var(--font-display);font-size:1.28rem;color:var(--navy);}
.brand-name span{color:var(--gold);}
nav.links{display:flex;gap:32px;}
nav.links a{font-size:.92rem;text-decoration:none;color:var(--ink);}
.nav-cta{background:var(--navy);color:var(--paper);padding:10px 20px;border-radius:2px;text-decoration:none;font-size:.88rem;font-weight:500;white-space:nowrap;}
.hero{position:relative;background:var(--navy);color:var(--paper);overflow:hidden;}
.hero .wrap{padding:96px 28px 88px;position:relative;z-index:2;}
.hero-eyebrow{font-size:.9rem;color:var(--gold-soft);margin-bottom:22px;max-width:480px;}
h1.hero-title{font-family:var(--font-display);font-weight:500;font-size:clamp(2.4rem,5vw,4rem);line-height:1.08;max-width:680px;}
.hero-title em{font-style:italic;color:var(--gold-soft);}
.hero-sub{max-width:480px;margin-top:26px;font-size:1.05rem;color:rgba(246,243,236,.82);}
.hero-actions{display:flex;gap:16px;margin-top:38px;flex-wrap:wrap;}
.btn{display:inline-flex;align-items:center;gap:8px;padding:13px 26px;text-decoration:none;font-size:.92rem;font-weight:500;border-radius:2px;border:1px solid transparent;}
.btn-gold{background:var(--gold);color:var(--navy-deep);}
.btn-outline{border-color:rgba(246,243,236,.4);color:var(--paper);}
section{padding:88px 0;}
.section-head{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:48px;flex-wrap:wrap;}
.section-title{font-family:var(--font-display);font-size:clamp(1.7rem,3vw,2.3rem);font-weight:500;color:var(--navy);max-width:480px;}
.section-note{max-width:340px;font-size:.95rem;color:#55606f;}
.listing-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);border:1px solid var(--line);}
.listing-card{background:var(--paper);padding:30px 26px;display:flex;flex-direction:column;gap:10px;}
.listing-tag{font-size:.78rem;color:var(--gold);}
.listing-name{font-family:var(--font-display);font-size:1.3rem;color:var(--navy);}
.listing-loc{font-size:.88rem;color:#6b7686;}
.listing-price{margin-top:auto;padding-top:16px;border-top:1px solid var(--line);font-size:1.02rem;font-weight:600;color:var(--navy);display:flex;justify-content:space-between;align-items:center;}
.listing-price a{font-size:.82rem;font-weight:500;color:var(--gold);text-decoration:none;border-bottom:1px solid var(--gold);}
.services{background:#EFEADD;}
.service-list{display:grid;grid-template-columns:repeat(3,1fr);gap:40px;}
.service-num{font-family:var(--font-display);font-size:1.1rem;color:var(--gold);margin-bottom:14px;}
.service-title{font-size:1.08rem;font-weight:600;color:var(--navy);margin-bottom:10px;}
.service-desc{font-size:.92rem;color:#55606f;}
.contact{background:var(--navy-deep);color:var(--paper);}
.contact .wrap{display:grid;grid-template-columns:1.1fr .9fr;gap:64px;align-items:start;}
.contact-title{font-family:var(--font-display);font-size:clamp(1.8rem,3.4vw,2.5rem);max-width:420px;line-height:1.15;}
.contact-sub{margin-top:18px;color:rgba(246,243,236,.72);max-width:400px;}
.contact-list{display:flex;flex-direction:column;gap:22px;}
.contact-item{border-top:1px solid rgba(246,243,236,.16);padding-top:18px;}
.contact-label{font-size:.78rem;color:var(--gold-soft);margin-bottom:6px;}
.contact-value a{text-decoration:none;}
footer{background:var(--navy-deep);border-top:1px solid rgba(246,243,236,.14);padding:26px 0;}
footer .wrap{display:flex;justify-content:space-between;align-items:center;color:rgba(246,243,236,.55);font-size:.82rem;flex-wrap:wrap;gap:10px;}
@media (max-width:860px){nav.links{display:none;}.listing-grid{grid-template-columns:1fr;}.service-list{grid-template-columns:1fr;gap:34px;}.contact .wrap{grid-template-columns:1fr;gap:40px;}}
</style>
</head>
<body>
<header><div class="nav">
  <div class="brand">
    <svg width="34" height="34" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 4L36 16V36H24V24H16V36H4V16L20 4Z" stroke="#C9A24B" stroke-width="2" stroke-linejoin="round"/></svg>
    <div class="brand-name">Terra<span>link</span></div>
  </div>
  <nav class="links"><a href="#listings">Listings</a><a href="#services">Services</a><a href="#contact">Contact</a></nav>
  <a class="nav-cta" href="https://wa.me/254715885446" target="_blank" rel="noopener">WhatsApp Us</a>
</div></header>

<section class="hero">
  <div class="wrap">
    <div class="hero-eyebrow">Terralink Kenya Limited — Ngong Town, Kajiado County</div>
    <h1 class="hero-title">Land and property in Kenya, <em>handled properly.</em></h1>
    <p class="hero-sub">We connect buyers, sellers, and landlords across Ngong and surrounding areas — with honest listings, verified documents, and someone who actually picks up the phone.</p>
    <div class="hero-actions">
      <a class="btn btn-gold" href="https://wa.me/254715885446" target="_blank" rel="noopener">Talk to us</a>
      <a class="btn btn-outline" href="#listings">See listings</a>
    </div>
  </div>
</section>

<section class="listings" id="listings">
  <div class="wrap">
    <div class="section-head">
      <div class="section-title">Available now</div>
      <div class="section-note">Updated directly by Terralink. Get in touch for full details and site visits.</div>
    </div>
    <div class="listing-grid"><!--LISTINGS--></div>
  </div>
</section>

<section class="services" id="services">
  <div class="wrap">
    <div class="section-head"><div class="section-title">What we handle</div></div>
    <div class="service-list">
      <div><div class="service-num">01</div><div class="service-title">Buying &amp; selling</div><div class="service-desc">We match serious buyers with verified sellers, and guide the process from viewing to transfer.</div></div>
      <div><div class="service-num">02</div><div class="service-title">Rentals &amp; letting</div><div class="service-desc">Finding tenants for landlords, and finding the right home for tenants.</div></div>
      <div><div class="service-num">03</div><div class="service-title">Property management</div><div class="service-desc">Ongoing management for landlords who want their property looked after properly.</div></div>
    </div>
  </div>
</section>

<section class="contact" id="contact">
  <div class="wrap">
    <div>
      <div class="contact-title">Have a property to sell, rent, or find?</div>
      <p class="contact-sub">Reach out directly — we respond fast and can arrange a site visit.</p>
    </div>
    <div class="contact-list">
      <div class="contact-item"><div class="contact-label">WhatsApp</div><div class="contact-value"><a href="https://wa.me/254715885446">+254 715 885 446</a></div></div>
      <div class="contact-item"><div class="contact-label">Email</div><div class="contact-value"><a href="mailto:info@terralinkkenya.co.ke">info@terralinkkenya.co.ke</a></div></div>
      <div class="contact-item"><div class="contact-label">Location</div><div class="contact-value">Ngong Town, Kajiado County, Kenya</div></div>
    </div>
  </div>
</section>

<footer><div class="wrap"><div>&copy; 2026 Terralink Kenya Limited.</div><div>Ngong Town, Kajiado County</div></div></footer>
</body>
</html>`;

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Terralink running on ${PORT}`));
