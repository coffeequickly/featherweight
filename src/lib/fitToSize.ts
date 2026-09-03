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
/** 칸 사이를 메울 때 올라가는 품질의 천장. 그 위는 바이트만 늘고 눈에는 같다. */
export const MAX_QUALITY = 0.98
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

/**
 * 이미지 바이트를 두 갈래로 센다. 우리가 만든 JPEG 는 PDF 에 그대로(DCT) 실리고,
 * 나머지(손대지 않은 원본, PNG 로 남긴 출력)는 Figma 가 다시 인코딩해 넣어서 크기가 달라진다.
 * 숫자 하나만 주면 전부 "나머지" 로 본다.
 */
export type ImageBytes = { total: number; jpeg: number }

export function asImageBytes(value: number | ImageBytes): ImageBytes {
  return typeof value === 'number' ? { total: value, jpeg: 0 } : value
}

/** 후보 하나를 재본 결과. 사다리 칸일 수도, 칸 사이를 메운 변형일 수도 있다. */
export type Probe = {
  profile: CompressionProfile
  /** 이 프로필로 인코딩했을 때의 이미지 바이트 */
  bytes: ImageBytes
}

export type FitOutcome =
  | { kind: 'already-small'; predicted: number }
  | { kind: 'fits'; profile: CompressionProfile; predicted: number }
  | { kind: 'unreachable'; profile: CompressionProfile; predicted: number }

/**
 * 좋음 → 작음 한 줄 세우기. 사다리는 배율·상한·품질이 함께 내려가고 PNG 재인코딩은
 * 맨 위 칸만 끄므로, 이 순서로 비교하면 칸도 칸 사이 변형도 한 줄에 선다.
 * 음수면 a 가 더 선명하다.
 */
export function sharpnessOrder(a: CompressionProfile, b: CompressionProfile): number {
  return (
    b.multiplier - a.multiplier ||
    b.maxEdge - a.maxEdge ||
    Number(a.reencodeOpaquePng) - Number(b.reencodeOpaquePng) ||
    b.quality - a.quality
  )
}

export function sameProfile(a: CompressionProfile, b: CompressionProfile): boolean {
  return sharpnessOrder(a, b) === 0
}

/**
 * 맞는 칸을 찾은 뒤 그 칸과 위 칸 사이를 메우는 변형들 — 품질만 올린다, 선명한 것부터.
 *
 * 사다리 칸은 넓다. 특히 맨 위 칸만 PNG 를 그대로 두므로 스크린샷이 많은 문서는 한 칸
 * 차이가 14MB 와 3.5MB 다(실측). 9.5MB 를 적었는데 3.5MB 가 나오면 예산 6MB 를 버린 것.
 * JPEG 품질 0.88 과 0.96 은 스크린샷의 글자 주변에서 눈에 띄게 다르다.
 */
export function sharperVariants(base: CompressionProfile): CompressionProfile[] {
  const qualities = [0.08, 0.04]
    .map((step) => Math.min(MAX_QUALITY, Math.round((base.quality + step) * 100) / 100))
    .filter((quality) => quality > base.quality + 0.005)
  return [...new Set(qualities)].sort((a, b) => b - a).map((quality) => ({ ...base, quality }))
}

/**
 * 고정분 = 기준 export 의 PDF 크기 − 그때의 이미지 바이트 합계.
 * 텍스트·폰트·벡터·PDF 구조가 여기 들어간다. 압축 프로필과 무관하게 일정하다.
 */
export function fixedBytes(baselinePdfBytes: number, baselineImageBytes: number): number {
  return Math.max(0, baselinePdfBytes - baselineImageBytes)
}

/**
 * 예측 = 고정분 + 우리 JPEG + 보정비 × 나머지.
 *
 * Figma 는 PDF 를 만들 때 손대지 않은 원본을 자기 방식으로 다시 인코딩해 넣는다 — 31장 덱
 * 실측: 우리 셈 48MB 가 PDF 안에서는 8.9MB. 그대로 더하면 고정분이 0 으로 잘리고 압축을
 * 세게 한 후보가 기준보다 크게 예측된다. 반면 우리가 만든 JPEG 는 그대로(DCT) 실린다
 * (pdfimages 로 확인). 그래서 JPEG 는 그대로 더하고 나머지에만 기준 패스에서 잰 비율을
 * 곱한다. 비율 하나를 전부에 곱하면 우리 JPEG 가 많은 후보일수록 작게 예측돼 목표를 넘긴다
 * (실측: 예측 5.8MB → 실제 8.0MB).
 */
