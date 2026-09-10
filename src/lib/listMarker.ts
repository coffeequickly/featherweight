// 글머리·번호 목록의 마커를 우리가 그린다. Figma·DOM 의존 금지.
//
// Figma 는 마커를 **어디로도 주지 않는다.** 실측으로 확인한 사각지대가 다섯이다:
// `characters`, SVG(outlineText false·true 둘 다), `absoluteRenderBounds`, 노드 PNG.
// 마커는 렌더링 결과에만 있다. 그래서 0.2.0 이후 목록 레이어는 통째로 아웃라인으로 남겼고,
// 실기 문서에서 그것이 파일의 대부분을 차지했다(1.7MB 중 95%가 벡터 패스, 텍스트는 4.7%).
//
// 재료가 없으면 만들어야 한다. 프레임을 4배 PNG 로 뽑아 거터를 픽셀로 훑어서 자리를 쟀다
// (2026-09-10, SUIT · 크기 7·12·24 · 단계 1·2·3 · 두 종류). 결과가 기분 좋게 단순하다 —
// 마커 자리는 **텍스트 시작에서 왼쪽으로 글자 크기의 일정 배수**이고, 크기에도 단계에도
// 그 배수가 변하지 않는다. 여덟 표본 중 다섯이 소수점 셋째 자리까지 같았다.
//
//   텍스트 시작 = 1.5 × 크기 × 단계
//   글머리(•)  잉크 **중심** = 텍스트x − (1.5 × 크기) / 2      = 거터 한가운데
//   번호(1.)   잉크 오른쪽   = 텍스트x − 0.40 × 크기            (우측 정렬)
//
// 글머리는 **거터 한가운데**다. 매직넘버가 아니라 들여쓰기 폭의 정확히 절반이고, 크기
// 5·7·12·24·48 다섯에서 비율이 0.7500 으로 소수점 넷째 자리까지 같았다.
//
// 여기까지 두 번 틀렸다. 처음에는 잉크 **왼쪽**을 기준으로 0.861 을 썼는데 한 서체(SUIT)
// 에서만 잰 값이었다. 서체 여섯 종(Inter·SUIT·Noto JP/SC/Thai/Devanagari)으로 넓혀 재니
// 블릿 글리프 폭이 2.25~3.75pt(12pt 기준)로 제각각인데도 잉크 중심은 전부 같았다 —
// 왼쪽 기준은 서체마다 0.854~0.929 로 흩어지고(표준편차 0.024) 중심은 0.005 로 모인다.
// 두 번째로 중심 비율을 0.7626 으로 뒀는데, 그건 래스터가 주는 픽셀 경계를 그대로 쓴 값
// 이었다. 4배 래스터에서 오른쪽 끝은 0.25pt 만큼 덜 잡히므로 그걸 되돌리면 정확히 0.75 다.
//
// 번호는 자릿수에 따라 폭이 변하므로 오른쪽을 기준으로 잡는다. 항목이 열을 넘어 두 자리가
// 되면 **Figma 가 거터 자체를 넓힌다**(실측: 12항목에서 18 → 26.11). 그래서 거터를 우리가
// 셈하지 않는다 — SVG 가 알려 준 텍스트 시작을 그대로 쓴다. 위의 `1.5 × 크기 × 단계` 는
// 그 값이 어디서 오는지 밝히는 설명이지 우리가 계산하는 값이 아니다.
//
// 오른쪽에서 왼쪽으로 쓰는 글(아랍어·히브리어)은 아직 재지 못했다. SVG 가 주는 텍스트
// 시작이 0 으로 나와 기준을 잡을 수 없다 — 그런 레이어는 예전처럼 통째로 아웃라인으로
// 남긴다. 자리를 모르면서 그리는 것보다 낫다.

/** 한 단계 들여쓰기가 미는 거리(글자 크기 대비). 텍스트 시작 = 이것 × 단계 */
export const INDENT_STEP = 1.5
/** 글머리는 거터 한가운데 — 들여쓰기 폭의 절반이다. 크기 5~48 에서 0.7500 으로 일정했다 */
export const BULLET_INK_CENTER = INDENT_STEP / 2
/** 번호의 오른쪽 끝. 실측 0.3958~0.4063 */
export const NUMBER_INK_RIGHT = 0.4

export type ListKind = 'ORDERED' | 'UNORDERED'

