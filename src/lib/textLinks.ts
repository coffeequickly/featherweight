// 텍스트 run 이 원문의 어느 글자에 해당하는지 찾아, 그 구간에 걸린 URL 링크를 돌려준다. Figma·DOM 의존 금지.
//
// 텍스트를 우리가 다시 그리면 Figma 가 넣던 링크 주석이 사라진다. 세그먼트에는 글자 범위별
// 하이퍼링크가 있고, run 은 SVG 에서 나온 글자 덩어리라 범위가 없다 — 원문 안에서 run 의
// 글자를 순서대로 찾아 범위를 맞춘다. 대소문자 변환(textCase) 등으로 못 찾으면 링크를 안 넣는다.
// 없는 게 엉뚱한 자리에 있는 것보다 낫다.

import { TextSegment } from './types'

/** run 안의 글자 범위(run 기준 인덱스)와 URL */
export type LinkSpan = { start: number; end: number; url: string }

export function linkSpansForRun(
  characters: string,
  cursor: number,
  runText: string,
  segments: readonly TextSegment[]
): { spans: LinkSpan[]; next: number } {
  if (runText === '') return { spans: [], next: cursor }
  const at = characters.indexOf(runText, cursor)
  if (at < 0) return { spans: [], next: cursor }
  const runEnd = at + runText.length

  const spans: LinkSpan[] = []
  for (const segment of segments) {
    const url = segment.hyperlink?.type === 'URL' ? segment.hyperlink.value : ''
    if (url === '') continue
    const start = Math.max(segment.start, at)
    const end = Math.min(segment.end, runEnd)
    if (end <= start) continue
    const last = spans[spans.length - 1]
    // 같은 URL 이 이어지면 한 구간으로 — 세그먼트가 굵기 때문에 갈라져 있을 수 있다
    if (last !== undefined && last.url === url && last.end === start - at) last.end = end - at
    else spans.push({ start: start - at, end: end - at, url })
  }
  return { spans, next: runEnd }
}
