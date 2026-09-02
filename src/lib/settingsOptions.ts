// 설정 화면이 고르게 하는 값들과, 저장된 옛 값을 지금 선택지로 옮기는 규칙. Figma·DOM 의존 금지.
//
// 상한은 해상도 이름으로 부른다 — HD · FHD · QHD · 4K. "2048" 은 만드는 사람의 숫자고,
// 쓰는 사람은 "FHD 정도면 되나" 로 생각한다. 선택지를 바꾸면 clientStorage 에 남은 옛 값
// (1024·1600·2048·4096)이 어느 버튼에도 안 맞으므로 가장 가까운 값으로 옮긴다.

import { DEFAULT_SETTINGS, Settings } from './types'

export const MULTIPLIERS: ReadonlyArray<Settings['multiplier']> = [1, 1.5, 2]
export const MAX_EDGES: ReadonlyArray<Settings['maxEdge']> = [1280, 1920, 2560, 3840]
/** 이 크기 이하는 어떤 문서에서도 손대지 않는다. 로고·아이콘을 지키는 절대 하한. */
export const MIN_EDGES: ReadonlyArray<Settings['minEdge']> = [640, 1024, 1600]

/** 다들 아는 화면 크기. 상한 눈금의 기준이고, 언어와 무관하다. */
export const FHD_LONG_EDGE = 1920

const EDGE_NAMES: Record<number, string> = { 1280: 'HD', 1920: 'FHD', 2560: 'QHD', 3840: '4K' }

/**
 * 상한을 해상도 이름으로. 이름이 없는 값(사다리·옛 저장값)은 FHD 에 견준 배율로 말한다 —
 * 2048 이 큰지 작은지는 몰라도 "FHD 1.1×" 는 바로 읽힌다.
 */
export function edgeTag(edge: number): string {
  const named = EDGE_NAMES[edge]
  if (named !== undefined) return named
  const ratio = edge / FHD_LONG_EDGE
  if (ratio < 1) return `FHD ${Math.round(ratio * 100)}%`
  return `FHD ${Number(ratio.toFixed(1))}×`
}

/** 선택지 중 가장 가까운 것. 같은 거리면 작은 쪽 — 화질을 몰래 올리지 않는다. */
export function nearest<T extends number>(options: ReadonlyArray<T>, value: number): T {
  let best = options[0]
  for (const option of options) {
    if (Math.abs(option - value) < Math.abs(best - value)) best = option
  }
  return best
}

/**
 * 저장된 설정을 지금 선택지에 맞춘다. 빠진 항목은 기본값, 선택지 밖의 값은 가장 가까운 것.
 * 그래야 업그레이드해도 사용자가 정해 둔 목표 용량·하한이 사라지지 않는다.
 */
export function snapSettings(stored: Partial<Settings>): Settings {
  const merged: Settings = { ...DEFAULT_SETTINGS, ...stored }
  return {
    ...merged,
    multiplier: nearest(MULTIPLIERS, Number(merged.multiplier)),
    maxEdge: nearest(MAX_EDGES, Number(merged.maxEdge)),
    minEdge: nearest(MIN_EDGES, Number(merged.minEdge))
  }
}
