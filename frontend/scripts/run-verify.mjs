import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { writeFileSync, rmSync } from 'node:fs'

const outfile = 'node_modules/.verify-outage.mjs'
await build({
  entryPoints: ['scripts/verify-outage.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  alias: { '@': new URL('../src', import.meta.url).pathname },
})

await import(pathToFileURL(outfile).href)
rmSync(outfile, { force: true })
