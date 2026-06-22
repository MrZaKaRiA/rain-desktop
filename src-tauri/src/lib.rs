use std::time::Duration;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

/// Open the target site in a dedicated native window. The site's own login form
/// (and 2FA) is handled inside that window. If a username/password are supplied,
/// a best-effort init script types them into the login form — 2FA is never
/// auto-filled.
#[tauri::command]
fn open_site(
    app: tauri::AppHandle,
    url: String,
    username: String,
    password: String,
) -> Result<(), String> {
    let parsed = tauri::Url::parse(url.trim()).map_err(|e| format!("Invalid URL: {e}"))?;
    match parsed.scheme() {
        "http" | "https" => {}
        other => return Err(format!("Only http/https URLs are allowed (got '{other}').")),
    }

    // Replace any existing site window so re-opening doesn't error.
    if let Some(existing) = app.get_webview_window("site") {
        let _ = existing.close();
    }

    let script = build_prefill_script(&username, &password);

    WebviewWindowBuilder::new(&app, "site", WebviewUrl::External(parsed))
        .title("RAIN Desktop")
        .inner_size(1280.0, 860.0)
        .min_inner_size(720.0, 520.0)
        .center()
        .initialization_script(&script)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Best-effort fetch of the store's real brand logo, shown in the launcher header.
/// Done in Rust so it isn't blocked by CORS. Order of preference:
///   1. the RAIN public settings API (`/api/settings` → `site_logo`)
///   2. the page's `<link rel="apple-touch-icon">` / `<link rel="icon">` / `og:image`
/// Returns an absolute image URL, or "" when nothing suitable is found (the UI
/// then falls back to the "RAIN" wordmark).
#[tauri::command]
fn fetch_store_logo(url: String) -> Result<String, String> {
    let parsed = tauri::Url::parse(url.trim()).map_err(|e| format!("Invalid URL: {e}"))?;
    match parsed.scheme() {
        "http" | "https" => {}
        _ => return Ok(String::new()),
    }
    let host = match parsed.host_str() {
        Some(h) => h,
        None => return Ok(String::new()),
    };
    let origin = match parsed.port() {
        Some(p) => format!("{}://{}:{}", parsed.scheme(), host, p),
        None => format!("{}://{}", parsed.scheme(), host),
    };

    // 1) RAIN public settings — the real, admin-uploaded brand logo.
    if let Some(logo) = logo_from_settings(&origin) {
        return Ok(absolutize(&origin, &logo));
    }
    // 2) Fall back to the site's own icons / social image.
    if let Some(icon) = logo_from_html(&origin) {
        return Ok(absolutize(&origin, &icon));
    }
    Ok(String::new())
}

fn http_get(url: &str) -> Option<String> {
    let resp = ureq::get(url)
        .timeout(Duration::from_secs(6))
        .set("User-Agent", "RAINDesktop/0.1 (+launcher)")
        .set("Accept", "application/json, text/html;q=0.9, */*;q=0.8")
        .call()
        .ok()?;
    resp.into_string().ok()
}

/// Pull `site_logo` (or close cousins) out of the public `/api/settings` JSON.
fn logo_from_settings(origin: &str) -> Option<String> {
    let body = http_get(&format!("{origin}/api/settings"))?;
    let v: serde_json::Value = serde_json::from_str(&body).ok()?;
    // settings may be the object itself or wrapped in {"data": {...}}
    let obj = v.get("data").unwrap_or(&v);
    for key in ["site_logo", "site_home_icon", "site_favicon"] {
        if let Some(s) = obj.get(key).and_then(|x| x.as_str()) {
            let s = s.trim();
            if !s.is_empty() {
                return Some(s.to_string());
            }
        }
    }
    None
}

/// Scan the home page HTML for an icon/social image, in order of quality.
fn logo_from_html(origin: &str) -> Option<String> {
    let html = http_get(origin)?;
    for needle in ["apple-touch-icon", "og:image", "rel=\"icon\"", "rel='icon'", "icon"] {
        if let Some(u) = extract_tag_asset(&html, needle) {
            return Some(u);
        }
    }
    None
}

/// Find the first tag containing `needle` and return its href="" or content="".
fn extract_tag_asset(html: &str, needle: &str) -> Option<String> {
    // ASCII-only lowercasing keeps byte indices aligned with `html` (Unicode
    // to_lowercase() can change length and corrupt the slice offsets).
    let lower = html.to_ascii_lowercase();
    let key = needle.to_ascii_lowercase();
    let mut from = 0usize;
    while let Some(rel) = lower[from..].find(&key) {
        let hit = from + rel;
        let tag_start = lower[..hit].rfind('<')?;
        let tag_end = lower[hit..].find('>').map(|e| hit + e)?;
        let tag = &html[tag_start..tag_end];
        for attr in ["href", "content"] {
            if let Some(val) = attr_value(tag, attr) {
                if !val.is_empty() {
                    return Some(val);
                }
            }
        }
        from = tag_end + 1;
    }
    None
}

/// Read `attr="..."` (or `attr='...'`, or unquoted) from a single tag string.
fn attr_value(tag: &str, attr: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
    let at = lower.find(&format!("{attr}="))?;
    let after = &tag[at + attr.len() + 1..];
    let mut chars = after.chars();
    match chars.next()? {
        q @ ('"' | '\'') => {
            let rest = &after[1..];
            let end = rest.find(q)?;
            Some(rest[..end].trim().to_string())
        }
        _ => {
            let end = after
                .find(|c: char| c.is_whitespace() || c == '>' || c == '/')
                .unwrap_or(after.len());
            Some(after[..end].trim().to_string())
        }
    }
}

/// Resolve a possibly-relative asset reference against the site origin.
fn absolutize(origin: &str, val: &str) -> String {
    let v = val.trim();
    if v.starts_with("http://") || v.starts_with("https://") || v.starts_with("data:") {
        v.to_string()
    } else if let Some(rest) = v.strip_prefix("//") {
        let scheme = origin.split("://").next().unwrap_or("https");
        format!("{scheme}://{rest}")
    } else if v.starts_with('/') {
        format!("{origin}{v}")
    } else {
        format!("{origin}/{v}")
    }
}

/// Best-effort credential prefill, injected before the page's own scripts run.
/// Values are JSON-encoded so they cannot break out of the string or inject code.
/// Runs several times because the login form is usually rendered by a SPA after
/// first paint; it never overwrites a field the user has already started typing.
fn build_prefill_script(username: &str, password: &str) -> String {
    if username.is_empty() && password.is_empty() {
        return String::new();
    }
    let user = serde_json::to_string(username).unwrap_or_else(|_| "\"\"".into());
    let pass = serde_json::to_string(password).unwrap_or_else(|_| "\"\"".into());
    format!(
        r#"(function(){{
  var U = {user}, P = {pass};
  function pick(sels){{ for (var i=0;i<sels.length;i++){{ var el=document.querySelector(sels[i]); if(el&&el.offsetParent!==null) return el; }} return null; }}
  function set(el,v){{ if(!el) return false; if(el.value && el.value!==v) return false; if(el.value===v) return true;
    var d=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value');
    if(d&&d.set){{ d.set.call(el,v); }} else {{ el.value=v; }}
    el.dispatchEvent(new Event('input',{{bubbles:true}}));
    el.dispatchEvent(new Event('change',{{bubbles:true}}));
    return true; }}
  function fill(){{
    try {{
      if (U) set(pick(['input[autocomplete=username]','input[type=email]','input[name*=email i]','input[name*=user i]','input[id*=email i]','input[id*=user i]','input[type=text]']), U);
      if (P) set(pick(['input[type=password]','input[autocomplete=current-password]']), P);
    }} catch(e){{}}
  }}
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', fill); else fill();
  [150,500,1200,2500,4000].forEach(function(t){{ setTimeout(fill,t); }});
}})();"#
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![open_site, fetch_store_logo])
        .run(tauri::generate_context!())
        .expect("error while running RAIN Desktop");
}
