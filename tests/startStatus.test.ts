// 시작 탭이 무엇을 문제로 세는가.
//
// 화면은 문제만 카드로 보여주므로, 여기서 잘못 세면 사용자는 멀쩡한 문서를 고치려 들거나
// 망가진 채로 내보낸다. 특히 "폰트가 원인인 아웃라인" 과 "선·효과 때문인 아웃라인" 을
// 한 장으로 합치면 안 된다 — 고치는 곳이 다르다.

import { describe, expect, it } from 'vitest'

import { startIssues } from '../src/lib/startStatus'
import { DEFAULT_SETTINGS, FontUsage, Preflight, StoredFont, TextReject } from '../src/lib/types'

function usage(family: string, style: string, nodeCount = 1): FontUsage {
  const nodeIds = Array.from({ length: nodeCount }, (_, i) => `${family}-${style}-${i}`)
  return { family, style, weight: 400, italic: false, nodeCount, charCount: 10, nodeIds }
}

function stored(family: string, style: string): StoredFont {
  return {
    family,
    style,
    weight: 400,
    italic: false,
    byteLength: 1000,
    numGlyphs: 10,
    codePoints: 10,
    fileName: `${family}.ttf`
  }
}

function reject(nodeId: string, code: TextReject['reason']['code']): TextReject {
  return { nodeId, name: nodeId, reason: { code, params: {} } }
}

function doc(textRejects: TextReject[] = []): Preflight {
  return { frames: [], imageEdges: {}, textRejects }
}

/** 카탈로그에 있는 서체 — 저장본이 없어도 내보낼 때 받아온다 */
const CATALOG = usage('Pretendard', 'Regular', 12)
/** 카탈로그에 없는 서체 — 파일을 넣어야 한다 */
const NEXA = usage('Nexa', 'Heavy', 3)

describe('startIssues', () => {
  it('문제가 없으면 빈 목록', () => {
    expect(startIssues(DEFAULT_SETTINGS, [CATALOG], [], doc())).toEqual([])
  })

  it('아직 읽는 중이면(preflight null) 아무것도 단정하지 않는다', () => {
    expect(startIssues(DEFAULT_SETTINGS, [NEXA], [], null)).toEqual([])
  })

  it('전부 아웃라인이면 그것 하나만 말한다 — 폰트 사유는 무의미해진다', () => {
    const settings = { ...DEFAULT_SETTINGS, embedText: false }
    const issues = startIssues(settings, [NEXA], [], doc([reject('a', 'reject.stroked')]))
    expect(issues).toEqual([{ kind: 'textOff' }])
  })

  it('못 구한 폰트를 센다 — 텍스트 수와 자동으로 받아올 수도 함께', () => {
    const issues = startIssues(DEFAULT_SETTINGS, [CATALOG, NEXA], [], doc())
    expect(issues).toEqual([
      { kind: 'fontsMissing', fonts: 1, texts: 3, first: 'Nexa Heavy', rest: 0, auto: 1 }
    ])
  })

  it('넣은 파일의 굵기가 자리와 다르면 따로 센다', () => {
    // 자리는 Nexa Heavy(900) 인데 넣은 파일은 Regular(400) 였다
    const file: StoredFont = {
      ...stored('Nexa', 'Heavy'),
      weight: 900,
      facts: { tables: ['glyf'], axes: [], weightClass: 400, italic: false }
    }
    const issues = startIssues(DEFAULT_SETTINGS, [NEXA], [file], doc())
    expect(issues.map((issue) => issue.kind)).toEqual(['fontFiles'])
    expect(issues[0]).toMatchObject({ count: 1, first: 'Nexa Heavy', mismatch: true })
  })

  it('폰트가 원인인 아웃라인은 구조 사유로 다시 세지 않는다', () => {
    // Nexa Heavy 를 쓰는 노드 셋이 폰트 없음으로 아웃라인 — 구조 카드는 나오지 않는다
    const issues = startIssues(DEFAULT_SETTINGS, [NEXA], [], doc())
    expect(issues.map((issue) => issue.kind)).toEqual(['fontsMissing'])
  })

  it('선·효과 때문인 아웃라인은 폰트와 별도 카드다 — 고치는 곳이 다르다', () => {
    const issues = startIssues(
      DEFAULT_SETTINGS,
      [CATALOG, NEXA],
      [],
      doc([reject('x', 'reject.stroked'), reject('y', 'reject.effects')])
    )
    expect(issues.map((issue) => issue.kind)).toEqual(['fontsMissing', 'structural'])
    const structural = issues.find((issue) => issue.kind === 'structural')
    expect(structural).toMatchObject({ count: 2 })
  })

  it('같은 사유는 묶어서 많은 것부터', () => {
    const issues = startIssues(
      DEFAULT_SETTINGS,
      [CATALOG],
      [],
      doc([
        reject('a', 'reject.stroked'),
        reject('b', 'reject.effects'),
        reject('c', 'reject.stroked')
      ])
    )
    const structural = issues[0]
    expect(structural.kind).toBe('structural')
    if (structural.kind !== 'structural') return
    expect(structural.reasons.map((row) => [row.reason.code, row.count])).toEqual([
      ['reject.stroked', 2],
      ['reject.effects', 1]
    ])
  })
})
