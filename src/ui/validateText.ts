// fill 을 지워도 되는 노드인지 판정한다. 여기서 걸러진 노드는 아웃라인이 그대로 남는다.
//
// 판정을 SVG 의 실제 run 으로 한다. `characters` 로 하면 textCase 적용이나
// 줄바꿈 처리 차이 때문에 그리는 시점에 커버리지가 어긋날 수 있다.

import { styleForRun } from '../lib/runStyle'
import { codePointsOf, parseSvgText, ParseXml } from '../lib/svgText'
import { inkWidthOf, widthMismatch } from '../lib/textMetrics'
import { Reason, StoredFont, TextRunSource } from '../lib/types'
import { checkCoverage, missingCodePoints, probeFont } from './fontSource'

export type ValidationOutcome = {
  eligible: string[]
  rejected: Array<{ nodeId: string; reason: Reason }>
}

const domParse = (svg: string): Document => new DOMParser().parseFromString(svg, 'image/svg+xml')

/**
 * 폰트 판 대조. 한 줄·한 run 짜리 노드마다 Figma 가 그린 잉크 폭과 우리 폰트로 놓은 잉크 폭을
 * 견주고, 폰트마다 한 번 어긋나면 그 폰트를 "다른 판" 으로 기록한다 — 그 폰트로 그리면 줄이
 * 밀리므로 그것을 쓰는 노드는 전부 아웃라인으로 남긴다 (lib/textMetrics 참고).
 * 폰트마다 처음 근거가 되는 한 줄로만 판정한다.
 */
async function findDifferingFonts(
  sources: readonly TextRunSource[],
  parseXml: ParseXml
): Promise<Map<string, { family: string; style: string; percent: number }>> {
  const differing = new Map<string, { family: string; style: string; percent: number }>()
  const checked = new Set<string>()

  for (const source of sources) {
    if (source.inkWidth === undefined) continue
    const runs = parseSvgText(source.svg, parseXml)
    if (runs.length !== 1) continue // 한 줄, 한 run 만 — 여러 run 의 폭은 배치가 섞여 근거가 약하다
    const run = runs[0]
    const style = styleForRun(source, run.fontWeight, run.italic, run.fontFamily)
    const key = `${style.family} ${style.style}`
    if (checked.has(key)) continue

    const probe = await probeFont({ family: style.family, style: style.style })
    if (probe === undefined) continue
    // 주 폰트에 없는 글자가 섞이면 대체 폰트가 그리므로 폭의 근거가 못 된다
    if (missingCodePoints(probe, codePointsOf([run])).length > 0) continue

    const layout = probe.layout(run.text, { ...style.features })
    const ours = inkWidthOf(
      layout,
      probe.unitsPerEm,
      run.fontSize,
      run.letterSpacing,
      run.gaps ?? []
    )
    if (ours === null) continue
    checked.add(key)
    const percent = widthMismatch(source.inkWidth, ours)
    if (percent !== null) differing.set(key, { family: style.family, style: style.style, percent })
  }

  return differing
}

export async function validateSources(
  sources: readonly TextRunSource[],
  available: readonly StoredFont[],
  options: { glyphFallback: boolean } = { glyphFallback: true },
  parseXml: ParseXml = domParse
): Promise<ValidationOutcome> {
  const outcome: ValidationOutcome = { eligible: [], rejected: [] }
  const differing = await findDifferingFonts(sources, parseXml)

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
    for (const [key, entry] of families) {
      const differs = differing.get(key)
      if (differs !== undefined) {
        reason = {
          code: 'font.metricsDiffer',
          params: { family: differs.family, style: differs.style, percent: differs.percent }
        }
        break
      }
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
