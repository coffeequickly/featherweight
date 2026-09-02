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

// 라이트 값은 Figma 플러그인 문서(css-variables)의 Figma Design Light 표 그대로다
const FIGMA_VARS = `
:root {
  color-scheme: light;
  --figma-color-bg: #ffffff;
  --figma-color-bg-secondary: #f5f5f5;
  --figma-color-bg-hover: #f5f5f5;
  --figma-color-bg-brand: #0d99ff;
  --figma-color-bg-disabled: #f0f0f0;
  --figma-color-border: #e6e6e6;
  --figma-color-border-strong: #2c2c2c;
  --figma-color-text: #000000e5;
  --figma-color-text-secondary: #00000080;
  --figma-color-text-disabled: #0000004d;
  --figma-color-text-onbrand: #ffffff;
  --figma-color-text-brand: #007be5;
  --figma-color-text-warning: #b86200;
  --figma-color-text-success: #009951;
  --figma-color-icon: #000000e5;
  --figma-color-icon-secondary: #00000080;
  --figma-color-icon-brand: #007be5;
  --figma-color-icon-success: #14ae5c;
  --figma-color-icon-warning: #ffcd29;
  --figma-color-bg-warning-tertiary: #fff1c2;
  --figma-color-bg-success-tertiary: #cff7d3;
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
  /* 아래는 문서에 다크 값이 없어 근사값이다 — 실제 색은 Figma 안에서 본다 */
  --figma-color-text-brand: #7cc4f8;
  --figma-color-icon-brand: #7cc4f8;
  --figma-color-border-brand: #7cc4f8;
  --figma-color-bg-brand-tertiary: #1e3a55;
  --figma-color-icon-success: #79d297;
  --figma-color-icon-warning: #ffcd29;
}
body { margin: 0; background: var(--figma-color-bg); }
`

