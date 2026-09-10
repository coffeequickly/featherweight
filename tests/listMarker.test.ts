// 마커 자리는 잰 값이다(2026-09-10, SUIT · 크기 7·12·24 · 단계 1·2·3).
// 그 실측을 여기 박아 둔다 — 상수를 누가 손대면 여기서 걸린다.

import { describe, expect, it } from 'vitest'

import { locateRun } from '../src/lib/textLinks'
import {
  INDENT_STEP,
  hasRtlListParagraph,
  isRtlParagraph,
  itemNumbers,
  planMarkers,
  markerInkAnchor,
  markerText,
  startsParagraph
} from '../src/lib/listMarker'

describe('문단 세기', () => {
  it('첫 글자와 개행 다음이 문단 시작이다', () => {
    const s = 'ㄱ\nㄴ'
    expect(startsParagraph(s, 0)).toBe(true)
    expect(startsParagraph(s, 2)).toBe(true)
    expect(startsParagraph(s, 1)).toBe(false)
  })
})

describe('번호 매기기', () => {
  it('같은 단계에서 1 부터 센다', () => {
    expect(itemNumbers([1, 1, 1])).toEqual([1, 2, 3])
  })

  it('중첩은 제 단계에서 따로 세고, 얕은 단계로 돌아오면 다시 1 부터다', () => {
    expect(itemNumbers([1, 2, 2, 1, 2])).toEqual([1, 1, 2, 2, 1])
  })

  it('목록이 아닌 문단이 끼면 셈이 끊긴다', () => {
    expect(itemNumbers([1, 1, 0, 1])).toEqual([1, 2, 0, 1])
  })
})

describe('마커 글자', () => {
  it('번호는 마침표까지, 글머리는 가운뎃점', () => {
    expect(markerText('ORDERED', 3)).toBe('3.')
    expect(markerText('UNORDERED', 3)).toBe('•')
  })
})

describe('마커 자리 — 실측값', () => {
  it('글머리는 거터 한가운데 — 크기 5~48 에서 비율이 정확히 0.75 였다', () => {
    // 실측(2026-09-10). 래스터의 픽셀 경계를 되돌린 참중심이다.
    for (const [size, textX, center] of [
      [5, 7.5, 3.75],
      [7, 10.5, 5.25],
      [12, 18, 9],
      [24, 36, 18],
      [48, 72, 36]
    ]) {
      const a = markerInkAnchor('UNORDERED', textX, size)
      expect(a.edge).toBe('center')
      expect(a.x).toBeCloseTo(center, 6)
    }
  })

  it('단계가 깊어져도 텍스트 시작에서의 거리는 같다', () => {
    // 실측: 단계 2·3·4 에서 중심이 26.875 · 44.875 · 62.875 (픽셀 보정 전)
    expect(markerInkAnchor('UNORDERED', 36, 12).x).toBeCloseTo(27, 6)
    expect(markerInkAnchor('UNORDERED', 54, 12).x).toBeCloseTo(45, 6)
    expect(markerInkAnchor('UNORDERED', 72, 12).x).toBeCloseTo(63, 6)
  })

  it('중심 기준은 서체를 안 탄다 — 폭이 아니라 가운데를 잡기 때문', () => {
    // 왼쪽 기준이던 시절에는 서체마다 0.854~0.929 로 흩어져 12pt 에서 0.9pt 어긋났다.
    // 잉크 폭이 2.25(Noto SC)~3.75(Inter)로 달라도 중심은 하나다.
    expect(markerInkAnchor('UNORDERED', 18, 12).x).toBe(9)
  })

  it('거터의 절반이다 — 매직넘버가 아니다', () => {
    for (const size of [5, 7, 12, 24, 48]) {
      const gutter = INDENT_STEP * size
      expect(markerInkAnchor('UNORDERED', gutter, size).x).toBeCloseTo(gutter / 2, 6)
    }
  })

  it('번호는 오른쪽 기준이다 — 자릿수가 늘어도 텍스트를 안 민다', () => {
    // 실측(픽셀 보정 후): 크기 12 → 오른쪽 13.25 / 크기 24 → 26.25
    const a = markerInkAnchor('ORDERED', 18, 12)
    expect(a.edge).toBe('right')
    expect(a.x).toBeCloseTo(13.2, 1)
    expect(markerInkAnchor('ORDERED', 36, 24).x).toBeCloseTo(26.4, 1)
  })

  it('항목이 열을 넘으면 Figma 가 거터를 넓힌다 — 그래서 공식이 아니라 SVG 를 믿는다', () => {
    // 실측: 12항목 번호 목록의 텍스트 시작이 18 이 아니라 26.11 이었다.
    // 우리는 그 자리를 그대로 받아 쓰므로 두 자리 번호도 맞는다.
    expect(markerInkAnchor('ORDERED', 26.11, 12).x).toBeCloseTo(21.3, 1)
  })
})

