// 설정 화면이 고르게 하는 값들과, 저장된 옛 값을 지금 선택지로 옮기는 규칙. Figma·DOM 의존 금지.
//
// 선택지를 바꾸면 clientStorage 에 남은 옛 값이 어느 칸에도 안 맞으므로 가장 가까운 값으로
// 옮긴다. 그래야 업그레이드해도 사용자가 정해 둔 값이 사라지지 않는다.

import { DEFAULT_SETTINGS, Settings } from './types'

/**
 * 배율 = DPI/72. 3×(216)·4×(288)는 인쇄용이다 — 2×(144)가 천장이던 동안
 * "인쇄·확대" 라는 프리셋 부제가 인쇄 표준(300 DPI)에 못 미쳤다.
 *
 * 칸을 촘촘히 둔다. 다섯 칸일 때는 한 칸이 곧 파일 크기를 크게 흔들어서, 원하는 자리에
 * 못 세우고 지나치거나 모자랐다. 값이 px 로 보이는 슬라이더에서는 특히 눈금이 들쭉날쭉했다
 * (1920 → 2560 → 3840). 연속 + 스냅도 검토했지만 그러면 배율을 저장할 이유가 없어져
 * 설정 모델을 통째로 바꿔야 한다 — 칸을 늘리는 쪽으로 같은 효과를 낸다.
 */
export const MULTIPLIERS: ReadonlyArray<Settings['multiplier']> = [
  1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4
]
/**
 * 한 장 상한 — 이미지 탭의 "최대" 바가 고르는 값이다.
 *
 * 3.0 에서 이걸 화면에서 뺐다가 실기에서 깨졌다. 균형 프리셋의 1920 이 1920pt 프레임에서
 * 모든 배율을 먹어, 그 자리를 대신 맡은 바가 전 구간 무반응이 됐다. 숨은 상한이 있는 한
 * 화면의 바 하나는 반드시 거짓말을 한다 — 그래서 도로 꺼냈다.
 *
 * 값은 전부 다들 아는 해상도 이름이 붙는 것들로 둔다(HD~8K). 임의의 숫자는 크기를 가늠할
 * 단서가 없다. 8K 까지 넓힌 것은 상한이 이제 사용자가 직접 정하는 값이기 때문이다.
 */
export const MAX_EDGES: ReadonlyArray<Settings['maxEdge']> = [1280, 1920, 2560, 3840, 5120, 7680]
/**
 * 목표의 하한. 아무리 작게 놓여도 이 아래로는 안 줄인다 — 로고·아이콘을 지킨다.
 * 480 아래는 두지 않는다: 실기에서 640 으로도 300pt 자리의 UI 스크린샷이 뭉갰다.
 */
export const MIN_EDGES: ReadonlyArray<Settings['minEdge']> = [480, 640, 800, 1024, 1280, 1600, 2048]

/**
 * 사다리에서 value 를 넘지 않는 가장 큰 값. 저장된 설정에서 최소가 최대보다 클 때
 * 최소를 내려 맞추는 데 쓴다 — 그대로 두면 목표는 최대에 잘리고 최소는 아무 일도 안 하면서
 * 제 값을 계속 내건다. 사다리 전체가 value 보다 크면 첫 값.
 */
export function atMost<T extends number>(options: ReadonlyArray<T>, value: number): T {
  let best = options[0]
  for (const option of options) {
    if (option <= value && option > best) best = option
  }
  return best
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
  const maxEdge = nearest(MAX_EDGES, Number(merged.maxEdge))
  const minEdge = nearest(MIN_EDGES, Number(merged.minEdge))
  return {
    ...merged,
    multiplier: nearest(MULTIPLIERS, Number(merged.multiplier)),
    maxEdge,
    // 저장값이 엇갈려 있을 수 있다 — 옛 버전의 최소 용량 프리셋은 maxEdge 1280 만 정하고
    // minEdge(1600 까지 고를 수 있었다)는 건드리지 않아, 최소가 최대보다 큰 채로 남았다.
    // 화면은 새 교차를 막지만 들여올 때도 풀어 줘야 한다. 내리는 쪽으로 맞춘다 — 올리면
    // 사용자가 정한 적 없는 화질을 조용히 키운다
    minEdge: minEdge > maxEdge ? atMost(MIN_EDGES, maxEdge) : minEdge
  }
}
