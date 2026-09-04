// Figma 의 SVG_STRING(svgOutlineText:false) → 그릴 수 있는 run 목록.
// Figma·DOM 의존 금지 — DOMParser 는 주입받는다. (PRD FR-7, §7.2)
//
// 줄바꿈·정렬·자간이 이미 반영된 좌표를 Figma 가 주므로 우리가 조판을 다시 하지 않는다.
// 이게 이 접근의 핵심이다. 우리는 좌표를 그대로 옮겨 적기만 한다.
//
// ⚠ 이 파서가 가정하는 구조는 스파이크 S3 에서 실물로 확인해야 한다.
// 구조가 다르면 runs 가 비고, 그 노드는 아웃라인으로 안전하게 fallback 된다.

import { isIgnorable, splitIgnorable, stripIgnorable } from './ignorable'

export type RGB = { r: number; g: number; b: number }

export type SvgRun = {
  text: string
  /** 노드 박스 좌상단 기준 (px). y 는 baseline. */
  x: number
  y: number
  fontFamily: string
  fontWeight: number
  italic: boolean
  fontSize: number
  /** px 로 환산한 자간 */
  letterSpacing: number
  /** 글자 i 앞에 있던 폭 0 서식 문자(묶음문자 등) 수. 길이 text.length + 1, 마지막은 끝에 붙은 수. 없으면 전부 0 */
  gaps?: number[]
  fill: RGB
  opacity: number
}

export type ParseXml = (svg: string) => Document

const DEFAULT_FILL: RGB = { r: 0, g: 0, b: 0 }
const DEFAULT_SIZE = 16

/**
 * Figma 는 `xml:space="preserve"` 로 내보내서 tspan 안에 줄바꿈 문자가 그대로 남는다.
 * LF(\n), CR, U+2028(문단 내 줄바꿈), U+2029 가 실제로 나온다.
 *
 * 줄은 이미 tspan 으로 나뉘어 있으므로 이 문자들은 찌꺼기다. 남겨두면
 * pdf-lib 의 drawText 가 \n 에서 줄을 바꿔 텍스트가 엉뚱한 곳에 쏟아진다.
 */
const LINE_BREAKS = /[\r\n\u2028\u2029]/g

export function stripLineBreaks(text: string): string {
  return text.replace(LINE_BREAKS, '')
}

/**
 * 한글을 완성형(NFC)으로 맞춘다.
 *
 * macOS 를 거친 텍스트는 분해형(NFD)으로 들어오는 일이 있다 — "개" 가 U+1100 U+1162 두 자로
 * 쪼개져 있는 식이다. 대부분의 한글 폰트는 완성형 음절만 갖고 조합형 자모(U+1100–11FF)는
 * 없어서(Pretendard 도 그렇다) 커버리지 검사에서 통째로 떨어진다.
 *
 * NFC 는 같은 글자의 표준 표기이므로 보이는 결과는 같다.
 */
export function normalizeText(text: string): string {
  // 묶음문자 같은 폭 0 서식 문자는 뺀다 — 폰트에 없어도 그릴 게 없고, 남기면 노드째 아웃라인이 된다
  return stripIgnorable(stripLineBreaks(text)).normalize('NFC')
}

/** run 텍스트로 — 무시 문자는 빼되 자릿수(gaps)는 남긴다. 자간이 그 수만큼 더 붙어야 Figma 와 같다 */
function normalizeRun(text: string): { text: string; gaps: number[] } {
  return splitIgnorable(stripLineBreaks(text).normalize('NFC'))
}

/**
 * `<text>` / `<tspan>` 을 문서 순서로 걸어 run 을 만든다.
 * 속성은 `<text>` 에 있을 수도 `<tspan>` 에 있을 수도 있어서 부모 값을 물려받는다.
 */
