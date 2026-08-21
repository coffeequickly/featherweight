// 스파이크 S3 — Figma 가 실제로 내보낸 SVG_STRING(svgOutlineText:false) 구조.
//
// 2026-08-20 에 실제 문서에서 `svg:dump` 로 받은 실물 구조다.
// **속성·엔티티·좌표 형식은 손대지 않았고**, 문구만 일반 텍스트로 바꿨다 (2026-08-21) —
// 파서가 걸려 넘어진 게 내용이 아니라 구조였기 때문이다.
//
// 확인된 사실
//   - `<text>` 가 fill / font-family / font-size / font-weight / letter-spacing 을 갖는다
//   - 줄마다 `<tspan x= y=>` 하나. y 는 baseline, 좌표는 노드 박스 좌상단 기준
//   - `xml:space="preserve"` 때문에 tspan 안에 줄바꿈 문자가 남는다: `&#10;`(LF), `&#x2028;`
//   - 검정은 `fill="black"` (hex 아님)
//   - font-weight 는 `bold` 같은 키워드로도, `800` 같은 숫자로도 나온다
//   - font-weight 속성이 아예 없으면 Regular

/** 한 줄, 자간 있음 */
export const SINGLE_LINE = `<svg width="14" height="10" viewBox="0 0 14 10" fill="none" xmlns="http://www.w3.org/2000/svg">
<text fill="black" style="white-space: pre" xml:space="preserve" font-family="Pretendard Variable" font-size="6" letter-spacing="-0.01em"><tspan x="0.121718" y="7.13281">1  /  5</tspan></text>
</svg>
`

/** font-weight="bold" 키워드 */
export const BOLD_HEADING = `<svg width="244" height="11" viewBox="0 0 244 11" fill="none" xmlns="http://www.w3.org/2000/svg">
<text fill="black" style="white-space: pre" xml:space="preserve" font-family="Pretendard Variable" font-size="9" font-weight="bold" letter-spacing="-0.015em"><tspan x="0" y="9.69922">&#xad75;&#xc740; &#xc81c;&#xbaa9; &#xd655;&#xc778;</tspan></text>
</svg>
`

/** font-weight="800" 숫자 */
export const EXTRABOLD_HEADING = `<svg width="535" height="11" viewBox="0 0 535 11" fill="none" xmlns="http://www.w3.org/2000/svg">
<text fill="black" style="white-space: pre" xml:space="preserve" font-family="Pretendard Variable" font-size="11" font-weight="800" letter-spacing="-0.015em"><tspan x="0" y="11.4102">[ &#xc544;&#xc8fc; &#xad75;&#xac8c; AB ]</tspan></text>
</svg>
`

/**
 * 여러 줄 + 줄바꿈 찌꺼기. 이게 첫 Phase 2 내보내기를 망가뜨린 구조다.
 *   1줄 끝: U+2028 (문단 안 줄바꿈)
 *   2줄 끝: LF
 *   4줄: LF 하나뿐인 빈 줄
 */
export const MULTI_LINE_WITH_BREAKS = `<svg width="535" height="60" viewBox="0 0 535 60" fill="none" xmlns="http://www.w3.org/2000/svg">
<text fill="black" style="white-space: pre" xml:space="preserve" font-family="Pretendard Variable" font-size="7" letter-spacing="-0.015em"><tspan x="0" y="7.48828">&#xccab;&#xc9f8; &#xc904; &#xb0b4;&#xc6a9; &#x2028;</tspan><tspan x="0" y="17.4883">2026&#xb144; &#xb458;&#xc9f8; &#xc904;&#10;</tspan><tspan x="0" y="27.4883">&#xc14b;&#xc9f8; &#xc904;&#10;</tspan><tspan x="0" y="37.4883">&#10;</tspan><tspan x="0" y="47.4883">4&#xbc88; &#xb9c8;&#xc9c0;&#xb9c9; &#xc904; AB</tspan></text>
</svg>
`
