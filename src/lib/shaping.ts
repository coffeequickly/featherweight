// 글자 모양이 앞뒤 문맥으로 바뀌는 문자 체계인가. Figma·DOM 의존 금지.
//
// 아랍·히브리·데바나가리·태국어 같은 문자는 낱글자로 잘라 그리면 연결형이 깨진다. 이런
// run 은 글자마다 커닝을 넣지 않고 문자열 통째로 배치한다(fontkit 이 한 번에 shaping 한다).
// 라틴·한글·가나·한자는 문맥 변형이 없어 글자 단위로 그려도 같다.

const COMPLEX: ReadonlyArray<readonly [number, number]> = [
  [0x0590, 0x08ff], // 히브리 · 아랍 · 시리아 · 타나 · NKo · 사마리아
  [0x0900, 0x0dff], // 데바나가리 ~ 싱할라 (인도계)
  [0x0e00, 0x0eff], // 태국 · 라오
  [0x0f00, 0x0fff], // 티베트
  [0x1000, 0x109f], // 미얀마
  [0x1780, 0x17ff], // 크메르
  [0x1800, 0x18af], // 몽골
  [0xfb50, 0xfdff], // 아랍 표현형 A
  [0xfe70, 0xfeff] // 아랍 표현형 B
]

export function needsShaping(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    for (const [from, to] of COMPLEX) if (code >= from && code <= to) return true
  }
  return false
}
