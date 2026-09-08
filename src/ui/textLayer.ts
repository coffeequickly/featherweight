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
import { embeddingForbidden } from '../lib/fontFile'
import { matchFont } from '../lib/fontMatch'
import { styleForRun } from '../lib/runStyle'
import { codePointsOf, parseSvgText, ParseXml, SvgRun } from '../lib/svgText'
import { fallbackFontsFor, splitByCoverage } from '../lib/glyphFallback'
import { isIgnorable } from '../lib/ignorable'
import { kernAdjustments } from '../lib/kerning'
import { needsShaping } from '../lib/shaping'
import { LinkSpan, linkSpansForRun } from '../lib/textLinks'
import { FontRef, Reason, StoredFont, TextRunSource } from '../lib/types'
import { createProbe, factsOf, FontProbe, pdfLibFontkit } from './fontkitAdapter'

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
      // 파일 자신이 임베드를 금지하면 넣지 않는다 — 옛 버전이 저장한 파일도 여기서 걸린다.
      // "No subsetting" 이면 서브셋 대신 전체를 넣는다
      const facts = factsOf(probe)
      const forbidden = embeddingForbidden(facts)
      if (forbidden !== null) return { ok: false, reason: forbidden }
      const font = await this.document.embedFont(bytes, {
        subset: facts.noSubsetting !== true,
        features: { ...features }
      })
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
    const planned: Array<{ run: SvgRun; chunks: DrawChunk[] }> = []
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
      let at = 0 // 코드포인트 단위 — gaps 와 같은 눈금이라야 보조평면 글자 뒤의 자간이 안 밀린다
      const chunks = splitByCoverage(run.text, missingSet).map((chunk) => {
        const start = at
        at += [...chunk.text].length
        return {
          text: chunk.text,
          start,
          font: chunk.fallback ? fallback.font : resolved.font,
          probe: chunk.fallback ? fallback.probe : resolved.probe,
          // 대체 폰트에는 그 스타일 세트가 없다 — 기본 글리프로
          features: chunk.fallback ? {} : style.features
        }
      })
      planned.push({ run, chunks })
    }

    if (reason !== null) {
      result.fallbacks.push({ nodeId: source.nodeId, reason })
      continue
    }
    for (const [family, chars] of substituted) {
      result.substitutions.push({ nodeId: source.nodeId, family, chars: [...chars] })
    }

    let cursor = 0
    for (const { run, chunks } of planned) {
      const positions = drawRun(page, run, source.offset, pageHeight, chunks)
      if (!options.links) continue
      const { spans, next } = linkSpansForRun(source.characters, cursor, run.text, source.segments)
      cursor = next
      for (const span of spans) addLink(page, run, source.offset, pageHeight, positions, span)
    }
    result.drawn += 1
  }

  return result
}

/**
 * run 의 일부 글자에 걸린 URL 을 링크 주석으로. 가로 범위는 drawRun 이 돌려준 글자 위치에서
 * 잰다 — 폭을 다시 재면 대체 폰트·커닝·숨은 글자의 자간이 빠져 사각형이 어긋난다.
 * 세로 범위는 baseline 기준 위 0.9em·아래 0.25em — 어센더·디센더를 대략 덮는다.
 */
function addLink(
  page: PDFPage,
  run: SvgRun,
  offset: { x: number; y: number },
  pageHeight: number,
  positions: readonly number[],
  span: LinkSpan
): void {
  const size = run.fontSize
  const x0 = positions[span.start] ?? positions[0] ?? offset.x + run.x
  const x1 = positions[span.end] ?? positions[positions.length - 1] ?? x0
  if (x1 <= x0) return
  const baseline = pageHeight - snappedBaseline(offset, run)
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
  /** run.text 안에서의 시작 코드포인트 인덱스 — gaps(무시 문자 자릿수)와 같은 눈금 */
  start: number
  font: PDFFont
  probe: FontProbe
  features: Readonly<Record<string, boolean>>
}

/** 한 덩어리를 어떻게 놓을지 — 배치 결과와 커닝 보정. drawRun 이 x 를 셀 때도 같은 것을 쓴다 */
type ChunkPlan = {
  chars: string[]
  layout: ReturnType<FontProbe['layout']>
  /** 글자 수와 글리프 수가 같아 글자마다 커닝을 넣을 수 있는가 */
  kerned: boolean
  adjustments: number[]
  /** 폰트 단위 → 텍스트 공간(pt) */
  scale: number
}

