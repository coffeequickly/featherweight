// 머지된 페이지 위에 진짜 폰트로 텍스트를 다시 그린다. (PRD FR-7, §7.5)

import {
  PDFDocument,
  PDFFont,
  PDFPage,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setCharacterSpacing,
  PDFString
} from 'pdf-lib'

import { catalogEntry } from '../lib/fontCatalog'
import { matchFont } from '../lib/fontMatch'
import { styleForRun } from '../lib/runStyle'
import { codePointsOf, parseSvgText, ParseXml, SvgRun } from '../lib/svgText'
import { LinkSpan, linkSpansForRun } from '../lib/textLinks'
import { FontRef, Reason, StoredFont, TextRunSource } from '../lib/types'
import { createProbe, FontProbe, pdfLibFontkit } from './fontkitAdapter'

export type FontBytesLookup = (ref: FontRef) => Promise<Uint8Array | undefined>

export type DrawFallback = { nodeId: string; reason: Reason }

export type DrawResult = {
  drawn: number
  fallbacks: DrawFallback[]
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

  async get(
    family: string,
    style: string
  ): Promise<
    | { ok: true; font: PDFFont; covers: (codePoints: number[]) => number[] }
    | { ok: false; reason: Reason }
  > {
    // 카탈로그에 있으면 받아 오면 되므로 보관 목록에 없어도 된다
    const inCatalog = catalogEntry({ family, style }) !== undefined
    const match = matchFont({ family, style }, this.available)
    if (!inCatalog && !match.ok) return { ok: false, reason: match.reason }

    const ref = match.ok ? match.font : { family, style }
    const key = `${ref.family}\u0000${ref.style}`
    const cached = this.embedded.get(key)
    if (cached !== undefined) {
      const probe = this.parsed.get(key)
      return { ok: true, font: cached, covers: (points) => missingFrom(probe, points) }
    }

    const bytes = await this.lookup(ref)
    if (bytes === undefined)
      return { ok: false, reason: { code: 'font.readFailed', params: { family, style } } }

    try {
      const probe = createProbe(bytes)
      const font = await this.document.embedFont(bytes, { subset: true })
      this.embedded.set(key, font)
      this.parsed.set(key, probe)
      return { ok: true, font, covers: (points) => missingFrom(probe, points) }
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
  return codePoints.filter((point) => !probe.hasGlyphForCodePoint(point))
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
}

export async function drawTextLayer(
  page: PDFPage,
  sources: readonly TextRunSource[],
  cache: FontProvider,
  parse: ParseXml = parseXml,
  options: DrawOptions = { links: true }
): Promise<DrawResult> {
  const result: DrawResult = { drawn: 0, fallbacks: [] }
  const pageHeight = page.getHeight()

  for (const source of sources) {
    const runs = parseSvgText(source.svg, parse)
    if (runs.length === 0) {
      result.fallbacks.push({ nodeId: source.nodeId, reason: { code: 'reject.svgEmpty' } })
      continue
    }

    // 전부 그릴 수 있는지 먼저 확인하고, 확인이 끝난 뒤에만 그린다
    const planned: Array<{ run: SvgRun; font: PDFFont }> = []
    let reason: Reason | null = null

    for (const run of runs) {
      const style = styleForRun(source, run.fontWeight, run.italic)
      const resolved = await cache.get(style.family, style.style)
      if (!resolved.ok) {
        reason = resolved.reason
        break
      }

      const missing = resolved.covers(codePointsOf([run]))
      if (missing.length > 0) {
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

      planned.push({ run, font: resolved.font })
    }

    if (reason !== null) {
      result.fallbacks.push({ nodeId: source.nodeId, reason })
      continue
    }

    let cursor = 0
    for (const { run, font } of planned) {
      drawRun(page, run, source.offset, pageHeight, font)
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

function drawRun(
  page: PDFPage,
  run: SvgRun,
  offset: { x: number; y: number },
  pageHeight: number,
  font: PDFFont
): void {
  const x = offset.x + run.x
  const y = pageHeight - (offset.y + run.y)

  // characterSpacing 은 drawText 옵션이 아니다. PDF 연산자로 직접 걸고 되돌린다.
  const spaced = run.letterSpacing !== 0
  if (spaced) page.pushOperators(pushGraphicsState(), setCharacterSpacing(run.letterSpacing))

  page.drawText(run.text, {
    x,
    y,
    size: run.fontSize,
    font,
    color: rgb(run.fill.r, run.fill.g, run.fill.b),
    opacity: run.opacity
  })

  if (spaced) page.pushOperators(setCharacterSpacing(0), popGraphicsState())
}
