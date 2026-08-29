// 목표 용량에 맞는 압축 프로필 고르기. Figma·DOM 의존 금지. (docs/FIT-TO-SIZE.md)
//
// 핵심: PDF 크기는 "고정분(텍스트·폰트·벡터·구조) + Σ이미지 바이트" 다.
// 고정분은 기준 export 한 번으로 알 수 있고, 이미지 바이트는 UI 에서 Figma 없이
// 재인코딩해 잴 수 있다. 그래서 후보를 전부 재보고 고르면 된다 — 탐색이 아니라 선택이다.
//
// 이진 탐색을 쓰지 않는 이유: keepsOriginal() 때문에 압축을 세게 해도 크기가 그대로인
// 구간이 생긴다. 단조롭지 않은 계단 곡선이라 이진 탐색은 헛돈다.

import { Settings } from './types'

/**
 * 탐색용 압축 설정. Settings 의 multiplier·maxEdge 는 UI 세그먼트와 묶인 union 이라
 * 연속값을 넣을 수 없어서 별도 타입으로 둔다.
 */
export type CompressionProfile = {
  multiplier: number
  maxEdge: number
  quality: number
  reencodeOpaquePng: boolean
}

/** 최소 품질 가드 — 목표를 맞추려고 이 아래로 내려가지 않는다 */
export const MIN_QUALITY = 0.6
export const MIN_MULTIPLIER = 1
export const MIN_MAX_EDGE = 1024

/**
 * 좋음 → 작음 순서의 사다리. 앞쪽일수록 화질이 좋고 파일이 크다.
 * 마지막 항목이 최소 품질 가드에 닿는 지점이다.
 */
export const PROFILE_LADDER: CompressionProfile[] = [
  { multiplier: 2, maxEdge: 4096, quality: 0.92, reencodeOpaquePng: false },
  { multiplier: 2, maxEdge: 3072, quality: 0.88, reencodeOpaquePng: true },
  { multiplier: 1.75, maxEdge: 2560, quality: 0.84, reencodeOpaquePng: true },
  { multiplier: 1.5, maxEdge: 2048, quality: 0.8, reencodeOpaquePng: true },
  { multiplier: 1.35, maxEdge: 1800, quality: 0.76, reencodeOpaquePng: true },
  { multiplier: 1.2, maxEdge: 1600, quality: 0.72, reencodeOpaquePng: true },
  { multiplier: 1.1, maxEdge: 1280, quality: 0.66, reencodeOpaquePng: true },
  {
    multiplier: MIN_MULTIPLIER,
    maxEdge: MIN_MAX_EDGE,
    quality: MIN_QUALITY,
    reencodeOpaquePng: true
  }
]

/** 기준 export 에 쓰는 프로필 — 현재 Balanced 와 같은 자리 */
export const BASELINE_INDEX = 3

/**
 * 프로필을 Settings 에 얹는다. 사다리 값은 UI 세그먼트 union 밖이라 캐스팅이 필요하다 —
 * 이 값들은 계산에만 쓰이고 화면 세그먼트를 그리지 않으므로 안전하다.
 */
export function applyProfile(settings: Settings, profile: CompressionProfile): Settings {
  return {
    ...settings,
    multiplier: profile.multiplier as Settings['multiplier'],
    maxEdge: profile.maxEdge as Settings['maxEdge'],
    quality: profile.quality,
    reencodeOpaquePng: profile.reencodeOpaquePng
  }
}

/** 후보 하나를 재본 결과 */
export type Probe = {
  profileIndex: number
  /** 이 프로필로 인코딩했을 때의 이미지 바이트 합계 */
  imageBytes: number
}

export type FitOutcome =
  | { kind: 'already-small'; predicted: number }
  | { kind: 'fits'; profileIndex: number; predicted: number }
  | { kind: 'unreachable'; profileIndex: number; predicted: number }

/**
 * 고정분 = 기준 export 의 PDF 크기 − 그때의 이미지 바이트 합계.
 * 텍스트·폰트·벡터·PDF 구조가 여기 들어간다. 압축 프로필과 무관하게 일정하다.
 */
export function fixedBytes(baselinePdfBytes: number, baselineImageBytes: number): number {
  return Math.max(0, baselinePdfBytes - baselineImageBytes)
}

export function predictSize(fixed: number, imageBytes: number): number {
  return fixed + imageBytes
}

/**
 * 목표를 만족하는 후보 중 **가장 화질이 좋은 것**을 고른다.
 *
 * - 기준 결과가 이미 목표 아래면 그대로 둔다 (AC5 — 공짜로 화질을 버리지 않는다)
 * - 아무 후보도 목표를 못 넘기면 최소 품질 결과를 주고 불가능이라고 말한다 (AC4)
 *
 * probes 는 profileIndex 오름차순(좋음 → 작음)일 필요가 없다. 여기서 정렬해 쓴다.
 */
export function chooseProfile(
  probes: readonly Probe[],
  fixed: number,
  targetBytes: number,
  baselineImageBytes: number
): FitOutcome {
  const baselinePredicted = predictSize(fixed, baselineImageBytes)
  if (baselinePredicted <= targetBytes) {
    return { kind: 'already-small', predicted: baselinePredicted }
  }

  const sorted = [...probes].sort((a, b) => a.profileIndex - b.profileIndex)

  for (const probe of sorted) {
    const predicted = predictSize(fixed, probe.imageBytes)
    if (predicted <= targetBytes) {
      return { kind: 'fits', profileIndex: probe.profileIndex, predicted }
    }
  }

  // 아무것도 못 맞췄다 — 가장 작은 것(사다리 끝)을 주고 하한을 알린다
  const smallest = sorted[sorted.length - 1]
  if (smallest === undefined) {
    return { kind: 'unreachable', profileIndex: BASELINE_INDEX, predicted: baselinePredicted }
  }
  return {
    kind: 'unreachable',
    profileIndex: smallest.profileIndex,
    predicted: predictSize(fixed, smallest.imageBytes)
  }
}

/**
 * 재볼 후보를 고른다. 사다리 전부를 재도 UI 인코딩이라 싸지만, 큰 문서에서는
 * 인코딩 자체가 부담이 되므로 기준보다 압축이 센 쪽만 본다 — 목표를 못 맞춘
 * 상황에서 기준보다 화질 좋은 후보를 재는 건 의미가 없다.
 */
export function candidateIndices(baselineIndex: number): number[] {
  const out: number[] = []
  for (let index = baselineIndex + 1; index < PROFILE_LADDER.length; index += 1) out.push(index)
  return out
}

const MB = 1024 * 1024

export function mbToBytes(mb: number): number {
  return Math.round(mb * MB)
}

/** 목표 입력 허용 범위 — UI 와 저장값 양쪽에서 쓴다 */
export const MIN_TARGET_MB = 0.5
export const MAX_TARGET_MB = 500

export function clampTargetMb(value: number): number {
  if (!Number.isFinite(value)) return 5
  const rounded = Math.round(value * 10) / 10
  return Math.min(MAX_TARGET_MB, Math.max(MIN_TARGET_MB, rounded))
}
