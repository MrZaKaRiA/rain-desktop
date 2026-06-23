// Renames a release's installer assets to strict, unambiguous names so anyone
// can tell at a glance exactly which file they need. Run by CI after the matrix
// build (see .github/workflows/build.yml); safe to re-run locally too.
//
//   env: GITHUB_TOKEN, GITHUB_REPOSITORY (owner/repo),
//        RELEASE_TAG and/or RELEASE_NAME identifying the (draft) release.
//
// Default Tauri names → strict names:
//   ..._aarch64.dmg            → RAIN-Desktop-macOS-Apple-Silicon.dmg
//   ..._x64.dmg                → RAIN-Desktop-macOS-Intel.dmg
//   ..._x64-setup.exe          → RAIN-Desktop-Windows-x64-Setup.exe
//   ..._arm64-setup.exe        → RAIN-Desktop-Windows-ARM64-Setup.exe
//   ..._x64_en-US.msi          → RAIN-Desktop-Windows-x64.msi
//   ..._arm64_en-US.msi        → RAIN-Desktop-Windows-ARM64.msi
//   ..._amd64.AppImage         → RAIN-Desktop-Linux-x64.AppImage
//   ..._aarch64.AppImage       → RAIN-Desktop-Linux-ARM64.AppImage
//   ..._amd64.deb              → RAIN-Desktop-Linux-x64.deb
//   ..._arm64.deb              → RAIN-Desktop-Linux-ARM64.deb
//   ...x86_64.rpm              → RAIN-Desktop-Linux-x64.rpm
//   ...aarch64.rpm             → RAIN-Desktop-Linux-ARM64.rpm

const token = process.env.GITHUB_TOKEN
const repo = process.env.GITHUB_REPOSITORY
const wantTag = process.env.RELEASE_TAG || ''
const wantName = process.env.RELEASE_NAME || ''

if (!token || !repo) {
  console.error('missing GITHUB_TOKEN / GITHUB_REPOSITORY — skipping rename')
  process.exit(0)
}

const api = (path, init = {}) =>
  fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })

// Order matters only in that each rule is specific; first match wins.
const RULES = [
  [/aarch64\.app\.tar\.gz$/i, 'RAIN-Desktop-macOS-Apple-Silicon.app.tar.gz'],
  [/x64\.app\.tar\.gz$/i, 'RAIN-Desktop-macOS-Intel.app.tar.gz'],
  [/aarch64\.dmg$/i, 'RAIN-Desktop-macOS-Apple-Silicon.dmg'],
  [/x64\.dmg$/i, 'RAIN-Desktop-macOS-Intel.dmg'],
  [/arm64-setup\.exe$/i, 'RAIN-Desktop-Windows-ARM64-Setup.exe'],
  [/x64-setup\.exe$/i, 'RAIN-Desktop-Windows-x64-Setup.exe'],
  [/arm64_.*\.msi$/i, 'RAIN-Desktop-Windows-ARM64.msi'],
  [/x64_.*\.msi$/i, 'RAIN-Desktop-Windows-x64.msi'],
  [/aarch64\.AppImage$/i, 'RAIN-Desktop-Linux-ARM64.AppImage'],
  [/amd64\.AppImage$/i, 'RAIN-Desktop-Linux-x64.AppImage'],
  [/aarch64\.rpm$/i, 'RAIN-Desktop-Linux-ARM64.rpm'],
  [/x86_64\.rpm$/i, 'RAIN-Desktop-Linux-x64.rpm'],
  [/arm64\.deb$/i, 'RAIN-Desktop-Linux-ARM64.deb'],
  [/amd64\.deb$/i, 'RAIN-Desktop-Linux-x64.deb'],
]

const strictName = (n) => {
  for (const [re, name] of RULES) if (re.test(n)) return name
  return null
}

const releases = await (await api(`/repos/${repo}/releases`)).json()
if (!Array.isArray(releases)) {
  console.error('could not list releases:', JSON.stringify(releases))
  process.exit(0)
}
const rel = releases.find(
  (r) => (wantTag && r.tag_name === wantTag) || (wantName && r.name === wantName),
)
if (!rel) {
  console.error(`release not found (tag="${wantTag}" name="${wantName}")`)
  process.exit(0)
}

console.log(`Renaming assets on "${rel.name}" (${rel.assets.length} assets)`)
for (const a of rel.assets) {
  const want = strictName(a.name)
  if (!want || want === a.name) continue
  const res = await api(`/repos/${repo}/releases/assets/${a.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name: want }),
  })
  console.log(res.ok ? `  ✓ ${a.name} → ${want}` : `  ✗ ${a.name} (HTTP ${res.status})`)
}