/** 단계별 글머리 글리프. Figma 가 단계마다 바꾸는지는 아직 실측 전이라 하나로 둔다 */
const BULLET = '•'

/**
 * 이 자리가 문단의 첫 글자인가. 목록은 문단마다 마커가 하나씩 붙는다 —
 * 접혀 내려간 줄에는 안 붙으므로, 줄이 아니라 문단을 세야 한다.
 */
export function startsParagraph(characters: string, offset: number): boolean {
  if (offset <= 0) return true
  return characters[offset - 1] === '\n'
}

/**
 * 문단들의 목록 단계를 훑어 각 문단이 제 단계에서 몇 번째인지 센다.
 * 더 얕은 단계가 나오면 그 아래 단계는 다시 1 부터다(중첩 목록의 통례).
 * 단계가 없는(목록이 아닌) 문단은 0 을 준다.
 */
export function itemNumbers(levels: ReadonlyArray<number>): number[] {
  const counters: number[] = []
  return levels.map((level) => {
    if (level <= 0) {
      counters.length = 0
      return 0
    }
    counters.length = level
    for (let i = 0; i < level; i += 1) {
      if (counters[i] === undefined) counters[i] = 0
    }
    counters[level - 1] += 1
    return counters[level - 1]
  })
}

/** 이 항목에 그릴 글자. 번호는 `1.` 꼴이다. */
export function markerText(kind: ListKind, index: number): string {
  return kind === 'ORDERED' ? `${index}.` : BULLET
}

/**
 * 마커의 잉크가 놓여야 할 가로 자리.
 *
 * 글머리는 왼쪽 끝을, 번호는 오른쪽 끝을 준다 — 번호는 자릿수에 따라 폭이 변하므로
 * 왼쪽을 고정하면 두 자리부터 텍스트를 밀고 들어온다.
 */
export function markerInkAnchor(
  kind: ListKind,
  textX: number,
  fontSize: number
): { edge: 'center' | 'right'; x: number } {
  return kind === 'ORDERED'
    ? { edge: 'right', x: textX - NUMBER_INK_RIGHT * fontSize }
    : { edge: 'center', x: textX - BULLET_INK_CENTER * fontSize }
}

/** 오른쪽에서 왼쪽으로 쓰는 문자인가 */
function isRtlChar(code: number): boolean {
  return (
    (code >= 0x0590 && code <= 0x08ff) || // 히브리·아랍·시리아·타나·은코
    (code >= 0xfb1d && code <= 0xfdff) || // 히브리·아랍 표현형 A
    (code >= 0xfe70 && code <= 0xfeff) || // 아랍 표현형 B
    (code >= 0x10800 && code <= 0x10fff) || // 고대 문자들
    (code >= 0x1e800 && code <= 0x1efff)
  )
}

/** 왼쪽에서 오른쪽으로 쓰는 문자인가 — 라틴·한글·가나·한자·인도계·태국 등 */
function isLtrChar(code: number): boolean {
  if (code < 0x0041) return false
  if (code >= 0x0041 && code <= 0x02ff) return true // 라틴·확장
  if (code >= 0x0370 && code <= 0x058f) return true // 그리스·키릴·아르메니아
  if (code >= 0x0900 && code <= 0x1fff) return true // 인도계·태국·티베트 등
  if (code >= 0x2c00 && code <= 0xd7ff) return true // 한중일·한글
  if (code >= 0xf900 && code <= 0xfb17) return true
  if (code >= 0xff21 && code <= 0xffdc) return true
  if (code >= 0x20000 && code <= 0x3ffff) return true // 한자 확장
  return false
}

/**
 * 이 문단이 오른쪽에서 왼쪽으로 흐르는가.
 *
 * 유니코드의 규칙대로 **첫 강방향 문자**가 정한다(UAX #9). 숫자·문장부호·공백은 방향이
 * 약해서 건너뛴다. "아랍 글자가 하나라도 있으면" 으로 잡으면 한글 문서에 아랍어 단어
 * 하나 섞인 문단까지 통째로 아웃라인이 되는데, 그런 문단의 마커는 여전히 왼쪽에 있다.
 *
 * 그런 글에서는 마커가 반대쪽에 붙는데 자리를 아직 재지 못했다(SVG 가 주는 텍스트 시작이
 * 0 으로 나온다). 잘못 그리느니 그 레이어는 통째로 아웃라인으로 남긴다.
 */
