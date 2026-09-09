// 내보내기 전 체크리스트의 계산. Figma·DOM 의존 금지.
//
// 메인이 보낸 사실(Preflight)과 지금 설정을 합쳐 "무슨 일이 일어날지" 를 센다.
// 실제 export 와 같은 규칙(shouldShrink · planImageTargets)을 쓴다 —
// 규칙이 갈라지면 예고와 결과가 어긋나고, 그 순간 예고는 믿을 수 없는 것이 된다.

import { missingFonts } from './fontStatus'
import { MIN_TARGET_LONG_EDGE, planImageTargets, shouldShrink } from './imageTarget'
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

    for (const plan of planImageTargets(frame.images, settings, preflight.imageSizes)) {
      const edge = preflight.imageEdges[plan.imageHash]
      if (edge === undefined) continue
      if (shouldShrink(edge, plan.targetLongEdge, settings.minEdge)) shrink.add(plan.imageHash)
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

export type ImageRow = {
  imageHash: string
  /** 이 이미지를 가장 크게 쓰는 레이어의 이름 — 목록에서 어느 그림인지 가리키는 단서 */
  name: string
  /** 원본 긴 변(px). 아직 못 읽었으면 null */
  original: number | null
  /** 지금 설정으로 남길 긴 변(px) */
  target: number
  /** 손대지 않고 그대로 나가는가 */
  kept: boolean
  /**
   * 배율이 아니라 한 장 상한(maxEdge)이 목표를 정했는가.
   * 이때는 고른 배율이 그대로 적용되지 않는다 — 화면이 그 사실을 말해야 한다.
   */
  capped: boolean
  /**
   * 프레임 클립 안에 남는 넓이의 비(0~1). 1 이면 온전히 보인다.
   * 이보다 작으면 그만큼의 픽셀이 화면에 나오지 않고도 파일에 실린다.
   */
  visible: number
}

/**
 * 이미지 탭의 목록 — 어떤 그림이 몇 픽셀에서 몇 픽셀이 되는지.
 *
 * 설정이 무엇을 하는지는 그림(상한 비교표)보다 이 목록이 정확하게 말한다. 배율을 올리면
 * 오른쪽 숫자가 전부 따라 움직이고, 손대지 않는 것(로고·아이콘)은 그대로 남는다.
 *
 * 같은 사진을 여러 자리에 쓰면 가장 크게 쓰는 자리에 맞춘다 — 작은 쪽에 맞추면 큰 자리가
 * 뭉개진다(planImageTargets 와 같은 규칙). 이름도 그 자리의 것을 쓴다.
 *
 * 정렬은 줄어드는 것 먼저, 그 안에서 많이 줄어드는 순서다. 그대로 나가는 것은 뒤로 민다 —
 * 볼 이유가 있는 줄이 위에 있어야 한다.
 */
export function imageRoster(preflight: Preflight, settings: Settings): ImageRow[] {
  /** 해시별로 가장 큰 목표와, 그 목표를 만든 자리의 이름·표시 크기·기준선 */
  const best = new Map<string, { name: string; shown: number; target: number; visible: number }>()

  for (const frame of preflight.frames) {
    const nameOf = new Map<string, { name: string; edge: number; visible: number }>()
    for (const usage of frame.images) {
      const edge = Math.max(usage.width, usage.height)
      const found = nameOf.get(usage.imageHash)
      // 목표를 정하는 것은 가장 크게 쓰는 자리다 — 잘린 비도 그 자리의 것을 쓴다
      if (found === undefined || edge > found.edge) {
        nameOf.set(usage.imageHash, { name: usage.name, edge, visible: usage.visible })
      }
    }

    for (const plan of planImageTargets(frame.images, settings, preflight.imageSizes)) {
      const found = best.get(plan.imageHash)
      if (found !== undefined && found.target >= plan.targetLongEdge) continue
      const at = nameOf.get(plan.imageHash)
      best.set(plan.imageHash, {
        name: at?.name ?? '',
        shown: at?.edge ?? 0,
        target: plan.targetLongEdge,
        visible: at?.visible ?? 1
      })
    }
  }

  const rows: ImageRow[] = []
  for (const [imageHash, { name, shown, target, visible }] of best) {
    const edge = preflight.imageEdges[imageHash]
    const original = edge === undefined ? null : edge
    // 제 목표보다 크고 절대 하한도 넘을 때만 손댄다 — 로고·아이콘은 어떤 문서에서도 그대로
    const kept = original === null ? false : !shouldShrink(original, target, settings.minEdge)
    const wanted = Math.max(Math.ceil(shown * settings.multiplier), MIN_TARGET_LONG_EDGE)
    rows.push({
      imageHash,
      name,
      original,
      target,
      kept,
      capped: settings.maxEdge < wanted,
      visible
    })
  }

  return rows.sort((a, b) => {
    if (a.kept !== b.kept) return a.kept ? 1 : -1
    return (b.original ?? 0) - (a.original ?? 0)
  })
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
