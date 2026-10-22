import fs from 'node:fs'
import zlib from 'node:zlib'

const manifest = JSON.parse(fs.readFileSync('dist/.vite/manifest.json', 'utf8'))

// Count each static dependency once. Dynamic imports belong to later user actions.
function graph(key, seen = new Set()) {
  if (seen.has(key)) return seen
  if (!manifest[key]) throw new Error(`Missing client manifest entry: ${key}`)
  seen.add(key)
  for (const dependency of manifest[key].imports || []) graph(dependency, seen)
  return seen
}

function measure(keys) {
  const seen = new Set()
  for (const key of keys) graph(key, seen)
  const files = [...seen].map(key => manifest[key].file).filter(file => file.endsWith('.js'))
  return {
    files,
    bytes: files.reduce((total, file) => total + fs.statSync(`dist/${file}`).size, 0),
    gzip: files.reduce((total, file) => total + zlib.gzipSync(fs.readFileSync(`dist/${file}`)).length, 0),
  }
}

const report = {
  entry: measure(['index.html']),
  landingWithAuth: measure(['index.html', 'src/auth/AuthenticatedApp.tsx']),
  quote: measure(['index.html', 'src/App.tsx']),
  fontBytes: fs.statSync('dist/fonts/inter-latin-v20.woff2').size,
}
console.log(JSON.stringify(report, null, 2))
if (report.entry.gzip > 95_000) throw new Error('Initial JavaScript exceeds 95 KB gzip budget')
if (report.landingWithAuth.gzip > 180_000) throw new Error('Landing with auth exceeds 180 KB gzip budget')