/** 메인 스레드가 보내는 메시지를 흉내 낸다. UI 가 듣는 이름만 보낸다. */
const FIXTURE = {
  settings: {
    version: 1,
    quality: 0.8,
    multiplier: 1.5,
    maxEdge: 1920,
    minEdge: 640,
    reencodeOpaquePng: true,
    embedText: true,
    fitToSize: false,
    fitTargetMb: 5
  },
  selection: [
    {
      id: '1',
      name: '01 Cover',
      width: 595,
      height: 842,
      x: 0,
      y: 0,
      imageCount: 2,
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
      charCount: 18901,
      nodeIds: []
    },
    {
      family: 'Pretendard Variable',
      style: 'SemiBold',
      weight: 600,
      italic: false,
      nodeCount: 21,
      charCount: 718,
      nodeIds: []
    },
    {
      family: 'Pretendard Variable',
      style: 'ExtraBold',
      weight: 800,
      italic: false,
      nodeCount: 30,
      charCount: 695,
      nodeIds: []
    },
    {
      family: 'Pretendard Variable',
      style: 'Bold',
      weight: 700,
      italic: false,
      nodeCount: 16,
      charCount: 261,
      nodeIds: []
    },
    {
      family: 'Nexa',
      style: 'Heavy',
      weight: 800,
      italic: false,
      nodeCount: 3,
      charCount: 42,
      nodeIds: ['t1', 't4', 't5']
    }
  ],
  // 선택 시점에 메인이 미리 본 것 — 체크리스트 재료. 프레임별 이미지 사용은 아래 imagesFor 가 준다.
  preflight: {
    imageEdges: {
      cover: 3000,
      logo: 400,
      shot0: 2400,
      shot1: 2400,
      shot2: 2400,
      shot3: 2400,
      icon0: 320,
      icon1: 320,
      icon2: 320,
      icon3: 320
    },
    textRejects: [
      { nodeId: 't1', name: 'Headline', reason: { code: 'reject.stroked' } },
      { nodeId: 't2', name: 'Subtitle', reason: { code: 'reject.stroked' } },
      { nodeId: 't3', name: 'Badge', reason: { code: 'reject.nonSolidFill' } }
    ]
  },
  // ?report=1 — 내보낸 직후의 결과 카드
  report: {
    fileName: 'portfolio_20260902143012.pdf',
    byteLength: 4404019,
    pageCount: 3,
    elapsedMs: 8300,
    cancelled: false,
    skipped: [],
    imagesProcessed: 5,
    imageHashes: [],
    textDrawn: 127,
    fallbacks: [
      { nodeId: 't1', reason: { code: 'reject.stroked' } },
      { nodeId: 't2', reason: { code: 'reject.stroked' } },
      { nodeId: 't4', reason: { code: 'font.noFile', params: { family: 'Nexa', style: 'Heavy' } } },
      { nodeId: 't5', reason: { code: 'font.noFile', params: { family: 'Nexa', style: 'Heavy' } } },
      { nodeId: 't3', reason: { code: 'reject.nonSolidFill' } }
    ],
    fit: null,
    outlines: { fonts: 2, vectorBytes: 183000 },
    images: { count: 10, bytes: 3040000 },
    extractable: [
      '장원석',
      '프로덕트 디자이너',
      '2019 – 현재 · 스타트업 A',
      '사용자 리서치와 디자인 시스템을 맡았습니다.'
    ]
  },
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
  // ?bare=1&screen=settings&w=400&h=560 — 스크린샷 자동화용: 컨트롤 바 없이 UI 만 꽉 채운다
  const bare = query.get('bare') === '1'
  const screen = query.get('screen') ?? ''
  const lang = query.get('lang') ?? ''
  const dark = query.get('theme') === 'dark'
  const platform = query.get('platform') ?? ''
  const frames = query.get('frames')
  const allFontsReady = query.get('fonts') === 'ready'
  const fitToSize = query.get('fit') === '1'
  // ?text=clean — 아웃라인 처리될 텍스트가 없는 상태
  const textClean = query.get('text') === 'clean'
  // ?report=1 — 내보낸 직후 결과 카드가 떠 있는 상태
  const withReport = query.get('report') === '1'
  // ?wide=1 — 1920×1080 장표. 상한이 배율을 누르는 경우(크기 그림)를 본다
  const wide = query.get('wide') === '1'
  // ?editor=slides — Slides 문구(슬라이드 N장)로 본다. wide 도 같이 켠다
  const editor = query.get('editor') === 'slides' ? 'slides' : 'figma'
  const edge = Number(query.get('edge') ?? 0) || null
  const width = Number(query.get('w') ?? 400)
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
    <label>폭 <input id="w" type="number" value="400" style="width:64px"></label>
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
const FIT_TO_SIZE = ${fitToSize}
const TEXT_CLEAN = ${textClean}
const WIDE = ${wide} || ${editor === 'slides' ? 'true' : 'false'}
const EDITOR = ${JSON.stringify(editor)}
const EDGE = ${edge === null ? 'null' : edge}

const iframe = document.getElementById('ui')
iframe.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><style>' + VARS +
  '</style></head><body class="figma-light"><div id="create-figma-plugin"></div>' +
  '<script>const __FIGMA_COMMAND__="";const __SHOW_UI_DATA__={};' +
  'window.__PREVIEW_SCREEN__="${screen}";' +
  ('${withReport}' === 'true'
    ? 'window.__PREVIEW_REPORT__=' + JSON.stringify(FIXTURE.report) + ';'
    : '') +
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
    // ?fit=1 — 목표 용량 모드로 열어 본다
    send('settings', { ...FIXTURE.settings, fitToSize: FIT_TO_SIZE, ...(EDGE ? { maxEdge: EDGE } : {}) })
    // ?frames=N 으로 목록 크기를 바꾼다 (0 = 빈 상태)
    const baseSelection = FRAME_COUNT === null
      ? FIXTURE.selection
      : Array.from({ length: FRAME_COUNT }, (_, i) => ({
          ...FIXTURE.selection[i % FIXTURE.selection.length],
          id: String(i + 1),
          name: (i + 1).toString().padStart(2, '0') + ' ' + FIXTURE.selection[i % FIXTURE.selection.length].name.slice(3)
        }))
    const selection = WIDE
      ? baseSelection.map((frame) => ({ ...frame, width: 1920, height: 1080 }))
      : baseSelection
    send('editor', EDITOR)
    send('selection', selection)
    send(
      'frames:meta',
      selection.map((f) => ({ id: f.id, imageCount: f.imageCount, textCount: f.textCount }))
    )
    // ?fonts=ready — 카탈로그 밖 서체를 빼고 전부 준비된 상태로 (마케팅 캡처용)
    send('fonts', ALL_FONTS_READY ? FIXTURE.fonts.filter((f) => f.family !== 'Nexa') : FIXTURE.fonts)
    send('fonts:stored', FIXTURE.storedFonts)
    // 체크리스트 재료는 목록 뒤에 따로 온다 — 실제 메인과 같은 순서
    send('preflight', {
      frames: selection.map((frame, i) => ({
        id: frame.id,
        longEdge: Math.max(frame.width, frame.height),
        images: imagesFor(i)
      })),
      imageEdges: FIXTURE.preflight.imageEdges,
      textRejects: TEXT_CLEAN ? [] : FIXTURE.preflight.textRejects
    })
  }

  if (name === 'toast') {
    document.getElementById('note').textContent = 'TOAST: ' + message[1]
  }
})

function send(name, ...args) {
  iframe.contentWindow.postMessage({ pluginMessage: [name, ...args] }, '*')
}

/** 픽스처 프레임 i 가 쓰는 이미지들 — 표지는 큰 사진+로고, 프로젝트 장은 스크린샷 넷+아이콘 넷 */
function imagesFor(i) {
  const use = (hash, width, height) => ({ nodeId: 'n-' + hash, imageHash: hash, width, height, scaleMode: 'FILL' })
  switch (i % 3) {
    case 0: return [use('cover', 595, 397), use('logo', 120, 40)]
    case 1: return [use('logo', 120, 40)]
    default: return [0, 1, 2, 3].flatMap((k) => [use('shot' + k, 260, 170), use('icon' + k, 48, 48)])
  }
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
