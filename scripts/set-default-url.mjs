// Bakes a default URL into the launcher (so the app opens with the URL field
// pre-filled). Used by `npm run set-url -- https://...` and by CI.
import { readFileSync, writeFileSync } from 'node:fs'

const url = (process.argv[2] || '').trim()
if (!url) {
  console.log('set-default-url: no URL provided — leaving the launcher default empty.')
  process.exit(0)
}
if (!/^https?:\/\//i.test(url)) {
  console.error(`set-default-url: "${url}" must start with http:// or https://`)
  process.exit(1)
}

const appJs = new URL('../src/app.js', import.meta.url)
let src = readFileSync(appJs, 'utf8')
const safe = url.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

const re = /const DEFAULT_URL = '[^']*'/
if (!re.test(src)) {
  console.error('set-default-url: could not find the DEFAULT_URL line in src/app.js')
  process.exit(1)
}
src = src.replace(re, `const DEFAULT_URL = '${safe}'`)
writeFileSync(appJs, src)
console.log('set-default-url: baked default URL →', url)
