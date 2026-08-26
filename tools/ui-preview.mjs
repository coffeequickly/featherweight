// UI 를 브라우저에서 띄워 본다. Figma 를 열지 않고 레이아웃을 확인하려는 용도다.
//
//   npm run ui:preview        → http://localhost:9138
//
// Figma 플러그인 UI 는 iframe 안에서 돌고 `window.parent` 로 메시지를 보낸다.
// 그래서 여기서도 iframe 에 넣고, 바깥 페이지가 메인 스레드 흉내를 낸다.
// (iframe 없이 띄우면 UI 가 자기 자신에게 메시지를 보내 예외가 난다)
//
// 색은 Figma 가 주입하는 CSS 변수에 의존한다. 대표값만 흉내 낸다 — 픽셀 색이 아니라
// 정렬·넘침을 보는 도구다.

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const PORT = Number(process.env.SHEAF_UI_PORT ?? 9138)

const FIGMA_VARS = `
:root {
  color-scheme: light;
  --figma-color-bg: #ffffff;
  --figma-color-bg-secondary: #f5f5f5;
  --figma-color-bg-hover: #f0f0f0;
  --figma-color-bg-brand: #0d99ff;
  --figma-color-bg-disabled: #f0f0f0;
  --figma-color-border: #e6e6e6;
  --figma-color-border-strong: #b3b3b3;
  --figma-color-text: #000000;
  --figma-color-text-secondary: #666666;
  --figma-color-text-disabled: #b3b3b3;
  --figma-color-text-onbrand: #ffffff;
  --figma-color-icon: #333333;
  --figma-color-icon-secondary: #808080;
  --figma-color-bg-warning-tertiary: #fff1c2;
  --figma-color-text-warning: #a15c07;
}
body { margin: 0; background: var(--figma-color-bg); }
`

// 다크 대푯값 — 픽셀 색이 아니라 정렬·대비를 보는 용도다
const FIGMA_VARS_DARK = `
:root {
  color-scheme: dark;
  --figma-color-bg: #2c2c2c;
  --figma-color-bg-secondary: #383838;
  --figma-color-bg-hover: #3f3f3f;
  --figma-color-bg-brand: #0d99ff;
  --figma-color-bg-disabled: #3a3a3a;
  --figma-color-border: #444444;
  --figma-color-border-strong: #5c5c5c;
  --figma-color-text: #ffffff;
  --figma-color-text-secondary: #a8a8a8;
  --figma-color-text-disabled: #6a6a6a;
  --figma-color-text-onbrand: #ffffff;
  --figma-color-icon: #cccccc;
  --figma-color-icon-secondary: #8c8c8c;
  --figma-color-bg-warning-tertiary: #4a3a12;
  --figma-color-text-warning: #f3c11b;
}
body { margin: 0; background: var(--figma-color-bg); }
`

/** 메인 스레드가 보내는 메시지를 흉내 낸다. UI 가 듣는 이름만 보낸다. */
const FIXTURE = {
  settings: {
    version: 1,
    quality: 0.8,
    multiplier: 1.5,
    maxEdge: 2048,
    reencodeOpaquePng: true,
    embedText: true
  },
  selection: [
    {
      id: '1',
      name: '01 Cover',
      width: 595,
      height: 842,
      x: 0,
      y: 0,
      imageCount: 1,
      textCount: 24
    },
    {
      id: '2',
      name: '02 About me and the very long frame name that overflows',
      width: 595,
      height: 842,
      x: 700,
      y: 0,
      imageCount: 1,
      textCount: 22
    },
    {
      id: '3',
      name: '03 Project',
      width: 595,
      height: 842,
      x: 0,
      y: 900,
      imageCount: 8,
      textCount: 86
    }
  ],
  fonts: [
    {
      family: 'Pretendard Variable',
      style: 'Regular',
      weight: 400,
      italic: false,
      nodeCount: 128,
      charCount: 18901
    },
    {
      family: 'Pretendard Variable',
      style: 'SemiBold',
      weight: 600,
      italic: false,
      nodeCount: 21,
      charCount: 718
    },
    {
      family: 'Pretendard Variable',
      style: 'ExtraBold',
      weight: 800,
      italic: false,
      nodeCount: 30,
      charCount: 695
    },
    {
      family: 'Pretendard Variable',
      style: 'Bold',
      weight: 700,
      italic: false,
      nodeCount: 16,
      charCount: 261
    },
    { family: 'Nexa', style: 'Heavy', weight: 800, italic: false, nodeCount: 3, charCount: 42 }
  ],
  storedFonts: [
    {
      family: 'Pretendard Variable',
      style: 'Regular',
      weight: 400,
      italic: false,
      byteLength: 611200,
      numGlyphs: 3607,
      codePoints: 2966,
      fileName: 'Pretendard-Regular.ttf'
    },
    {
      family: 'Pretendard Variable',
      style: 'Bold',
      weight: 700,
      italic: false,
      byteLength: 614704,
      numGlyphs: 3607,
      codePoints: 2966,
      fileName: 'Pretendard-Bold.ttf'
    }
  ]
}

