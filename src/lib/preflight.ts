// 내보내기 전 체크리스트의 계산. Figma·DOM 의존 금지.
//
// 메인이 보낸 사실(Preflight)과 지금 설정을 합쳐 "무슨 일이 일어날지" 를 센다.
// 실제 export 와 같은 규칙(skipFloor · planImageTargets · needsDownscale)을 쓴다 —
// 규칙이 갈라지면 예고와 결과가 어긋나고, 그 순간 예고는 믿을 수 없는 것이 된다.

import { missingFonts } from './fontStatus'
import { needsDownscale, planImageTargets, skipFloor } from './imageTarget'
import { FontUsage, FrameItem, Preflight, Reason, Settings, StoredFont, TextReject } from './types'

export type ImageForecast = {
  /** 서로 다른 이미지 수 — 같은 사진을 열 군데 써도 하나 */
  total: number
  /** 픽셀을 줄일 이미지 수 */
  shrink: number
  /** 하한(minEdge) 이하라 어떤 문서에서도 손대지 않는 것 */
  tiny: number
  /** 원본 크기를 아직 모르는 것 — 읽는 중이거나 못 읽었다 */
  unsized: number
}

/**
 * 어떤 이미지가 줄어들지 미리 센다.
 *
 * 바이트는 모른다 — 선택 시점에 원본을 전부 읽는 건 너무 비싸다. 그래서 이미 가벼운
 * 파일(KEEP_BYTES_FLOOR)은 여기서 "줄임" 으로 셌다가 실제로는 통과할 수 있다.
 * 예고는 "예정" 으로 말하고, 결과 카드가 실측을 말한다.
 */
export function forecastImages(preflight: Preflight, settings: Settings): ImageForecast {
  const all = new Set<string>()
  const shrink = new Set<string>()

  for (const frame of preflight.frames) {
    for (const usage of frame.images) all.add(usage.imageHash)

    const floor = skipFloor(settings, frame.longEdge)
    for (const plan of planImageTargets(frame.images, settings)) {
      const edge = preflight.imageEdges[plan.imageHash]
      if (edge === undefined) continue
      if (edge > floor && needsDownscale(edge, plan.targetLongEdge)) shrink.add(plan.imageHash)
    }
  }

  let tiny = 0
  let unsized = 0
  for (const hash of all) {
    const edge = preflight.imageEdges[hash]
    if (edge === undefined) unsized += 1
    else if (edge <= settings.minEdge) tiny += 1
  }

  return { total: all.size, shrink: shrink.size, tiny, unsized }
}

/**
 * 아웃라인으로 나갈 텍스트 전부 — 구조 때문에(선·효과·그라데이션) 못 넣는 것과
 * 폰트가 없어 못 넣는 것을 한 목록으로. 텍스트 줄 하나가 결말을 다 말해야 폰트 줄과
 * 같은 경고를 두 번 읽지 않는다.
 *
 * 한 노드에 두 사유가 겹치면 구조 사유가 남는다 — 폰트를 넣어도 그 노드는 안 풀린다.
 */
export function outlinedTexts(
  structural: readonly TextReject[],
  fonts: readonly FontUsage[],
  stored: readonly StoredFont[]
): TextReject[] {
  const byNode = new Map<string, TextReject>()
  for (const reject of structural) byNode.set(reject.nodeId, reject)

  for (const font of missingFonts(fonts, stored)) {
    for (const nodeId of font.nodeIds) {
      if (byNode.has(nodeId)) continue
      byNode.set(nodeId, {
        nodeId,
        name: '',
        reason: { code: 'reject.missingFont', params: { family: font.family, style: font.style } }
      })
    }
  }

  return [...byNode.values()]
}

/** 전부 같은 크기면 그 크기, 아니면 null — "프레임 5장 · 595×842" 의 뒷부분 */
export function uniformSize(items: readonly FrameItem[]): { width: number; height: number } | null {
  const [first] = items
  if (first === undefined) return null
  const same = items.every((item) => item.width === first.width && item.height === first.height)
  return same ? { width: first.width, height: first.height } : null
}

/** 사유별로 묶고 많은 것부터. 노드 id 를 같이 들고 있어야 클릭해서 찾아갈 수 있다. */
/**
 * "폰트에 없는 글자" 는 노드마다 글자가 달라 같은 사유가 여러 줄로 갈라진다 — 글자를
 * 모아 한 사유로 바꿔 둔다. 각 노드가 글자를 다 보여 줬으면(견본 ≥ 개수) 합친 글자 수가
 * 정확하고, 잘린 노드가 있으면 개수를 더해 위로 어림한다.
 */
export function unifyMissingGlyphs<T extends { reason: Reason }>(items: readonly T[]): T[] {
  const chars = new Set<string>()
  let exact = true
  let summed = 0
  for (const item of items) {
    if (item.reason.code !== 'font.missingGlyphs') continue
    const sample = String(item.reason.params?.sample ?? '')
    const count = Number(item.reason.params?.count ?? 0)
    for (const char of sample) chars.add(char)
    if (count > [...sample].length) exact = false
    summed += count
  }
  if (chars.size === 0) return [...items]

  const merged: Reason = {
    code: 'font.missingGlyphs',
    params: { count: exact ? chars.size : summed, sample: [...chars].slice(0, 6).join('') }
  }
  return items.map((item) =>
    item.reason.code === 'font.missingGlyphs' ? { ...item, reason: merged } : item
  )
}

export function groupReasons(
  all: readonly { reason: string; id: string }[]
): Array<{ reason: string; count: number; ids: string[] }> {
  const groups = new Map<string, string[]>()
  for (const { reason, id } of all) {
    const ids = groups.get(reason)
    if (ids === undefined) groups.set(reason, [id])
    else ids.push(id)
  }
  return [...groups.entries()]
    .map(([reason, ids]) => ({ reason, count: ids.length, ids }))
    .sort((a, b) => b.count - a.count)
}