function planChunk(chunk: DrawChunk, size: number): ChunkPlan {
  const chars = [...chunk.text]
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
  return { chars, layout, kerned, adjustments, scale: size / chunk.probe.unitsPerEm }
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
 *
 * 돌려주는 값은 run.text 의 UTF-16 인덱스마다 그 글자 앞의 x(마지막 칸은 끝) — 링크 사각형이
 * 이걸로 잰다. 다음 덩어리의 시작도 같은 셈에서 나온다: 커닝을 넣고 그린 덩어리 뒤를
 * widthOfTextAtSize(커닝 없는 폭)로 재면 대체 글리프 뒤 글자가 그만큼 오른쪽으로 밀린다.
 */
/**
 * 줄의 기준선 y(위에서 잰 값). Figma 는 캔버스·PDF 에서 글자를 또렷하게 그리려고 각 줄의 기준선을
 * 정수 픽셀에 스냅한다 — 실측: Figma PDF 의 기준선은 전부 정수(376.000, 257.000…)였고 SVG 의
 * tspan y 는 소수(108.5455)였다. 소수를 그대로 쓰면 Inter 40pt 는 0.45pt 위, Pretendard 는 0.22pt
 * 위로 어긋난다. x 는 스냅하지 않는다(글리프 위치는 소수 그대로다).
 */
function snappedBaseline(offset: { x: number; y: number }, run: SvgRun): number {
  return Math.round(offset.y + run.y)
}

function drawRun(
  page: PDFPage,
  run: SvgRun,
  offset: { x: number; y: number },
  pageHeight: number,
  chunks: readonly DrawChunk[]
): number[] {
  const startX = offset.x + run.x
  const y = pageHeight - snappedBaseline(offset, run)
  const size = run.fontSize
  const spacing = run.letterSpacing
  const gaps = run.gaps ?? []
  const totalPoints = [...run.text].length
  const positions = new Array<number>(run.text.length + 1).fill(startX)

  const ops: PDFOperator[] = [pushGraphicsState()]
  if (run.opacity < 1) {
    const state = page.node.newExtGState(
      'GS',
      page.doc.context.obj({ Type: 'ExtGState', ca: run.opacity, CA: run.opacity })
    )
    ops.push(setGraphicsState(state))
  }
  // characterSpacing 은 drawText 옵션이 아니다. PDF 연산자로 직접 건다.
  if (spacing !== 0) ops.push(setCharacterSpacing(spacing))
  ops.push(setFillingRgbColor(run.fill.r, run.fill.g, run.fill.b))

  let x = startX
  let unit = 0 // run.text 의 UTF-16 인덱스
  for (const chunk of chunks) {
    const plan = planChunk(chunk, size)
    ops.push(
      beginText(),
      setFontAndSize(fontKeyFor(page, chunk.font), size),
      setTextMatrix(1, 0, 0, 1, x, y),
      showKerned(page, chunk, plan, gaps, spacing, size),
      endText()
    )

    if (plan.kerned) {
      // 글자마다: 앞의 무시 문자 자간 → 글자 → 전진폭(마지막 글자는 보정이 없어 글리프 폭) + 자간
      const last = plan.chars.length - 1
      plan.chars.forEach((char, index) => {
        x += spacing * (gaps[chunk.start + index] ?? 0)
        for (let u = 0; u < char.length; u += 1) positions[unit + u] = x
        unit += char.length
        const advance =
          index < last
            ? plan.layout.positions[index].xAdvance
            : plan.layout.glyphs[index].advanceWidth
        x += advance * plan.scale + spacing
      })
    } else {
      // 통째로 그린 덩어리: 폭은 글리프 폭 합(커닝 없음). 글자 위치는 폭을 글자 수로 나눠 어림한다
      let hidden = 0
      for (let index = 0; index < plan.chars.length; index += 1)
        hidden += gaps[chunk.start + index] ?? 0
      x += spacing * hidden
      const width = chunk.font.widthOfTextAtSize(chunk.text, size) + spacing * plan.chars.length
      plan.chars.forEach((char, index) => {
        const at = x + (width * index) / plan.chars.length
        for (let u = 0; u < char.length; u += 1) positions[unit + u] = at
        unit += char.length
      })
      x += width
    }
    // 끝에 붙은 무시 문자에도 Figma 는 자간을 붙인다
    if (chunk.start + plan.chars.length === totalPoints) x += spacing * (gaps[totalPoints] ?? 0)
  }
  positions[run.text.length] = x

  ops.push(popGraphicsState())
  page.pushOperators(...ops)
  return positions
}

/**
 * 글자마다 글리프 코드, 그 사이에 커닝 보정. 합자처럼 글자 수와 글리프 수가 다르면 커닝 없이 통째로.
 * 글자 앞에 묶음문자가 있었으면 그 수만큼 자간을 빈 전진으로 넣는다 — Tc 는 보이는 글리프에만 붙는다.
 */
function showKerned(
  page: PDFPage,
  chunk: DrawChunk,
  plan: ChunkPlan,
  gaps: readonly number[],
  letterSpacing: number,
  size: number
): PDFOperator {
  // TJ 숫자는 1/1000 텍스트 공간, 양수가 왼쪽 — 자간 하나만큼 오른쪽으로 가려면 음수
  const gapShift = (count: number): number => Math.round((-letterSpacing * count * 1000) / size)
  const hiddenBefore = (index: number): number => gaps[chunk.start + index] ?? 0

  const array = PDFArray.withContext(page.doc.context)
  if (!plan.kerned) {
    // 통째로 — 앞쪽 무시 문자 자간만 넣고 글리프 사이는 손대지 않는다
    let hidden = 0
    for (let i = 0; i < plan.chars.length; i += 1) hidden += hiddenBefore(i)
    if (letterSpacing !== 0 && hidden > 0) array.push(PDFNumber.of(gapShift(hidden)))
    array.push(chunk.font.encodeText(chunk.text))
    return PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [array])
  }

  plan.chars.forEach((char, index) => {
    const hidden = hiddenBefore(index)
    if (letterSpacing !== 0 && hidden > 0) array.push(PDFNumber.of(gapShift(hidden)))
    array.push(chunk.font.encodeText(char))
    const adjustment = plan.adjustments[index]
    if (adjustment !== undefined && adjustment !== 0) array.push(PDFNumber.of(adjustment))
  })
  return PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [array])
}
