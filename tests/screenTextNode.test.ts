import { describe, expect, it } from 'vitest'

import { screenTextNode } from '../src/main/text'

// screenTextNode 는 fills·textDecoration 의 mixed 판정에 figma.mixed 를 쓴다
Object.assign(globalThis, { figma: { mixed: Symbol('mixed') } })

type Segment = {
  openTypeFeatures?: Record<string, boolean>
  listOptions?: { type: 'ORDERED' | 'UNORDERED' | 'NONE' }
}

type Box = { x: number; y: number; width: number; height: number }

/** 부모 흉내 — 판정이 보는 합성 속성만 */
type FakeParent = {
  type: string
  parent: FakeParent | null
  children: unknown[]
  opacity?: number
  blendMode?: string
  effects?: Array<{ type: string; visible?: boolean }>
  fills?: Array<{ visible?: boolean }>
  clipsContent?: boolean
  absoluteBoundingBox?: Box | null
}

const page: FakeParent = { type: 'PAGE', parent: null, children: [] }

function frame(overrides: Partial<FakeParent> = {}, parent: FakeParent | null = page): FakeParent {
  return {
    type: 'FRAME',
    parent,
    children: [],
    opacity: 1,
    blendMode: 'PASS_THROUGH',
    effects: [],
    fills: [{ visible: true }],
    clipsContent: false,
    absoluteBoundingBox: { x: 0, y: 0, width: 1000, height: 1000 },
    ...overrides
  }
}

/** 판정 조건을 전부 통과하는 평범한 텍스트 — 세그먼트와 합성 속성만 바꿔 가며 본다 */
function fakeText(segments: Segment[], overrides: Record<string, unknown> = {}): TextNode {
  return {
    visible: true,
    characters: '1st, 2nd',
    absoluteTransform: [
      [1, 0, 0],
      [0, 1, 0]
    ],
    fills: [{ type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0 } }],
    strokes: [],
    effects: [],
    textDecoration: 'NONE',
    isMask: false,
    blendMode: 'PASS_THROUGH',
    opacity: 1,
    parent: null,
    absoluteRenderBounds: null,
    absoluteBoundingBox: { x: 10, y: 10, width: 100, height: 20 },
    getStyledTextSegments: () => segments,
    ...overrides
  } as unknown as TextNode
}

describe('screenTextNode — 위첨자·목록', () => {
  it('평범한 세그먼트는 통과한다', () => {
    const node = fakeText([{ openTypeFeatures: { LIGA: true }, listOptions: { type: 'NONE' } }])
    expect(screenTextNode(node)).toEqual({ ok: true })
  })

  it('SUPS/SUBS 가 켜진 세그먼트가 하나라도 있으면 아웃라인으로 남긴다', () => {
    expect(screenTextNode(fakeText([{ openTypeFeatures: { SUPS: true } }]))).toEqual({
      ok: false,
      reason: { code: 'reject.superscript' }
    })
    expect(
      screenTextNode(
        fakeText([{ openTypeFeatures: { LIGA: true } }, { openTypeFeatures: { SUBS: true } }])
      )
    ).toEqual({ ok: false, reason: { code: 'reject.superscript' } })
    // 꺼져 있는 것은 위첨자가 아니다
    expect(screenTextNode(fakeText([{ openTypeFeatures: { SUPS: false } }]))).toEqual({ ok: true })
  })

  it('목록은 통과시킨다 — 마커 자리를 실측해 우리가 그린다(lib/listMarker)', () => {
    // 0.2.0~3.0 은 여기서 막았다. 마커가 characters·SVG·잉크 경계 어디에도 없어 다시 그릴
    // 재료가 없었기 때문인데, 프레임 래스터에서 자리를 재어 공식을 세우면서 풀었다.
    // 실기 문서에서 이 거부 하나가 파일의 대부분을 벡터 패스로 만들고 있었다.
    expect(screenTextNode(fakeText([{ listOptions: { type: 'ORDERED' } }]))).toEqual({ ok: true })
    expect(
      screenTextNode(
        fakeText([{ listOptions: { type: 'NONE' } }, { listOptions: { type: 'UNORDERED' } }])
      )
    ).toEqual({ ok: true })
  })

  it('openTypeFeatures·listOptions 가 없는 옛 API 응답도 통과한다', () => {
    expect(screenTextNode(fakeText([{}]))).toEqual({ ok: true })
  })
})

