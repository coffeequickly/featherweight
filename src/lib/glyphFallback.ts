// 주 폰트에 없는 글자만 다른 폰트로 그린다. Figma·DOM 의존 금지.
//
// 한글 정적 폰트에는 em dash(—)·en dash(–)·얇은 공백(U+2009)·불릿(•) 같은 글자가 없는 경우가
// 흔하다(SUIT 실측). 그 글자 하나 때문에 노드째 아웃라인으로 떨어뜨리면 이력서 본문 61개가
// 통째로 벡터가 됐다. Figma 도 화면에서 이런 글자를 다른 폰트로 대체해 그린다 — 우리도
// 빠진 글자만 대체하고 나머지는 원래 폰트 그대로 둔다.
//
// 대체 폰트 순서: Inter → Pretendard → Pretendard JP. Inter 는 Figma 의 기본 폰트라 누구나
// 알고, 대시·기호·라틴 확장·키릴·그리스를 덮는다(서양 사용자는 여기서 끝난다). Pretendard 의
// 라틴은 Inter 에서 온 것이라 모양이 같고 한글·가나가 더 있다. JP 는 한자까지. 빠진 글자를
// 전부 덮는 첫 폰트를 쓴다. 타이·아랍·이모지는 어느 것에도 없어 그 노드는 아웃라인이다.

import { catalogEntry } from './fontCatalog'
import { FontRef } from './types'

export const FALLBACK_CHAIN: readonly string[] = ['Inter', 'Pretendard Variable', 'Pretendard JP']

/** 대체 후보들 — 원래 굵기가 카탈로그에 있으면 그 굵기, 아니면 Regular */
export function fallbackFontsFor(style: string): FontRef[] {
  return FALLBACK_CHAIN.map((family) => {
    const same = { family, style }
    return catalogEntry(same) !== undefined ? same : { family, style: 'Regular' }
  })
}

export type RunChunk = { text: string; fallback: boolean }

/** 글자를 주 폰트 몫과 대체 폰트 몫으로 이어 붙인 덩어리들로 — 순서는 그대로 */
export function splitByCoverage(text: string, missing: ReadonlySet<number>): RunChunk[] {
  const chunks: RunChunk[] = []
  for (const char of text) {
    const fallback = missing.has(char.codePointAt(0) ?? 0)
    const last = chunks[chunks.length - 1]
    if (last !== undefined && last.fallback === fallback) last.text += char
    else chunks.push({ text: char, fallback })
  }
  return chunks
}
