// 폭이 0이고 글리프가 필요 없는 서식 문자들. Figma·DOM 의존 금지.
//
// 한글 줄바꿈을 막으려고 글자 사이마다 넣는 묶음문자(U+2060 WORD JOINER) 때문에 이력서
// 한 장의 줄 170개가 "폰트에 없는 글자" 로 통째로 아웃라인 처리됐다(실측). 폰트에 없어도
// 그리는 데 지장이 없는 문자들이라 커버리지 검사에서 빼고, 그릴 때도 뺀다 — 있으나 없으나
// 보이는 결과가 같고, 추출 텍스트는 오히려 깨끗해진다.

export function isIgnorable(codePoint: number): boolean {
  return (
    codePoint === 0x00ad ||
    codePoint === 0x034f ||
    codePoint === 0x180e ||
    (codePoint >= 0x200b && codePoint <= 0x200f) ||
    (codePoint >= 0x2060 && codePoint <= 0x2064) ||
    codePoint === 0xfeff ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f)
  )
}

/** 소프트 하이픈 · 결합 문자 접합자 · 몽골 모음 구분자 · 폭 0 공백류 · 묶음문자류 · BOM · 변형 선택자 */
/**
 * 글자는 빼고, 그 자리에 있던 무시 문자의 수는 남긴다.
 *
 * Figma 는 자간을 글자마다 붙이는데 묶음문자도 글자로 센다 — "스⁠타⁠트⁠업⁠과" 는 자간이 9번
 * 붙는다(글자 5 + 묶음문자 4). 우리가 묶음문자를 빼고 5번만 붙이면 줄이 오른쪽으로 밀린다
 * (실측: 한 줄 끝에서 3pt). gaps[i] 는 글자 i 앞에 있던 무시 문자 수, 마지막 칸은 끝에 붙은 수.
 */
export function splitIgnorable(raw: string): { text: string; gaps: number[] } {
  let text = ''
  const gaps: number[] = []
  let pending = 0
  for (const char of raw) {
    if (isIgnorable(char.codePointAt(0) ?? 0)) {
      pending += 1
      continue
    }
    gaps.push(pending)
    pending = 0
    text += char
  }
  gaps.push(pending)
  return { text, gaps }
}

export function stripIgnorable(text: string): string {
  let out = ''
  for (const char of text) {
    if (!isIgnorable(char.codePointAt(0) ?? 0)) out += char
  }
  return out
}
