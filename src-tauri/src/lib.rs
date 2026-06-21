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

/// Best-effort credential prefill, injected before the page's own scripts run.
/// Values are JSON-encoded so they cannot break out of the string or inject code.
fn build_prefill_script(username: &str, password: &str) -> String {
    if username.is_empty() && password.is_empty() {
        return String::new();
    }
    let user = serde_json::to_string(username).unwrap_or_else(|_| "\"\"".into());
    let pass = serde_json::to_string(password).unwrap_or_else(|_| "\"\"".into());
    format!(
        r#"(function(){{
  var U = {user}, P = {pass};
  function pick(sels){{ for (var i=0;i<sels.length;i++){{ var el=document.querySelector(sels[i]); if(el) return el; }} return null; }}
  function set(el,v){{ if(!el) return; el.value=v; el.dispatchEvent(new Event('input',{{bubbles:true}})); el.dispatchEvent(new Event('change',{{bubbles:true}})); }}
  function fill(){{
    try {{
      if (U) set(pick(['input[autocomplete=username]','input[type=email]','input[name*=email i]','input[name*=user i]','input[id*=email i]','input[id*=user i]','input[type=text]']), U);
      if (P) set(pick(['input[type=password]','input[autocomplete=current-password]']), P);
    }} catch(e){{}}
  }}
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', fill); else fill();
  setTimeout(fill, 600); setTimeout(fill, 1600);
}})();"#
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![open_site])
        .run(tauri::generate_context!())
        .expect("error while running RAIN Desktop");
}