export function predictSize(fixed: number, imageBytes: number | ImageBytes, ratio = 1): number {
  const bytes = asImageBytes(imageBytes)
  return fixed + bytes.jpeg + Math.max(0, bytes.total - bytes.jpeg) * ratio
}

/**
 * 나머지 몫의 보정비 = (PDF 안의 실제 이미지 바이트 − 우리 JPEG) / (우리 셈 − 우리 JPEG).
 * 잴 수 없으면 1, 터무니없으면 잘라 낸다.
 */
export function calibrationRatio(pdfImageBytes: number, baseline: number | ImageBytes): number {
  const bytes = asImageBytes(baseline)
  const rest = bytes.total - bytes.jpeg
  if (rest <= 0 || pdfImageBytes <= 0) return 1
  return Math.min(2, Math.max(0.05, (pdfImageBytes - bytes.jpeg) / rest))
}

/**
 * 목표를 만족하는 후보 중 **가장 화질이 좋은 것**을 고른다.
 *
 * - 기준 결과가 목표 아래면 더 압축하지 않는다 (AC5). 대신 더 선명한 후보(사다리 위쪽,
 *   칸 사이 변형 포함) 중 목표 안에 드는 것이 있으면 그것을 고른다 — 목표는 한도가
 *   아니라 예산이다. 천장은 사다리 맨 위(선명하게와 같은 자리)라 부풀림에 놀랄 일은 없다.
 * - 아무 후보도 목표를 못 넘기면 최소 품질 결과를 주고 불가능이라고 말한다 (AC4)
 *
 * probes 는 정렬돼 있을 필요가 없다. 여기서 좋음 → 작음으로 세워 쓴다.
 */
export function chooseProfile(
  probes: readonly Probe[],
  fixed: number,
  targetBytes: number,
  baselineImageBytes: number | ImageBytes,
  ratio = 1
): FitOutcome {
  const baselinePredicted = predictSize(fixed, baselineImageBytes, ratio)
  const baseline = PROFILE_LADDER[BASELINE_INDEX]
  const sorted = [...probes].sort((a, b) => sharpnessOrder(a.profile, b.profile))

  if (baselinePredicted <= targetBytes) {
    for (const probe of sorted) {
      if (sharpnessOrder(probe.profile, baseline) >= 0) break // 기준보다 선명한 것만
      const predicted = predictSize(fixed, probe.bytes, ratio)
      if (predicted <= targetBytes) return { kind: 'fits', profile: probe.profile, predicted }
    }
    return { kind: 'already-small', predicted: baselinePredicted }
  }

  for (const probe of sorted) {
    const predicted = predictSize(fixed, probe.bytes, ratio)
    if (predicted <= targetBytes) return { kind: 'fits', profile: probe.profile, predicted }
  }

  // 아무것도 못 맞췄다 — 가장 작은 것(사다리 끝)을 주고 하한을 알린다
  const smallest = sorted[sorted.length - 1]
  if (smallest === undefined) {
    return { kind: 'unreachable', profile: baseline, predicted: baselinePredicted }
  }
  return {
    kind: 'unreachable',
    profile: smallest.profile,
    predicted: predictSize(fixed, smallest.bytes, ratio)
  }
}

/**
 * 재볼 후보를 좋음 → 작음 순서로. 사다리 전부를 재도 UI 인코딩이라 싸지만, 큰 문서에서는
 * 인코딩 자체가 부담이라 한쪽만 본다.
 *
 * - 기준이 목표를 넘으면 더 센 쪽('smaller') — 더 좋은 화질은 볼 이유가 없다
 * - 기준이 목표 안이면 더 선명한 쪽('sharper') — 남은 예산을 화질로 쓴다
 *
 * 두 경우 다 좋은 쪽부터 재고, 처음 목표 안에 드는 것에서 멈추면 된다.
 */
export function candidateIndices(
  baselineIndex: number,
  direction: 'sharper' | 'smaller'
): number[] {
  const out: number[] = []
  if (direction === 'sharper') {
    for (let index = 0; index < baselineIndex; index += 1) out.push(index)
  } else {
    for (let index = baselineIndex + 1; index < PROFILE_LADDER.length; index += 1) out.push(index)
  }
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
