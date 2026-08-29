// 텍스트를 진짜 폰트로 다시 그리기 위한 재료를 뽑고, 원래 글리프를 지운다. (PRD FR-7)
//
// Figma 는 텍스트를 Type 3 폰트로 내보낸다 — 한글이면 이게 파일의 84% 다.
// fill 을 비우면 그 글리프가 빠지고, UI 가 같은 자리에 진짜 폰트로 다시 그린다.

import { FontRef, Reason, TextRunSource, TextSegment } from '../lib/types'

export type TextCandidate = {
  node: TextNode
  source: TextRunSource
  fontRefs: FontRef[]
}

/** 회전 성분이 있으면 좌표 변환이 단순 평행이동이 아니게 된다 — 그런 노드는 건드리지 않는다. */
function isAxisAligned(node: TextNode): boolean {
  const [[a, b], [c, d]] = node.absoluteTransform
  const rotated = Math.abs(b) > 1e-6 || Math.abs(c) > 1e-6
  const flipped = a < 0 || d < 0
  return !rotated && !flipped
}

/**
 * 처리 대상 판정. 하나라도 어긋나면 아웃라인을 그대로 두고 사유를 남긴다.
 * "안 되면 원래대로" 가 이 기능의 안전장치다 — 절대 다른 폰트로 대체하지 않는다.
 */
export function screenTextNode(node: TextNode): { ok: true } | { ok: false; reason: Reason } {
  if (node.visible === false) return { ok: false, reason: { code: 'reject.hidden' } }
  if (node.characters === '') return { ok: false, reason: { code: 'reject.empty' } }
  if (!isAxisAligned(node)) return { ok: false, reason: { code: 'reject.rotated' } }

  // 패스 위 텍스트는 TEXT 가 아니라 TEXT_PATH 노드라 collectTextNodes 에서 이미 빠진다.

  const fills = node.fills
  if (fills === figma.mixed) return { ok: false, reason: { code: 'reject.mixedFill' } }
  if (!Array.isArray(fills) || fills.length === 0)
    return { ok: false, reason: { code: 'reject.noFill' } }
  if (fills.some((paint) => paint.type !== 'SOLID' || paint.visible === false)) {
    return { ok: false, reason: { code: 'reject.nonSolidFill' } }
  }

  const strokes = node.strokes
  if (Array.isArray(strokes) && strokes.length > 0) {
    return { ok: false, reason: { code: 'reject.stroked' } }
  }

  const effects = node.effects
  if (Array.isArray(effects) && effects.some((effect) => effect.visible !== false)) {
    return { ok: false, reason: { code: 'reject.effects' } }
  }

  // 밑줄·취소선은 fill 과 함께 지워지는데 다시 그리는 코드가 아직 없다.
  // 조용히 사라지게 두느니 아웃라인으로 남긴다 — 모양은 원본 그대로다.
  const decoration = node.textDecoration
  if (decoration === figma.mixed || decoration !== 'NONE') {
    return { ok: false, reason: { code: 'reject.decorated' } }
  }

  return { ok: true }
}

/**
 * SVG·세그먼트·오프셋을 뽑는다. **fill 을 비우기 전에** 해야 한다 —
 * fill 이 비면 Figma 가 SVG 에도 텍스트를 안 넣는다.
 */
export async function extractText(
  node: TextNode,
  frame: SceneNode
): Promise<TextCandidate | { failed: Reason }> {
  try {
    const svg = await node.exportAsync({
      format: 'SVG_STRING',
      svgOutlineText: false,
      useAbsoluteBounds: true
    })

    const box = node.absoluteBoundingBox
    const frameBox = frame.absoluteBoundingBox
    if (box === null || frameBox === null) return { failed: { code: 'reject.noBounds' } }

    const segments = node
      .getStyledTextSegments([
        'fontName',
        'fontSize',
        'fills',
        'letterSpacing',
        'textDecoration',
        'textCase',
        'hyperlink'
      ])
      .map((segment): TextSegment => ({
        start: segment.start,
        end: segment.end,
        fontName: { family: segment.fontName.family, style: segment.fontName.style },
        fontSize: segment.fontSize,
        fills: segment.fills.map((paint) => ({
          r: paint.type === 'SOLID' ? paint.color.r : 0,
          g: paint.type === 'SOLID' ? paint.color.g : 0,
          b: paint.type === 'SOLID' ? paint.color.b : 0,
          a: paint.opacity ?? 1
        })),
        letterSpacing: {
          unit: segment.letterSpacing.unit,
          value: segment.letterSpacing.value
        },
        textDecoration: String(segment.textDecoration),
        textCase: String(segment.textCase),
        hyperlink:
          segment.hyperlink !== null && segment.hyperlink.type === 'URL'
            ? { type: 'URL', value: segment.hyperlink.value ?? '' }
            : null
      }))

    const fontRefs = segments.map((segment) => segment.fontName)

    return {
      node,
      fontRefs,
      source: {
        nodeId: node.id,
        characters: node.characters,
        svg,
        offset: { x: box.x - frameBox.x, y: box.y - frameBox.y },
        segments
      }
    }
  } catch (error) {
    return {
      failed: {
        code: 'reason.raw',
        params: { message: error instanceof Error ? error.message : String(error) }
      }
    }
  }
}

/** 클론 안의 텍스트 노드를 모은다. */
export function collectTextNodes(root: SceneNode): TextNode[] {
  const out: TextNode[] = []

  const visit = (node: SceneNode): void => {
    if (node.visible === false) return
    if (node.type === 'TEXT') out.push(node)
    if ('children' in node) {
      for (const child of node.children) visit(child)
    }
  }

  visit(root)
  return out
}

/**
 * 오토레이아웃을 꺼서 자식들을 지금 자리에 굳힌다.
 *
 * HUG 로 잡힌 프레임은 레이아웃을 끄는 순간 크기가 변하므로 먼저 FIXED 로 바꾼다.
 * 클론에서만 부르므로 원본 문서는 그대로다.
 */
function freezeLayout(parent: BaseNode | null): void {
  if (parent === null || !('layoutMode' in parent)) return

  const frame = parent as FrameNode
  if (frame.layoutMode === 'NONE') return

  try {
    if (frame.layoutSizingHorizontal === 'HUG') frame.layoutSizingHorizontal = 'FIXED'
    if (frame.layoutSizingVertical === 'HUG') frame.layoutSizingVertical = 'FIXED'
  } catch {
    // 오토레이아웃 자식이 아니면 이 속성을 못 쓴다 — 크기는 어차피 안 변한다
  }

  frame.layoutMode = 'NONE'
}

/**
 * 글리프를 export 에서 완전히 빼낸다.
 *
 * ⚠ fill 만 비우면 안 된다. 눈에는 안 보이지만 텍스트 그리기 연산과 Type 3 폰트·
 * ToUnicode 가 PDF 에 그대로 남는다. 화면은 멀쩡한데 추출기만 유령 텍스트를 읽어서,
 * 우리가 다시 그린 문장과 겹쳐 나온다 — 실측한 이력서에서 추출 텍스트의 5% 가 유령이었고
 * 이름이 "장장원석A AI" 로 깨졌다. ATS 가 가장 먼저 읽는 자리다.
 *
 * visible = false 면 export 에서 아예 빠지지만 오토레이아웃 형제가 재배치된다 (C6).
 * 그래서 부모의 레이아웃을 먼저 굳힌 뒤 숨긴다.
 */
export function hideTextGlyphs(node: TextNode): void {
  freezeLayout(node.parent)
  node.visible = false
}