export function parseSvgText(svg: string, parseXml: ParseXml): SvgRun[] {
  const runs: SvgRun[] = []

  let document: Document
  try {
    document = parseXml(svg)
  } catch {
    return runs
  }

  const texts = document.getElementsByTagName('text')

  for (let index = 0; index < texts.length; index += 1) {
    const textElement = texts[index]
    const base = readStyle(textElement, {
      fontFamily: '',
      fontWeight: 400,
      italic: false,
      fontSize: DEFAULT_SIZE,
      letterSpacing: 0,
      fill: DEFAULT_FILL,
      opacity: 1
    })

    const spans = textElement.getElementsByTagName('tspan')

    if (spans.length === 0) {
      const content = normalizeRun(textElement.textContent ?? '')
      if (content.text !== '') {
        runs.push({
          ...base,
          text: content.text,
          gaps: content.gaps,
          x: readNumber(textElement, 'x', 0),
          y: readNumber(textElement, 'y', 0)
        })
      }
      continue
    }

    for (let spanIndex = 0; spanIndex < spans.length; spanIndex += 1) {
      const span = spans[spanIndex]
      const content = normalizeRun(span.textContent ?? '')
      if (content.text === '') continue

      const style = readStyle(span, base)
      runs.push({
        ...style,
        text: content.text,
        gaps: content.gaps,
        x: readNumber(span, 'x', readNumber(textElement, 'x', 0)),
        y: readNumber(span, 'y', readNumber(textElement, 'y', 0))
      })
    }
  }

  return runs
}

type Style = Omit<SvgRun, 'text' | 'x' | 'y'>

function readStyle(element: Element, inherited: Style): Style {
  const fontSize = readNumber(element, 'font-size', inherited.fontSize)
  const weightRaw = element.getAttribute('font-weight')
  const styleRaw = element.getAttribute('font-style')
  const fillRaw = element.getAttribute('fill')
  const opacityRaw = element.getAttribute('fill-opacity') ?? element.getAttribute('opacity')

  return {
    fontFamily: element.getAttribute('font-family') ?? inherited.fontFamily,
    fontWeight: weightRaw === null ? inherited.fontWeight : parseWeight(weightRaw),
    italic: styleRaw === null ? inherited.italic : styleRaw !== 'normal',
    fontSize,
    letterSpacing: parseLetterSpacing(
      element.getAttribute('letter-spacing'),
      fontSize,
      inherited.letterSpacing
    ),
    fill: fillRaw === null ? inherited.fill : (parseColor(fillRaw) ?? inherited.fill),
    opacity: opacityRaw === null ? inherited.opacity : clamp01(Number(opacityRaw))
  }
}

function readNumber(element: Element, name: string, fallback: number): number {
  const raw = element.getAttribute(name)
  if (raw === null) return fallback
  const value = Number.parseFloat(raw)
  return Number.isFinite(value) ? value : fallback
}

export function parseWeight(raw: string): number {
  const numeric = Number.parseInt(raw, 10)
  if (Number.isFinite(numeric)) return numeric
  if (raw === 'bold') return 700
  if (raw === 'normal') return 400
  return 400
}

/** SVG 는 em·px 둘 다 쓴다. 그리기는 px 로 한다. */
export function parseLetterSpacing(raw: string | null, fontSize: number, fallback: number): number {
  if (raw === null) return fallback

  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value)) return fallback

  if (raw.trim().endsWith('em')) return value * fontSize
  return value
}

const NAMED_COLORS: Record<string, RGB> = {
  black: { r: 0, g: 0, b: 0 },
  white: { r: 1, g: 1, b: 1 }
}

export function parseColor(raw: string): RGB | null {
  const value = raw.trim().toLowerCase()
  if (value === 'none' || value === 'transparent') return null

  // Figma 는 검정을 `fill="black"` 으로 내보낸다
  const named = NAMED_COLORS[value]
  if (named !== undefined) return named

  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/)
  if (hex !== null) {
    const digits = hex[1]
    const full =
      digits.length === 3
        ? digits
            .split('')
            .map((digit) => digit + digit)
            .join('')
        : digits
    return {
      r: Number.parseInt(full.slice(0, 2), 16) / 255,
      g: Number.parseInt(full.slice(2, 4), 16) / 255,
      b: Number.parseInt(full.slice(4, 6), 16) / 255
    }
  }

  const rgb = value.match(/^rgba?\(([^)]+)\)$/)
  if (rgb !== null) {
    const parts = rgb[1].split(',').map((part) => Number.parseFloat(part))
    if (parts.length >= 3 && parts.slice(0, 3).every((part) => Number.isFinite(part))) {
      return { r: parts[0] / 255, g: parts[1] / 255, b: parts[2] / 255 }
    }
  }

  return null
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(1, Math.max(0, value))
}

/** run 들이 쓰는 코드포인트 전부. 글리프 커버리지 검사용. (FR-7 조건 4) */
export function codePointsOf(runs: readonly SvgRun[]): number[] {
  const set = new Set<number>()
  for (const run of runs) {
    for (const char of run.text) {
      const code = char.codePointAt(0)
      if (code !== undefined && !isIgnorable(code)) set.add(code)
    }
  }
  return [...set]
}
