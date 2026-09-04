// 머지된 페이지 위에 진짜 폰트로 텍스트를 다시 그린다. (PRD FR-7, §7.5)

import {
  beginText,
  endText,
  PDFArray,
  PDFDocument,
  PDFFont,
  PDFName,
  PDFNumber,
  PDFOperator,
  PDFOperatorNames,
  PDFPage,
  PDFString,
  popGraphicsState,
  pushGraphicsState,
  setCharacterSpacing,
  setFillingRgbColor,
  setFontAndSize,
  setGraphicsState,
  setTextMatrix
} from 'pdf-lib'

import { catalogEntry } from '../lib/fontCatalog'
import { matchFont } from '../lib/fontMatch'
import { styleForRun } from '../lib/runStyle'
import { codePointsOf, parseSvgText, ParseXml, SvgRun } from '../lib/svgText'
import { fallbackFontsFor, splitByCoverage } from '../lib/glyphFallback'
import { isIgnorable } from '../lib/ignorable'
import { kernAdjustments } from '../lib/kerning'
import { needsShaping } from '../lib/shaping'
import { LinkSpan, linkSpansForRun } from '../lib/textLinks'
import { FontRef, Reason, StoredFont, TextRunSource } from '../lib/types'
import { createProbe, FontProbe, pdfLibFontkit } from './fontkitAdapter'

export type FontBytesLookup = (ref: FontRef) => Promise<Uint8Array | undefined>

export type DrawFallback = { nodeId: string; reason: Reason }

/** 노드 하나에서 대체 폰트로 그린 글자들 — 결과 카드가 "폰트에 없는 글자 N개는 Inter 로" 라고 말한다 */
export type DrawSubstitution = { nodeId: string; family: string; chars: string[] }

export type DrawResult = {
  drawn: number
  fallbacks: DrawFallback[]
  substitutions: DrawSubstitution[]
}

const parseXml = (svg: string): Document => new DOMParser().parseFromString(svg, 'image/svg+xml')

/**
 * 폰트는 문서당 파일별로 한 번만 임베드한다.
 * 같은 폰트를 페이지마다 임베드하면 그만큼 파일이 커진다.
 */
export class FontCache {
  private readonly embedded = new Map<string, PDFFont>()
  private readonly parsed = new Map<string, FontProbe>()

  constructor(
    private readonly document: PDFDocument,
    private readonly available: readonly StoredFont[],
    private readonly lookup: FontBytesLookup
  ) {
    document.registerFontkit(pdfLibFontkit())
  }

  /**
   * features 는 켜 둘 OpenType 기능 태그 — 기능이 다르면 글리프가 달라 따로 임베드한다.
   * (서브셋이라 쓰인 글리프만 실리니 두 벌이 돼도 작다)
   */
  async get(
    family: string,
    style: string,
    features: Readonly<Record<string, boolean>> = {}
  ): Promise<
    | {
        ok: true
        font: PDFFont
        /** 같은 바이트를 fontkit 으로 읽은 것 — 커버리지·커닝 계산용 */
        probe: FontProbe
        covers: (codePoints: number[]) => number[]
      }
    | { ok: false; reason: Reason }
  > {
    // 카탈로그에 있으면 받아 오면 되므로 보관 목록에 없어도 된다
    const inCatalog = catalogEntry({ family, style }) !== undefined
    const match = matchFont({ family, style }, this.available)
    if (!inCatalog && !match.ok) return { ok: false, reason: match.reason }

    const ref = match.ok ? match.font : { family, style }
    const key = `${ref.family}\u0000${ref.style}\u0000${featureKey(features)}`
    const cached = this.embedded.get(key)
    if (cached !== undefined) {
      const probe = this.parsed.get(key)
      if (probe === undefined)
        return { ok: false, reason: { code: 'font.readFailed', params: { family, style } } }
      return { ok: true, font: cached, probe, covers: (points) => missingFrom(probe, points) }
    }

    const bytes = await this.lookup(ref)
    if (bytes === undefined)
      return { ok: false, reason: { code: 'font.readFailed', params: { family, style } } }

    try {
      const probe = createProbe(bytes)
      const font = await this.document.embedFont(bytes, { subset: true, features: { ...features } })
      this.embedded.set(key, font)
      this.parsed.set(key, probe)
      return { ok: true, font, probe, covers: (points) => missingFrom(probe, points) }
    } catch (error) {
      return {
        ok: false,
        reason: {
          code: 'font.embedFailed',
          params: { family, style, error: error instanceof Error ? error.message : String(error) }
        }
      }
    }
  }
}