describe('screenTextNode — 합성 상태', () => {
  const plain: Segment[] = [{ listOptions: { type: 'NONE' } }]
  const code = (node: TextNode, root?: FakeParent): string | null => {
    const verdict = screenTextNode(node, root as unknown as BaseNode)
    return verdict.ok ? null : verdict.reason.code
  }

  it('마스크로 쓰인 텍스트, 블렌드 모드가 있는 텍스트는 아웃라인으로 남긴다', () => {
    expect(code(fakeText(plain, { isMask: true }))).toBe('reject.mask')
    expect(code(fakeText(plain, { blendMode: 'MULTIPLY' }))).toBe('reject.blend')
    expect(code(fakeText(plain, { blendMode: 'NORMAL' }))).toBeNull()
  })

  it('노드 자신의 불투명도는 통과한다 — SVG 에 실려 와서 그대로 그린다', () => {
    expect(code(fakeText(plain, { opacity: 0.6 }))).toBeNull()
  })

  it('반투명·블렌드·마스크가 있는 조상 안이면 아웃라인으로 남긴다', () => {
    expect(code(fakeText(plain, { parent: frame({ opacity: 0.5 }) }))).toBe('reject.translucent')
    expect(code(fakeText(plain, { parent: frame({ blendMode: 'MULTIPLY' }) }))).toBe('reject.blend')
    const masked = frame({ children: [{ isMask: true }] })
    expect(code(fakeText(plain, { parent: masked }))).toBe('reject.mask')
  })

  it('조상의 효과: 레이어 흐림과 채움 없는 그림자만 막는다 — 채워진 카드의 그림자는 글자와 무관하다', () => {
    const blurred = frame({ effects: [{ type: 'LAYER_BLUR' }] })
    expect(code(fakeText(plain, { parent: blurred }))).toBe('reject.parentEffects')
    const card = frame({ effects: [{ type: 'DROP_SHADOW' }], fills: [{ visible: true }] })
    expect(code(fakeText(plain, { parent: card }))).toBeNull()
    const bare = frame({ effects: [{ type: 'DROP_SHADOW' }], fills: [] })
    expect(code(fakeText(plain, { parent: bare }))).toBe('reject.parentEffects')
    const backdrop = frame({ effects: [{ type: 'BACKGROUND_BLUR' }], fills: [] })
    expect(code(fakeText(plain, { parent: backdrop }))).toBeNull()
    const hiddenBlur = frame({ effects: [{ type: 'LAYER_BLUR', visible: false }] })
    expect(code(fakeText(plain, { parent: hiddenBlur }))).toBeNull()
  })

  it('클리핑 프레임 밖으로 나간 글자는 아웃라인으로, 안에 든 글자는 통과', () => {
    const tight = frame({
      clipsContent: true,
      absoluteBoundingBox: { x: 0, y: 0, width: 50, height: 50 }
    })
    expect(code(fakeText(plain, { parent: tight }))).toBe('reject.clipped')
    const roomy = frame({
      clipsContent: true,
      absoluteBoundingBox: { x: 0, y: 0, width: 500, height: 50 }
    })
    expect(code(fakeText(plain, { parent: roomy }))).toBeNull()
    // 클리핑을 안 하면 밖으로 나가도 보인다 — 다시 그려도 같다
    const open = frame({
      clipsContent: false,
      absoluteBoundingBox: { x: 0, y: 0, width: 50, height: 50 }
    })
    expect(code(fakeText(plain, { parent: open }))).toBeNull()
  })

  it('내보내는 루트 밖의 조상은 보지 않는다 — 프리플라이트와 export 가 같은 경계를 쓴다', () => {
    const section = frame({ type: 'SECTION', opacity: 0.5 })
    const root = frame({}, section)
    const inner = frame({}, root)
    expect(code(fakeText(plain, { parent: inner }), root)).toBeNull()
    expect(code(fakeText(plain, { parent: inner }))).toBe('reject.translucent')
  })

  it('페이지까지 올라가면 멈춘다', () => {
    expect(code(fakeText(plain, { parent: frame() }))).toBeNull()
  })
})