export function isRtlParagraph(text: string): boolean {
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (isRtlChar(code)) return true
    if (isLtrChar(code)) return false
  }
  return false
}

/** 목록 문단 중 하나라도 오른쪽에서 왼쪽으로 흐르면 그 레이어는 손대지 않는다 */
export function hasRtlListParagraph(
  characters: string,
  segments: ReadonlyArray<{ start: number; end: number; listType: string }>
): boolean {
  let at = 0
  for (const line of characters.split('\n')) {
    const listed = segments.some(
      (segment) => segment.listType !== 'NONE' && at >= segment.start && at < segment.end
    )
    if (listed && isRtlParagraph(line)) return true
    at += line.length + 1
  }
  return false
}

/** 어느 run 앞에 무엇을 어디에 그릴지 */
export type MarkerPlan = {
  /** 마커가 붙는 run 의 인덱스 */
  runIndex: number
  text: string
  /** 잉크의 어디를 x 에 맞출지 — 글머리는 중심, 번호는 오른쪽 끝 */
  edge: 'center' | 'right'
  /** 그 자리가 놓여야 할 x (노드 상자 기준, pt) */
  x: number
  fontSize: number
}

type MarkerRun = { text: string; x: number; y: number; fontSize: number }

/**
 * 목록 마커를 어디에 그릴지 정한다.
 *
 * run 은 SVG 에서 나온 **줄**이고 마커는 **문단**마다 하나다 — 접혀 내려간 줄에는 안 붙는다.
 * 그래서 run 의 글자가 원문 어디서 시작하는지 찾아(textLinks 의 locateRun, 하이퍼링크가 쓰던 것)
 * 그 자리가 문단 머리인지 본다. 번호는 원문 순서대로 세므로 run 순서가 곧 문단 순서다.
 */
export function planMarkers(
  characters: string,
  segments: ReadonlyArray<{ start: number; end: number; listType: string; indentation: number }>,
  runs: ReadonlyArray<MarkerRun>,
  locate: (
    characters: string,
    cursor: number,
    runText: string
  ) => { start: number; end: number } | null
): MarkerPlan[] {
  // Figma 는 런을 읽는 순서가 아니라 **스타일별로 묶어** 내보낸다. 한 문단 안에 크기가
  // 섞이면 뒤쪽 글자가 먼저 나오는 일이 생긴다(실측: ["bravo charlie 1", "…2", "Alpha "]).
  // 원문과 맞추는 커서는 앞으로만 가므로, 그대로 훑으면 첫 문단을 놓치고 마커가 엉뚱한
  // 줄에 붙는다. 맞추기 전에 읽는 순서(줄 → 왼쪽)로 세운다. 그리는 순서는 그대로다.
  const inReadingOrder = runs
    .map((run, runIndex) => ({ run, runIndex }))
    .sort((a, b) => a.run.y - b.run.y || a.run.x - b.run.x)

  const heads: Array<{ runIndex: number; at: number; run: MarkerRun }> = []
  let cursor = 0
  for (const { run, runIndex } of inReadingOrder) {
    if (run.text === '') continue
    const located = locate(characters, cursor, run.text)
    if (located === null) continue
    cursor = located.end
    if (startsParagraph(characters, located.start)) {
      heads.push({ runIndex, at: located.start, run })
    }
  }

  const segmentAt = (at: number): { listType: string; indentation: number } | undefined =>
    segments.find((segment) => at >= segment.start && at < segment.end)

  const levels = heads.map((head) => {
    const segment = segmentAt(head.at)
    if (segment === undefined || segment.listType === 'NONE') return 0
    return Math.max(1, segment.indentation)
  })
  const numbers = itemNumbers(levels)

  const plans: MarkerPlan[] = []
  heads.forEach((head, index) => {
    if (levels[index] === 0) return
    const segment = segmentAt(head.at)
    if (segment === undefined) return
    const kind: ListKind = segment.listType === 'ORDERED' ? 'ORDERED' : 'UNORDERED'
    const anchor = markerInkAnchor(kind, head.run.x, head.run.fontSize)
    plans.push({
      runIndex: head.runIndex,
      text: markerText(kind, numbers[index]),
      edge: anchor.edge,
      x: anchor.x,
      fontSize: head.run.fontSize
    })
  })
  return plans
}
