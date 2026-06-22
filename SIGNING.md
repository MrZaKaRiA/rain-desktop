# macOS: making the app open without the Gatekeeper warning

If you **download** the app and macOS says *"Apple could not verify 'RAIN Desktop' is
free of malware"*, that's **Gatekeeper** — Apple blocks any app downloaded from the
internet that isn't **notarized**. It is *not* a bug in the app, and it's identical for
every unsigned app (it only appears on downloaded copies, never on ones you built locally).

You have three options, from "free right now" to "proper fix".

---

## 1. Free — build it locally (opens directly, like before)

Apps you build on your own Mac are **not quarantined**, so they open with no warning:

```bash
npm install
npm run build
# then install from:  src-tauri/target/release/bundle/dmg/
```

This is exactly why the first version "just worked" — it was a local build, not a download.

## 2. Free — approve the downloaded app once (no Terminal)

For a copy you already downloaded, on **macOS Ventura/Sonoma/Sequoia**:

1.  System Settings → **Privacy & Security**
2.  scroll down to *"RAIN Desktop was blocked…"* → click **Open Anyway**
3.  authenticate → **Open**

One click, once per version. No Terminal, no `xattr`.

## 3. Proper fix — notarize in CI (downloads open directly for everyone)

This is the only way a **downloaded** app opens with **zero** warnings for all users.
It requires an **Apple Developer Program** membership ($99/yr). The CI is already wired
for it — you only need to add six repository secrets
(*Settings → Secrets and variables → Actions*):

| Secret | What it is | Where to get it |
| --- | --- | --- |
| `APPLE_CERTIFICATE` | base64 of your **Developer ID Application** `.p12` | export from Keychain, then `base64 -i cert.p12 \| pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | the password you set on that `.p12` | you chose it on export |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Your Name (TEAMID)` | `security find-identity -v -p codesigning` |
| `APPLE_ID` | your Apple ID email | your Apple account |
| `APPLE_PASSWORD` | an **app-specific password** (not your login password) | https://account.apple.com → Sign-In & Security → App-Specific Passwords |
| `APPLE_TEAM_ID` | your 10-char Team ID | https://developer.apple.com/account → Membership |

Get the certificate from <https://developer.apple.com/account/resources/certificates>
(create a **Developer ID Application** certificate), download it, double-click to add it to
Keychain, then export it as `.p12`.

Once the secrets are set, **every build is automatically signed + notarized** — the
`.dmg` on the Releases page opens with a normal double-click, no prompt. Nothing else to
change; if the secrets are absent the build stays unsigned (options 1 and 2 still apply).

> **Windows** shows a similar SmartScreen prompt (*More info → Run anyway*). Removing it
> needs a paid code-signing certificate; the same workflow can carry one later.