function page(uiScript, query) {
  // ?bare=1&tab=images&w=380&h=620 — 스크린샷 자동화용: 컨트롤 바 없이 UI 만 꽉 채운다
  const bare = query.get('bare') === '1'
  const tab = query.get('tab') ?? ''
  const lang = query.get('lang') ?? ''
  const dark = query.get('theme') === 'dark'
  const platform = query.get('platform') ?? ''
  const frames = query.get('frames')
  const allFontsReady = query.get('fonts') === 'ready'
  const width = Number(query.get('w') ?? 380)
  const height = Number(query.get('h') ?? 560)
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Featherweight UI preview</title>
<style>
  body { margin: 0; font: 12px -apple-system, sans-serif; background: #e5e5e5; }
  .bar { padding: 8px 12px; background: #fff; border-bottom: 1px solid #ddd; display: flex; gap: 12px; align-items: center; }
  .frame { display: block; margin: 16px auto; border: 1px solid #bbb; background: #fff; box-shadow: 0 2px 12px rgba(0,0,0,.12); }
  ${bare ? '.bar { display: none; } .frame { margin: 0; border: none; box-shadow: none; }' : ''}
</style></head>
<body>
  <div class="bar">
    <strong>Featherweight UI preview</strong>
    <label>폭 <input id="w" type="number" value="380" style="width:64px"></label>
    <label>높이 <input id="h" type="number" value="560" style="width:64px"></label>
    <button id="apply">적용</button>
    <span id="note"></span>
  </div>
  <iframe class="frame" id="ui" width="${width}" height="${height}"></iframe>
<script>
const FIXTURE = ${JSON.stringify(FIXTURE)}
const UI_SCRIPT = ${JSON.stringify(uiScript)}
const VARS = ${JSON.stringify(dark ? FIGMA_VARS_DARK : FIGMA_VARS)}\nconst FRAME_COUNT = ${frames === null ? 'null' : Number(frames)}
const ALL_FONTS_READY = ${allFontsReady}

const iframe = document.getElementById('ui')
iframe.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><style>' + VARS +
  '</style></head><body class="figma-light"><div id="create-figma-plugin"></div>' +
  '<script>const __FIGMA_COMMAND__="";const __SHOW_UI_DATA__={};' +
  'window.__PREVIEW_TAB__="${tab}";' +
  ('${platform}' === 'win'
    ? 'Object.defineProperty(navigator,"userAgent",{get:()=>"Mozilla/5.0 (Windows NT 10.0; Win64; x64)"});' +
      'Object.defineProperty(navigator,"platform",{get:()=>"Win32"});' +
      'Object.defineProperty(navigator,"userAgentData",{get:()=>({platform:"Windows"})});'
    : '') +
  ('${lang}' ? 'Object.defineProperty(navigator,"language",{get:()=>"${lang}"});' : '') +
  UI_SCRIPT + '<\\/script></body></html>'

// UI 가 보낸 메시지에 메인 스레드처럼 답한다
window.addEventListener('message', (event) => {
  const message = event.data && event.data.pluginMessage
  if (!Array.isArray(message)) return
  const [name] = message
  document.getElementById('note').textContent = 'UI → main: ' + name

  if (name === 'ui:ready') {
    send('settings', FIXTURE.settings)
    // ?frames=N 으로 목록 크기를 바꾼다 (0 = 빈 상태)
    const selection = FRAME_COUNT === null
      ? FIXTURE.selection
      : Array.from({ length: FRAME_COUNT }, (_, i) => ({
          ...FIXTURE.selection[i % FIXTURE.selection.length],
          id: String(i + 1),
          name: (i + 1).toString().padStart(2, '0') + ' ' + FIXTURE.selection[i % FIXTURE.selection.length].name.slice(3)
        }))
    send('selection', selection)
    // ?fonts=ready — 카탈로그 밖 서체를 빼고 전부 준비된 상태로 (마케팅 캡처용)
    send('fonts', ALL_FONTS_READY ? FIXTURE.fonts.filter((f) => f.family !== 'Nexa') : FIXTURE.fonts)
    send('fonts:stored', FIXTURE.storedFonts)
  }

  if (name === 'toast') {
    document.getElementById('note').textContent = 'TOAST: ' + message[1]
  }
})

function send(name, ...args) {
  iframe.contentWindow.postMessage({ pluginMessage: [name, ...args] }, '*')
}

document.getElementById('apply').onclick = () => {
  iframe.width = document.getElementById('w').value
  iframe.height = document.getElementById('h').value
}
<\/script>
</body></html>`
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://localhost:${PORT}`)
    const uiScript = await readFile(join(ROOT, 'build/ui.js'), 'utf8')
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(page(uiScript, url.searchParams))
  } catch {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('build/ui.js 가 없다. `npm run build` 를 먼저 돌려라.')
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`UI 미리보기: http://localhost:${PORT}`)
})
