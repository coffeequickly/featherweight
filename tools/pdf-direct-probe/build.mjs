import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
const directory = new URL('../../build/pdf-direct-probe/', import.meta.url)
await mkdir(directory, { recursive: true })
const ui = await build({
  entryPoints: ['tools/pdf-direct-probe/ui.ts'],
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2020'
})
const html = `<html><meta charset="utf-8"><style>body{font:13px/1.6 system-ui;padding:16px}button{display:block;padding:10px;margin:8px 0;cursor:pointer}button[hidden]{display:none}#status{white-space:pre-wrap}</style><h3>PDF 직접 교체 실험</h3><p>사진 한 자리의 원본과 PDF를 함께 캡처합니다.</p><div id="root"></div><p id="status"></p><button id="save" hidden>캡처 저장</button><script>${ui.outputFiles[0].text}</script></html>`
await build({
  entryPoints: ['tools/pdf-direct-probe/main.ts'],
  bundle: true,
  outfile: new URL('code.js', directory).pathname,
  format: 'iife',
  target: 'es2017',
  define: { __html__: JSON.stringify(html) }
})
await writeFile(
  new URL('manifest.json', directory),
  JSON.stringify(
    {
      name: 'Featherweight PDF Direct Probe',
      id: 'featherweight-pdf-direct-probe-local',
      api: '1.0.0',
      editorType: ['figma'],
      main: 'code.js',
      documentAccess: 'dynamic-page',
      networkAccess: { allowedDomains: ['none'] }
    },
    null,
    2
  )
)
console.log(new URL('manifest.json', directory).pathname)

await build({
  entryPoints: ['tools/pdf-direct-probe/replace.ts'],
  bundle: true,
  outfile: new URL('replace.mjs', directory).pathname,
  format: 'esm',
  platform: 'node',
  target: 'es2020'
})
