// 텍스트 파이프라인 끝까지 — 실제 Figma SVG 픽스처 + CDN 에서 받은 실제 폰트로
// PDF 를 만들어 본다. 네트워크를 쓰므로 기본으로는 돌지 않는다.
//
//   npm run verify:catalog   (fontCatalog.net 과 같이 돈다)
//
// Figma 안에서만 되는 것(좌표 정합 육안 확인, clientStorage, 실제 export)은 여기서
// 못 본다 — 이 테스트가 보는 것은 "검증→임베드→드로잉→저장" 사슬이 실물 재료로
// 끊기지 않는가다. PIPELINE_PDF_OUT 에 경로를 주면 결과 PDF 를 그 자리에 남긴다
// (pdffonts / pdftotext 로 열어 보는 용도).

import { writeFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { PDFDocument } from 'pdf-lib'
import { beforeAll, describe, expect, it } from 'vitest'

import { catalogEntry } from '../src/lib/fontCatalog'
import { FontRef, TextRunSource, TextSegment } from '../src/lib/types'
import { drawTextLayer, FontCache } from '../src/ui/textLayer'
import {
  BOLD_HEADING,
  EXTRABOLD_HEADING,
  MULTI_LINE_WITH_BREAKS,
  SINGLE_LINE
} from './fixtures/figmaSvgText'

const enabled = process.env.CATALOG_NET === '1'

const parseXml = (svg: string): Document =>
  new JSDOM(svg, { contentType: 'image/svg+xml' }).window.document

/** 카탈로그 주소에서 실제 바이트를 받아 온다 — 플러그인의 fetchFromCatalog 와 같은 경로 */
async function lookupFromCatalog(ref: FontRef): Promise<Uint8Array | undefined> {
  const entry = catalogEntry(ref)
  if (entry === undefined) return undefined
  const response = await fetch(entry.url)
  if (!response.ok) return undefined
  return new Uint8Array(await response.arrayBuffer())
}

function segment(style: string, start: number, end: number): TextSegment {
  return {
    start,
    end,
    fontName: { family: 'Pretendard Variable', style },
    fontSize: 9,
    fills: [{ r: 0, g: 0, b: 0, a: 1 }],
    letterSpacing: { unit: 'PERCENT', value: -1.5 },
    textDecoration: 'NONE',
    textCase: 'ORIGINAL',
    features: {},
    hyperlink: null
  }
}

/** 픽스처 4개 = 실물 덤프 구조의 Regular · Bold · ExtraBold 세 굵기 */
function sources(): TextRunSource[] {
  return [
    {
      nodeId: 's1',
      characters: '1  /  5',
      svg: SINGLE_LINE,
      offset: { x: 40, y: 40 },
      segments: [segment('Regular', 0, 7)]
    },
    {
      nodeId: 's2',
      characters: '굵은 제목 확인',
      svg: BOLD_HEADING,
      offset: { x: 40, y: 80 },
      segments: [segment('Bold', 0, 7)]
    },
    {
      nodeId: 's3',
      characters: '[ 아주 굵게 AB ]',
      svg: EXTRABOLD_HEADING,
      offset: { x: 40, y: 120 },
      segments: [segment('ExtraBold', 0, 10)]
    },
    {
      nodeId: 's4',
      characters: '업무 효율화  2030세대 비중\n인력 충원\n\n2인 개발자 TF',
      svg: MULTI_LINE_WITH_BREAKS,
      offset: { x: 40, y: 200 },
      segments: [segment('Regular', 0, 30)]
    }
  ]
}

describe.runIf(enabled)('텍스트 파이프라인 실검증', () => {
  let bytes: Uint8Array
  let drawn: number
  let fallbacks: Array<{ nodeId: string; reason: unknown }>

  beforeAll(async () => {
    const document = await PDFDocument.create()
    const page = document.addPage([595, 842])
    const cache = new FontCache(document, [], lookupFromCatalog)

    const result = await drawTextLayer(page, sources(), cache, parseXml)
    drawn = result.drawn
    fallbacks = result.fallbacks

    bytes = await document.save({ useObjectStreams: true })

    const out = process.env.PIPELINE_PDF_OUT
    if (out !== undefined && out !== '') writeFileSync(out, bytes)
  }, 120_000)

  it('픽스처 4개 전부 그려진다 — fallback 0', () => {
    expect(fallbacks).toEqual([])
    expect(drawn).toBe(4)
  })

  it('서브셋 임베드라 결과가 가볍다 (원본 폰트 3벌 ≈ 7.7MB)', () => {
    expect(bytes.length).toBeLessThan(300_000)
  })

  it('만들어진 PDF 가 다시 열린다', async () => {
    const reopened = await PDFDocument.load(bytes)
    expect(reopened.getPageCount()).toBe(1)
  })
})

describe.runIf(!enabled)('텍스트 파이프라인 실검증 (건너뜀)', () => {
  it('CATALOG_NET=1 로 실행해야 실제 검증이 돈다', () => {
    expect(sources()).toHaveLength(4)
  })
})
