// 텍스트를 진짜 폰트로 다시 그리기 위한 재료를 뽑고, 원래 글리프를 지운다. (PRD FR-7)
//
// Figma 는 텍스트를 Type 3 폰트로 내보낸다 — 한글이면 이게 파일의 84% 다.
// fill 을 비우면 그 글리프가 빠지고, UI 가 같은 자리에 진짜 폰트로 다시 그린다.

import { transformScale } from '../lib/imageTarget'
import { FontRef, Reason, TextRunSource, TextSegment } from '../lib/types'
import { withTimeout } from '../lib/withTimeout'

/** SVG 추출 한도 — 응답 없는 노드 하나가 내보내기 전체를 멈추지 않게 */
const SVG_TIMEOUT_MS = 15_000

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
export function screenTextNode(
  node: TextNode,
  root?: BaseNode
): { ok: true } | { ok: false; reason: Reason } {
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

  // 합성 상태 — 다시 그린 글자는 마스크·블렌드·조상의 불투명도·효과·클리핑을 받지 않는다.
  // 노드 자신의 불투명도는 SVG 에 실려 오므로 그대로 그린다(svgText 가 <g opacity> 까지 읽는다).
  if (node.isMask) return { ok: false, reason: { code: 'reject.mask' } }
  if (!isNormalBlend(node.blendMode)) return { ok: false, reason: { code: 'reject.blend' } }
  const composed = screenAncestors(node, root)
  if (composed !== null) return { ok: false, reason: composed }

  // 위첨자·아래첨자: Figma 는 폰트에 위첨자 글리프가 없는 글자를 축소·이동해 합성하고, 한 레이어에
  // 있는 글자와 없는 글자가 섞이면 전부 합성으로 통일한다. 우리는 OpenType sups/subs 를 켜서
  // 그릴 뿐이라 숫자는 폰트의 위첨자 글리프, 쉼표는 본문 크기 기준선으로 남았다(사용자 제보).
  // 그 규칙을 흉내 내기 전까지는 원래 모양(아웃라인)으로 둔다.
  //
  // 목록은 이제 우리가 그린다. 마커가 characters 에도 SVG 에도 없는 것은 그대로지만,
  // 자리를 실측해 공식을 세웠다(lib/listMarker). 어긋나면 그리는 쪽에서 물러선다.
  for (const segment of node.getStyledTextSegments(['openTypeFeatures'])) {
    const features = (segment.openTypeFeatures ?? {}) as Partial<Record<string, boolean>>
    if (features.SUPS === true || features.SUBS === true) {
      return { ok: false, reason: { code: 'reject.superscript' } }
    }
  }

  return { ok: true }
}

function isNormalBlend(mode: BlendMode): boolean {
  return mode === 'NORMAL' || mode === 'PASS_THROUGH'
}

type Box = { x: number; y: number; width: number; height: number }

function contains(outer: Box, inner: Box, tolerance = 0.5): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  )
}

/**
 * 내보내는 루트까지의 조상을 본다. 루트 밖(페이지·섹션)은 export 에 안 실리므로 보지 않는다 —
 * 프리플라이트(원본 프레임)와 export(클론)가 같은 답을 내려면 같은 경계에서 멈춰야 한다.
 *
 * - 불투명도·블렌드가 있는 컨테이너: 다시 그린 글자는 그 합성을 안 받는다
 * - 마스크 그룹: 마스크 위의 글자를 숨기면 마스크 모양이 바뀌고(글자가 마스크일 때), 글자가
 *   마스크에 잘리던 것도 통째로 나온다. 형제 중 마스크가 있으면 보수적으로 뺀다
 * - 레이어 흐림은 글자까지 흐리고, 채움 없는 부모의 그림자는 글자 모양으로 진다
 * - 클리핑 프레임 밖으로 나간 글자는 잘려 보였는데 다시 그리면 통째로 보인다
 */