function missingFrom(probe: FontProbe | undefined, codePoints: number[]): number[] {
  if (probe === undefined) return []
  return codePoints.filter((point) => !isIgnorable(point) && !probe.hasGlyphForCodePoint(point))
}

export type FontProvider = Pick<FontCache, 'get'>

/**
 * 한 페이지 몫의 텍스트를 그린다.
 * SVG 의 y 는 위에서 잰 baseline, PDF 의 y 는 아래에서 잰 값이라 뒤집는다.
 *
 * 폰트는 run 마다 따로 정한다 — 한 노드 안에 Bold 와 Regular 가 섞여 있으면 각각 제
 * 폰트로 그려야 한다. 규칙은 검증(validateSources)과 같은 styleForRun 이라 어긋나지 않는다.
 * run 하나라도 폰트를 못 구하면 노드 전체를 포기한다 — 반쯤 그린 노드를 남기지 않는다.
 */
export type DrawOptions = {
  /** 텍스트에 건 URL 링크를 링크 주석으로 넣는다 (Settings.keepLinks) */
  links: boolean
  /** 폰트에 없는 글자를 대체 폰트로 그린다 (Settings.glyphFallback). 끄면 그 노드는 포기한다 */
  glyphFallback: boolean
}

export async function drawTextLayer(
  page: PDFPage,
  sources: readonly TextRunSource[],
  cache: FontProvider,
  parse: ParseXml = parseXml,
  options: DrawOptions = { links: true, glyphFallback: true }
): Promise<DrawResult> {
  const result: DrawResult = { drawn: 0, fallbacks: [], substitutions: [] }
  const pageHeight = page.getHeight()

  for (const source of sources) {
    const runs = parseSvgText(source.svg, parse)
    if (runs.length === 0) {
      result.fallbacks.push({ nodeId: source.nodeId, reason: { code: 'reject.svgEmpty' } })
      continue
    }

    // 전부 그릴 수 있는지 먼저 확인하고, 확인이 끝난 뒤에만 그린다
    const planned: Array<{ run: SvgRun; font: PDFFont; chunks: DrawChunk[] }> = []
    const substituted = new Map<string, Set<string>>()
    let reason: Reason | null = null

    for (const run of runs) {
      const style = styleForRun(source, run.fontWeight, run.italic, run.fontFamily)
      const resolved = await cache.get(style.family, style.style, style.features)
      if (!resolved.ok) {
        reason = resolved.reason
        break
      }

      const missing = resolved.covers(codePointsOf([run]))
      if (missing.length === 0) {
        planned.push({
          run,
          font: resolved.font,
          chunks: [
            {
              text: run.text,
              start: 0,
              font: resolved.font,
              probe: resolved.probe,
              features: style.features
            }
          ]
        })
        continue
      }

      // 주 폰트에 없는 글자는 대체 폰트로 — 그 글자만. 옵션을 껐거나 어느 대체 폰트에도 없으면 포기한다
      const fallback = options.glyphFallback
        ? await firstCovering(cache, style.style, missing)
        : null
      if (fallback === null) {
        reason = {
          code: 'font.missingGlyphs',
          params: {
            count: missing.length,
            sample: missing
              .slice(0, 6)
              .map((point) => String.fromCodePoint(point))
              .join('')
          }
        }
        break
      }
      const chars = substituted.get(fallback.family) ?? new Set<string>()
      for (const point of missing) chars.add(String.fromCodePoint(point))
      substituted.set(fallback.family, chars)

      const missingSet = new Set(missing)
      let at = 0
      const chunks = splitByCoverage(run.text, missingSet).map((chunk) => {
        const start = at
        at += chunk.text.length
        return {
          text: chunk.text,
          start,
          font: chunk.fallback ? fallback.font : resolved.font,
          probe: chunk.fallback ? fallback.probe : resolved.probe,
          // 대체 폰트에는 그 스타일 세트가 없다 — 기본 글리프로
          features: chunk.fallback ? {} : style.features
        }
      })
      planned.push({ run, font: resolved.font, chunks })
    }

    if (reason !== null) {
      result.fallbacks.push({ nodeId: source.nodeId, reason })
      continue
    }
    for (const [family, chars] of substituted) {
      result.substitutions.push({ nodeId: source.nodeId, family, chars: [...chars] })
    }

    let cursor = 0
    for (const { run, font, chunks } of planned) {
      drawRun(page, run, source.offset, pageHeight, chunks)
      if (!options.links) continue
      const { spans, next } = linkSpansForRun(source.characters, cursor, run.text, source.segments)
      cursor = next
      for (const span of spans) addLink(page, run, source.offset, pageHeight, font, span)
    }
    result.drawn += 1
  }

  return result
}