describe('planMarkers — 줄이 아니라 문단마다 붙는다', () => {
  const seg = (start: number, end: number, listType: string, indentation = 1) => ({
    start,
    end,
    listType,
    indentation
  })

  it('접혀 내려간 줄에는 안 붙는다', () => {
    // 한 문단이 두 줄로 접혔다 — 마커는 첫 줄에만
    const characters = '가나다라마바\n사아자'
    const runs = [
      { text: '가나다', x: 18, fontSize: 12 },
      { text: '라마바', x: 18, fontSize: 12 },
      { text: '사아자', x: 18, fontSize: 12 }
    ]
    const plans = planMarkers(characters, [seg(0, 10, 'UNORDERED')], runs, locateRun)
    expect(plans.map((p) => p.runIndex)).toEqual([0, 2])
    expect(plans.every((p) => p.text === '•')).toBe(true)
  })

  it('번호 목록은 문단 순서대로 센다', () => {
    const characters = '하나\n둘\n셋'
    const runs = [
      { text: '하나', x: 18, fontSize: 12 },
      { text: '둘', x: 18, fontSize: 12 },
      { text: '셋', x: 18, fontSize: 12 }
    ]
    const plans = planMarkers(characters, [seg(0, 8, 'ORDERED')], runs, locateRun)
    expect(plans.map((p) => p.text)).toEqual(['1.', '2.', '3.'])
    expect(plans.every((p) => p.edge === 'right')).toBe(true)
  })

  it('중첩 단계는 제 단계에서 따로 센다', () => {
    const characters = '하나\n안하나\n둘'
    const runs = [
      { text: '하나', x: 18, fontSize: 12 },
      { text: '안하나', x: 36, fontSize: 12 },
      { text: '둘', x: 18, fontSize: 12 }
    ]
    const segments = [seg(0, 3, 'ORDERED', 1), seg(3, 7, 'ORDERED', 2), seg(7, 9, 'ORDERED', 1)]
    const plans = planMarkers(characters, segments, runs, locateRun)
    expect(plans.map((p) => p.text)).toEqual(['1.', '1.', '2.'])
  })

  it('목록이 아닌 문단은 건너뛴다', () => {
    const characters = '제목\n항목'
    const runs = [
      { text: '제목', x: 0, fontSize: 12 },
      { text: '항목', x: 18, fontSize: 12 }
    ]
    const segments = [seg(0, 3, 'NONE', 0), seg(3, 5, 'UNORDERED', 1)]
    const plans = planMarkers(characters, segments, runs, locateRun)
    expect(plans.map((p) => p.runIndex)).toEqual([1])
  })

  it('마커 x 는 그 줄의 텍스트 시작에서 잰다 — 실측 상수', () => {
    const plans = planMarkers(
      '항목',
      [seg(0, 2, 'UNORDERED')],
      [{ text: '항목', x: 18, fontSize: 12 }],
      locateRun
    )
    expect(plans[0].edge).toBe('center')
    expect(plans[0].x).toBe(9)
  })
})

describe('오른쪽에서 왼쪽으로 쓰는 글', () => {
  it('문단의 방향은 첫 강방향 문자가 정한다 (UAX #9)', () => {
    expect(isRtlParagraph('مرحبا بالعالم')).toBe(true)
    expect(isRtlParagraph('שלום עולם')).toBe(true)
    expect(isRtlParagraph('Alpha bravo')).toBe(false)
    expect(isRtlParagraph('가나다 ABC')).toBe(false)
    expect(isRtlParagraph('中文 あいう')).toBe(false)
  })

  it('숫자·부호·공백은 방향이 약해 건너뛴다', () => {
    expect(isRtlParagraph('  123 — مرحبا')).toBe(true)
    expect(isRtlParagraph('  123 — Alpha')).toBe(false)
  })

  it('한글 문단에 아랍어 단어가 섞인 것은 RTL 이 아니다', () => {
    // 이 문단의 마커는 여전히 왼쪽에 있다 — 통째로 아웃라인으로 보내면 손해다
    expect(isRtlParagraph('보고서 مرحبا 결과')).toBe(false)
  })

  it('목록 문단이 RTL 일 때만 레이어를 물러세운다', () => {
    const seg = [{ start: 0, end: 40, listType: 'UNORDERED' }]
    expect(hasRtlListParagraph('가나다\nمرحبا', seg)).toBe(true)
    expect(hasRtlListParagraph('가나다\n보고서 مرحبا 결과', seg)).toBe(false)
    // 목록이 아닌 문단이 RTL 인 것은 상관없다
    expect(
      hasRtlListParagraph('مرحبا\n가나다', [{ start: 6, end: 40, listType: 'UNORDERED' }])
    ).toBe(false)
  })
})
