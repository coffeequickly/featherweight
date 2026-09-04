// 글자 사이 커닝을 PDF TJ 배열의 보정값으로. Figma·DOM 의존 금지.
//
// Figma 는 라틴 텍스트에 짝 커닝(GPOS kern)을 건다. pdf-lib 의 drawText 는 글리프를 폭(/W)대로
// 나란히 놓기만 해서 "Forward" 가 Figma 보다 4.4% 넓게 나왔다(SUIT ExtraBold 실측). 한글은
// 커닝이 없어 그대로였다. fontkit 의 layout 이 준 실제 전진폭과 글리프 폭의 차를 TJ 로 넣는다.

/**
 * 글리프 i 뒤에 넣을 TJ 숫자(텍스트 공간 1/1000 단위, 양수면 그만큼 당긴다).
 * advances 는 글리프 폭(/W 와 같은 값), xAdvances 는 커닝이 반영된 실제 전진폭, 둘 다 폰트 단위.
 * 마지막 글리프 뒤에는 넣지 않는다(다음 글자가 없다).
 */
export function kernAdjustments(
  advances: readonly number[],
  xAdvances: readonly number[],
  unitsPerEm: number
): number[] {
  const out: number[] = []
  for (let i = 0; i < advances.length - 1; i += 1) {
    const diff = advances[i] - xAdvances[i]
    out.push(Math.round((diff * 1000) / unitsPerEm))
  }
  return out
}