/**
 * run 의 일부 글자에 걸린 URL 을 링크 주석으로. 글자 폭은 폰트에서 재고 자간은 글자 수만큼 더한다.
 * 세로 범위는 baseline 기준 위 0.9em·아래 0.25em — 어센더·디센더를 대략 덮는다.
 */
function addLink(
  page: PDFPage,
  run: SvgRun,
  offset: { x: number; y: number },
  pageHeight: number,
  font: PDFFont,
  span: LinkSpan
): void {
  const size = run.fontSize
  const width = (text: string): number =>
    font.widthOfTextAtSize(text, size) + run.letterSpacing * text.length
  const x0 = offset.x + run.x + width(run.text.slice(0, span.start))
  const x1 = x0 + width(run.text.slice(span.start, span.end))
  const baseline = pageHeight - (offset.y + run.y)
  const context = page.doc.context
  const annot = context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [x0, baseline - size * 0.25, x1, baseline + size * 0.9],
    Border: [0, 0, 0],
    A: { Type: 'Action', S: 'URI', URI: PDFString.of(span.url) }
  })
  page.node.addAnnot(context.register(annot))
}

/** 대체 후보 순서대로 — 빠진 글자를 전부 덮는 첫 폰트 */
async function firstCovering(
  cache: FontProvider,
  style: string,
  missing: readonly number[]
): Promise<{ family: string; font: PDFFont; probe: FontProbe } | null> {
  for (const ref of fallbackFontsFor(style)) {
    const resolved = await cache.get(ref.family, ref.style)
    if (resolved.ok && resolved.covers([...missing]).length === 0) {
      return { family: ref.family, font: resolved.font, probe: resolved.probe }
    }
  }
  return null
}

/** run 을 폰트별 덩어리로 — 대부분은 하나, 대체 글자가 섞이면 여럿 */
type DrawChunk = {
  text: string
  /** run.text 안에서의 시작 인덱스 — gaps(무시 문자 자릿수)를 찾는 데 쓴다 */
  start: number
  font: PDFFont
  probe: FontProbe
  features: Readonly<Record<string, boolean>>
}

/** 기능 켬/끔을 캐시 키로 — 같은 폰트라도 기능이 다르면 다른 벌이다 */
function featureKey(features: Readonly<Record<string, boolean>>): string {
  return Object.entries(features)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tag, on]) => `${tag}${on ? '+' : '-'}`)
    .join(',')
}

/**
 * 페이지 리소스에 폰트를 한 번만 등록한다 — run 마다 등록하면 /Font 사전이 run 수만큼 자란다.
 * 키는 이름이 아니라 **폰트 객체**다. OpenType 기능이 다른 두 벌은 이름이 같아서(둘 다 SUIT-Regular)
 * 이름으로 묶었더니 두 번째 벌이 첫 벌의 글리프 표로 그려져 글자가 통째로 깨졌다(실측).
 */
const fontKeys = new WeakMap<PDFPage, Map<PDFFont, PDFName>>()
function fontKeyFor(page: PDFPage, font: PDFFont): PDFName {
  let keys = fontKeys.get(page)
  if (keys === undefined) {
    keys = new Map()
    fontKeys.set(page, keys)
  }
  let key = keys.get(font)
  if (key === undefined) {
    key = page.node.newFontDictionary(font.name, font.ref)
    keys.set(font, key)
  }
  return key
}

/**
 * pdf-lib 의 drawText 대신 직접 연산자를 쓴다 — 커닝 때문이다.
 *
 * drawText 는 글리프를 폭대로 나란히 놓아 Figma 가 건 짝 커닝이 사라지고 라틴 줄이 몇 % 넓어진다
 * (lib/kerning 참고). fontkit layout 이 준 전진폭과의 차를 TJ 배열로 넣는다. 자간(Tc)·색·불투명도는
 * drawText 가 하던 것과 같게 그래픽 상태로 건다.
 */
