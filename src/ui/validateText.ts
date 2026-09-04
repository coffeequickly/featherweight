// fill 을 지워도 되는 노드인지 판정한다. 여기서 걸러진 노드는 아웃라인이 그대로 남는다.
//
// 판정을 SVG 의 실제 run 으로 한다. `characters` 로 하면 textCase 적용이나
// 줄바꿈 처리 차이 때문에 그리는 시점에 커버리지가 어긋날 수 있다.

import { styleForRun } from '../lib/runStyle'
import { codePointsOf, parseSvgText } from '../lib/svgText'
import { Reason, StoredFont, TextRunSource } from '../lib/types'
import { checkCoverage } from './fontSource'

export type ValidationOutcome = {
  eligible: string[]
  rejected: Array<{ nodeId: string; reason: Reason }>
}

const parseXml = (svg: string): Document => new DOMParser().parseFromString(svg, 'image/svg+xml')

export async function validateSources(
  sources: readonly TextRunSource[],
  available: readonly StoredFont[],
  options: { glyphFallback: boolean } = { glyphFallback: true }
): Promise<ValidationOutcome> {
  const outcome: ValidationOutcome = { eligible: [], rejected: [] }

  for (const source of sources) {
    const runs = parseSvgText(source.svg, parseXml)
    if (runs.length === 0) {
      outcome.rejected.push({ nodeId: source.nodeId, reason: { code: 'reject.svgEmpty' } })
      continue
    }

    const families = new Map<string, { family: string; style: string; codePoints: number[] }>()
    for (const run of runs) {
      const style = styleForRun(source, run.fontWeight, run.italic, run.fontFamily)
      const key = `${style.family} ${style.style}`
      const found = families.get(key)
      const points = codePointsOf([run])
      if (found === undefined) {
        families.set(key, { ...style, codePoints: points })
      } else {
        found.codePoints.push(...points)
      }
    }

    let reason: Reason | null = null
    for (const entry of families.values()) {
      const result = await checkCoverage(
        { family: entry.family, style: entry.style },
        [...new Set(entry.codePoints)],
        available,
        options
      )
      if (!result.ok) {
        reason = result.reason
        break
      }
    }

    if (reason === null) outcome.eligible.push(source.nodeId)
    else outcome.rejected.push({ nodeId: source.nodeId, reason })
  }

  return outcome
}