function screenAncestors(node: TextNode, root: BaseNode | undefined): Reason | null {
  const box = node.absoluteRenderBounds ?? node.absoluteBoundingBox
  for (let parent = node.parent; parent !== null && parent !== root; parent = parent.parent) {
    if (parent.type === 'PAGE' || parent.type === 'DOCUMENT') break

    if ('opacity' in parent && parent.opacity < 1) return { code: 'reject.translucent' }
    if ('blendMode' in parent && !isNormalBlend(parent.blendMode)) return { code: 'reject.blend' }
    if (parent.children.some((child) => 'isMask' in child && child.isMask === true)) {
      return { code: 'reject.mask' }
    }
    if ('effects' in parent && Array.isArray(parent.effects)) {
      const filled =
        'fills' in parent &&
        Array.isArray(parent.fills) &&
        parent.fills.some((paint) => paint.visible !== false)
      const breaks = parent.effects.some(
        (effect) =>
          effect.visible !== false &&
          (effect.type === 'LAYER_BLUR' ||
            (!filled && (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW')))
      )
      if (breaks) return { code: 'reject.parentEffects' }
    }
    if ('clipsContent' in parent && parent.clipsContent === true && box !== null) {
      const frame = parent.absoluteBoundingBox
      if (frame !== null && !contains(frame, box)) return { code: 'reject.clipped' }
    }
  }
  return null
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
    const svg = await withTimeout(
      node.exportAsync({
        format: 'SVG_STRING',
        svgOutlineText: false,
        useAbsoluteBounds: true
      }),
      SVG_TIMEOUT_MS,
      node.name
    )

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
        'hyperlink',
        'openTypeFeatures',
        'listOptions',
        'indentation'
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
        listType: segment.listOptions?.type ?? 'NONE',
        indentation: segment.indentation ?? 0,
        textCase: String(segment.textCase),
        hyperlink:
          segment.hyperlink !== null && segment.hyperlink.type === 'URL'
            ? { type: 'URL', value: segment.hyperlink.value ?? '' }
            : null,
        // Figma 는 'SS18' 처럼 대문자 — OpenType 태그는 소문자다. 실측: SUIT 의 "→" 는 ss18 을
        // 켜야 막대 있는 화살표고, 기본은 꺾쇠(〉)다. 기능을 잃으면 다른 글자가 나간다
        features: Object.fromEntries(
          Object.entries(segment.openTypeFeatures ?? {}).map(([tag, enabled]) => [
            tag.toLowerCase(),
            enabled === true
          ])
        )
      }))

    const fontRefs = segments.map((segment) => segment.fontName)

    // Figma 가 그린 잉크 폭 — UI 가 우리 폰트로 놓은 폭과 견줘 다른 판의 폰트를 잡는다
    const render = node.absoluteRenderBounds
    const scale = transformScale(node.absoluteTransform)
    const inkWidth =
      render === null || !(scale.x > 0) || !(render.width > 0) ? undefined : render.width / scale.x

    return {
      node,
      fontRefs,
      source: {
        nodeId: node.id,
        characters: node.characters,
        svg,
        offset: { x: box.x - frameBox.x, y: box.y - frameBox.y },
        segments,
        ...(inkWidth === undefined ? {} : { inkWidth })
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
/**
 * 클론 안의 인스턴스를 전부 떼어 낸다(detach).
 *
 * 인스턴스는 레이아웃 속성을 못 바꾼다 — 그래서 freezeLayout 이 안 먹고, 그 안의 텍스트를
 * 숨기면 허그 높이가 줄어 형제가 당겨진다. 실측: 이력서의 "섹션 타이틀" 인스턴스(세로
 * 오토레이아웃·허그)에서 제목을 숨기자 아래 구분선이 제목 높이만큼(14pt) 올라와 제목 위에
 * 얹혔다. 떼어 낸 프레임은 보기에 똑같고 클론은 버리는 것이라 잃을 게 없다.
 * 바깥 인스턴스부터 떼야 안쪽이 떼어진다 — 안쪽 것은 던지므로 한 바퀴 더 돈다.
 * 루트 자체가 인스턴스면 새 프레임을 돌려주니 호출자가 바꿔 잡아야 한다.
 */
export function detachInstances(root: SceneNode): SceneNode {
  let top: SceneNode = root
  if (top.type === 'INSTANCE') top = top.detachInstance()

  for (let round = 0; round < 20; round += 1) {
    if (!('findAll' in top)) return top
    const instances = top.findAll((node) => node.type === 'INSTANCE') as InstanceNode[]
    if (instances.length === 0) return top
    let detached = 0
    for (const instance of instances) {
      try {
        if (!instance.removed) {
          instance.detachInstance()
          detached += 1
        }
      } catch {
        // 안쪽 인스턴스는 바깥을 뗀 뒤에야 떼어진다 — 다음 바퀴
      }
    }
    if (detached === 0) return top // 하나도 못 뗐으면 돌아 봐야 같다
  }
  return top
}

/**
 * 텍스트를 숨겨도 형제가 움직이지 않게 — 가장 가까운 오토레이아웃 조상을 굳힌다.
 *
 * 직계 부모만 보면 안 된다. 텍스트가 **그룹** 안에 있으면 그룹은 자식 크기를 따라가므로
 * 숨기는 순간 그룹이 줄고, 그 위의 오토레이아웃이 아래 형제(구분선 등)를 끌어올린다.
 * 실측: 이력서의 "Career History" 제목이 그룹 안에 있어 구분선이 14pt 위로 올라왔다.
 * 오토레이아웃이 아닌 프레임을 만나면 그 안은 절대 좌표라 더 볼 것 없다.
 */
export function freezeLayout(parent: BaseNode | null): void {
  let current: BaseNode | null = parent
  while (current !== null && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    if ('layoutMode' in current) {
      freezeFrame(current as FrameNode)
      return
    }
    current = current.parent
  }
}

function freezeFrame(frame: FrameNode): void {
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
