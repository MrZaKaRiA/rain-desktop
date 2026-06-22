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
// When the user types a URL we try Clearbit's public logo API (returns actual
// brand logos, not favicons). On any failure we fall back to the "RAIN" text.
let logoTimer = null

function domainFrom(raw) {
  try { return new URL(normalizeUrl(raw)).hostname.replace(/^www\./, '') } catch { return '' }
}

function showFallbackLogo() {
  const img = $('site-icon')
  const txt = $('logo-text')
  img.hidden = true
  img.src = ''
  txt.hidden = false
}

function tryLogo(domain) {
  if (!domain) { showFallbackLogo(); return }
  const img = $('site-icon')
  const txt = $('logo-text')
  const src = `https://logo.clearbit.com/${domain}`
  img.onload = () => { txt.hidden = true; img.hidden = false }
  img.onerror = () => showFallbackLogo()
  img.hidden = true
  img.src = src
}

function scheduleLogo(raw) {
  clearTimeout(logoTimer)
  logoTimer = setTimeout(() => tryLogo(domainFrom(raw)), 500)
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
  tryLogo(domainFrom($('url').value))
}

document.getElementById('launch-form').addEventListener('submit', (e) => { e.preventDefault(); openSite() })
$('url').addEventListener('input', (e) => scheduleLogo(e.target.value))
hydrate()
