// 텍스트 run 이 원문의 어느 글자에 해당하는지 찾아, 그 구간에 걸린 URL 링크를 돌려준다. Figma·DOM 의존 금지.
//
// 텍스트를 우리가 다시 그리면 Figma 가 넣던 링크 주석이 사라진다. 세그먼트에는 글자 범위별
// 하이퍼링크가 있고, run 은 SVG 에서 나온 글자 덩어리라 범위가 없다 — 원문 안에서 run 의
// 글자를 순서대로 찾아 범위를 맞춘다. 대소문자 변환(textCase) 등으로 못 찾으면 링크를 안 넣는다.
// 없는 게 엉뚱한 자리에 있는 것보다 낫다.
//
// 원문에는 묶음문자 같은 폭 0 서식 문자가 섞여 있을 수 있고 run 에서는 그것을 뺀다 —
// 맞출 때 원문 쪽의 그 문자는 건너뛰고, run 기준 인덱스는 그것을 뺀 수로 센다.

import { isIgnorable } from './ignorable'
import { TextSegment } from './types'

/** run 안의 글자 범위(run 기준 인덱스)와 URL */
export type LinkSpan = { start: number; end: number; url: string }

/** 원문에서 run 의 글자가 시작·끝나는 자리(원문 인덱스). 원문의 무시 문자는 건너뛴다. */
function locate(
  characters: string,
  cursor: number,
  runText: string
): { start: number; end: number } | null {
  for (let start = cursor; start < characters.length; start += 1) {
    let i = start
    let j = 0
    while (j < runText.length) {
      if (i >= characters.length) return null
      const code = characters.codePointAt(i) ?? 0
      if (isIgnorable(code)) {
        i += 1
        continue
      }
      if (characters[i] !== runText[j]) break
      i += 1
      j += 1
    }
    if (j === runText.length) return { start, end: i }
  }
  return null
}

export function linkSpansForRun(
  characters: string,
  cursor: number,
  runText: string,
  segments: readonly TextSegment[]
): { spans: LinkSpan[]; next: number } {
  if (runText === '') return { spans: [], next: cursor }
  const located = locate(characters, cursor, runText)
  if (located === null) return { spans: [], next: cursor }
  const { start: at, end: runEnd } = located

  // 원문 인덱스 → run 기준 인덱스: 그 사이의 무시 문자는 run 에 없다
  const toRun = (index: number): number => {
    let count = 0
    for (let i = at; i < index; i += 1) if (!isIgnorable(characters.codePointAt(i) ?? 0)) count += 1
    return count
  }

  const spans: LinkSpan[] = []
  for (const segment of segments) {
    const url = segment.hyperlink?.type === 'URL' ? segment.hyperlink.value : ''
    if (url === '') continue
    const start = toRun(Math.max(segment.start, at))
    const end = toRun(Math.min(segment.end, runEnd))
    if (end <= start) continue
    const last = spans[spans.length - 1]
    // 같은 URL 이 이어지면 한 구간으로 — 세그먼트가 굵기 때문에 갈라져 있을 수 있다
    if (last !== undefined && last.url === url && last.end === start) last.end = end
    else spans.push({ start, end, url })
  }
  return { spans, next: runEnd }
}