function drawRun(
  page: PDFPage,
  run: SvgRun,
  offset: { x: number; y: number },
  pageHeight: number,
  chunks: readonly DrawChunk[]
): void {
  let x = offset.x + run.x
  const y = pageHeight - (offset.y + run.y)
  const size = run.fontSize

  const ops: PDFOperator[] = [pushGraphicsState()]
  if (run.opacity < 1) {
    const state = page.node.newExtGState(
      'GS',
      page.doc.context.obj({ Type: 'ExtGState', ca: run.opacity, CA: run.opacity })
    )
    ops.push(setGraphicsState(state))
  }
  // characterSpacing 은 drawText 옵션이 아니다. PDF 연산자로 직접 건다.
  if (run.letterSpacing !== 0) ops.push(setCharacterSpacing(run.letterSpacing))
  ops.push(setFillingRgbColor(run.fill.r, run.fill.g, run.fill.b))

  const gaps = run.gaps ?? []
  for (const chunk of chunks) {
    // 덩어리 안 글자 앞에 있던 무시 문자(묶음문자) 수 — Figma 는 그것에도 자간을 붙인다
    let hidden = 0
    for (let i = chunk.start; i < chunk.start + chunk.text.length; i += 1) hidden += gaps[i] ?? 0
    const last = chunk.start + chunk.text.length === run.text.length
    if (last) hidden += gaps[run.text.length] ?? 0
    ops.push(
      beginText(),
      setFontAndSize(fontKeyFor(page, chunk.font), size),
      setTextMatrix(1, 0, 0, 1, x, y),
      showKerned(page, chunk, gaps, run.letterSpacing, size),
      endText()
    )
    // 다음 덩어리는 이 덩어리의 폭만큼 오른쪽에서 — widthOfTextAtSize 는 커닝을 반영한 값이라
    // 그린 것과 같다. 자간은 글자마다 Tc 로 붙으니 글자 수(숨은 글자 포함)만큼 더한다
    x +=
      chunk.font.widthOfTextAtSize(chunk.text, size) +
      run.letterSpacing * (chunk.text.length + hidden)
  }

  ops.push(popGraphicsState())
  page.pushOperators(...ops)
}

/**
 * 글자마다 글리프 코드, 그 사이에 커닝 보정. 합자처럼 글자 수와 글리프 수가 다르면 커닝 없이 통째로.
 * 글자 앞에 묶음문자가 있었으면 그 수만큼 자간을 빈 전진으로 넣는다 — Tc 는 보이는 글리프에만 붙는다.
 */
function showKerned(
  page: PDFPage,
  chunk: DrawChunk,
  gaps: readonly number[],
  letterSpacing: number,
  size: number
): PDFOperator {
  const chars = [...chunk.text]
  // TJ 숫자는 1/1000 텍스트 공간, 양수가 왼쪽 — 자간 하나만큼 오른쪽으로 가려면 음수
  const gapShift = (count: number): number => Math.round((-letterSpacing * count * 1000) / size)
  const hiddenBefore = (index: number): number => gaps[chunk.start + index] ?? 0

  // 임베드한 폰트와 같은 기능으로 배치해야 글리프 수·커닝이 맞는다.
  // 문맥으로 모양이 바뀌는 문자(아랍·태국 등)는 낱글자로 자르면 깨진다 — 통째로
  const layout = chunk.probe.layout(chunk.text, { ...chunk.features })
  const kerned = !needsShaping(chunk.text) && layout.glyphs.length === chars.length
  const adjustments = kerned
    ? kernAdjustments(
        layout.glyphs.map((glyph) => glyph.advanceWidth),
        layout.positions.map((position) => position.xAdvance),
        chunk.probe.unitsPerEm
      )
    : []

  const array = PDFArray.withContext(page.doc.context)
  if (!kerned) {
    // 통째로 — 앞쪽 무시 문자 자간만 넣고 글리프 사이는 손대지 않는다
    let hidden = 0
    for (let i = 0; i < chars.length; i += 1) hidden += hiddenBefore(i)
    if (letterSpacing !== 0 && hidden > 0) array.push(PDFNumber.of(gapShift(hidden)))
    array.push(chunk.font.encodeText(chunk.text))
    return PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [array])
  }

  chars.forEach((char, index) => {
    const hidden = hiddenBefore(index)
    if (letterSpacing !== 0 && hidden > 0) array.push(PDFNumber.of(gapShift(hidden)))
    array.push(chunk.font.encodeText(char))
    const adjustment = adjustments[index]
    if (adjustment !== undefined && adjustment !== 0) array.push(PDFNumber.of(adjustment))
  })
  return PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [array])
}
