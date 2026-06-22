// RAIN Desktop launcher — the local config screen. Persists the URL (+ optional
// credentials) on this device and asks the Rust side to open the site in a
// native window. The site's own login (password + 2FA) happens in that window.
//
// `window.__TAURI__` is exposed because tauri.conf.json sets app.withGlobalTauri.
const invoke = window.__TAURI__?.core?.invoke

const STORE_KEY = 'rain.desktop.config.v1'
const RECENT_KEY = 'rain.desktop.recent.v1'

// A default URL can be baked at build time (CI/script replaces the token below).
const DEFAULT_URL = '__RAIN_DEFAULT_URL__'

const $ = (id) => document.getElementById(id)

function loadConfig() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') } catch { return {} }
}
function saveConfig(cfg) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)) } catch { /* ignore */ }
}
function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] }
}
function pushRecent(url) {
  const list = loadRecent().filter((u) => u !== url)
  list.unshift(url)
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 6))) } catch { /* ignore */ }
}

// ── Logo fetching ──────────────────────────────────────────────────────────
// As the user types a URL we show the store's real brand logo. The Rust side is
// asked first — it reads the store's public /api/settings → site_logo (and falls
// back to the site's icons), all without CORS. If that yields nothing we try
// Clearbit, and finally fall back to the "RAIN" wordmark.
let logoTimer = null
let logoSeq = 0

function domainFrom(raw) {
  try { return new URL(normalizeUrl(raw)).hostname.replace(/^www\./, '') } catch { return '' }
}

function showFallbackLogo() {
  const img = $('site-icon')
  img.onload = img.onerror = null
  img.hidden = true
  img.removeAttribute('src')
  $('logo-text').hidden = false
}

// Attempt to display `src`. Resolves true if the image loaded, false otherwise.
function showLogo(src) {
  return new Promise((resolve) => {
    const img = $('site-icon')
    img.onload = () => { $('logo-text').hidden = true; img.hidden = false; resolve(true) }
    img.onerror = () => resolve(false)
    img.hidden = true
    img.src = src
  })
}

async function tryLogo(raw) {
  const seq = ++logoSeq                 // ignore results from superseded keystrokes
  const current = () => seq === logoSeq
  const url = normalizeUrl(raw)
  const domain = domainFrom(raw)
  if (!url && !domain) { showFallbackLogo(); return }

  // 1) The store's own admin-set brand logo, fetched natively (no CORS).
  if (invoke && url) {
    try {
      const found = await invoke('fetch_store_logo', { url })
      if (!current()) return
      if (found && await showLogo(found)) return
      if (!current()) return
    } catch { /* fall through to Clearbit */ }
  }
  // 2) Clearbit — works for well-known brand domains.
  if (domain) {
    const ok = await showLogo(`https://logo.clearbit.com/${domain}`)
    if (!current()) return
    if (ok) return
  }
  // 3) Wordmark.
  if (current()) showFallbackLogo()
}

function scheduleLogo(raw) {
  clearTimeout(logoTimer)
  logoTimer = setTimeout(() => tryLogo(raw), 450)
}

function normalizeUrl(raw) {
  let u = (raw || '').trim()
  if (!u) return ''
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u
  try { return new URL(u).toString() } catch { return '' }
}

function renderRecent() {
  const list = loadRecent()
  const wrap = $('recent-wrap')
  const ul = $('recent-list')
  ul.innerHTML = ''
  if (!list.length) { wrap.hidden = true; return }
  wrap.hidden = false
  for (const url of list) {
    const li = document.createElement('li')
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'recent-item'
    btn.textContent = url
    btn.addEventListener('click', () => { $('url').value = url; openSite() })
    li.appendChild(btn)
    ul.appendChild(li)
  }
}

async function openSite() {
  $('error').textContent = ''
  const url = normalizeUrl($('url').value)
  if (!url) { $('error').textContent = 'Please enter a valid URL (e.g. https://admin.mystore.com).'; return }

  const username = $('username').value
  const password = $('password').value
  const remember = $('remember').checked

  // Persist for next launch. Password is only stored when "remember" is ticked.
  saveConfig({ url, username, remember, password: remember ? password : '' })
  pushRecent(url)
  renderRecent()

  if (!invoke) {
    // Running outside Tauri (e.g. opened in a plain browser for QA).
    $('error').textContent = 'Native bridge unavailable — run inside the desktop app (pnpm tauri dev).'
    return
  }

  const btn = document.querySelector('.open-btn')
  btn.disabled = true
  btn.textContent = 'Opening…'
  try {
    await invoke('open_site', { url, username, password })
  } catch (e) {
    $('error').textContent = 'Could not open the site: ' + (e?.message || e)
  } finally {
    btn.disabled = false
    btn.textContent = 'Open site'
  }
}

function hydrate() {
  const cfg = loadConfig()
  const baked = DEFAULT_URL.startsWith('__RAIN') ? '' : DEFAULT_URL
  $('url').value = cfg.url || baked || ''
  $('username').value = cfg.username || ''
  $('password').value = cfg.password || ''
  $('remember').checked = !!cfg.remember
  if (cfg.username || cfg.password) document.querySelector('.creds').open = true
  renderRecent()
  // Show logo for whatever URL is already in the field (baked or saved).
  tryLogo($('url').value)
}

document.getElementById('launch-form').addEventListener('submit', (e) => { e.preventDefault(); openSite() })
$('url').addEventListener('input', (e) => scheduleLogo(e.target.value))
hydrate()
