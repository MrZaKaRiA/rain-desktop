// Writes a plain solid-color 1024x1024 app-icon.png when none is committed, so
// `tauri icon` (and therefore the build) always succeeds. Replace app-icon.png
// with your own 1024x1024 artwork any time and re-run `npm run icons`.
import { writeFileSync, existsSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const out = new URL('../app-icon.png', import.meta.url)
if (existsSync(out)) {
  console.log('app-icon.png already exists — keeping it.')
  process.exit(0)
}

const SIZE = 1024
const [R, G, B, A] = [26, 26, 26, 255] // #1a1a1a, opaque

const rowLen = 1 + SIZE * 4
const raw = Buffer.alloc(rowLen * SIZE)
for (let y = 0; y < SIZE; y++) {
  const off = y * rowLen
  raw[off] = 0 // filter: none
  for (let x = 0; x < SIZE; x++) {
    const p = off + 1 + x * 4
    raw[p] = R; raw[p + 1] = G; raw[p + 2] = B; raw[p + 3] = A
  }
}

const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0 // 8-bit RGBA
const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])

writeFileSync(out, png)
console.log('Wrote placeholder app-icon.png (1024x1024).')
