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
  /**
   * 이 프로필의 하한. 예전에는 사용자의 `settings.minEdge` 를 그대로 빌려 썼는데,
   * 그때는 `targetFor` 가 그 값을 무시하고 640 을 하드코딩해서 아무 일도 없었다.
   * 하한이 실제로 동작하게 되자 사다리의 맨 아래칸이 조용히 약해졌다 — 사용자가 최소를
   * 올려 두면 목표 용량이 예전만큼 못 줄인다. 프로필이 압축을 온전히 설명하게 두면
   * 남의 설정을 빌릴 일이 없다.
   */
  minEdge: number
  quality: number
  reencodeOpaquePng: boolean
}

/** 최소 품질 가드 — 목표를 맞추려고 이 아래로 내려가지 않는다 */
export const MIN_QUALITY = 0.6
/** 칸 사이를 메울 때 올라가는 품질의 천장. 그 위는 바이트만 늘고 눈에는 같다. */
export const MAX_QUALITY = 0.98
export const MIN_MULTIPLIER = 1
export const MIN_MAX_EDGE = 1024
/** 사다리 맨 아래칸의 하한. 여기까지 내려가야 예전만큼 작아진다 */
export const MIN_MIN_EDGE = 640

/**
 * 좋음 → 작음 순서의 사다리. 앞쪽일수록 화질이 좋고 파일이 크다.
 * 마지막 항목이 최소 품질 가드에 닿는 지점이다.
 */
export const PROFILE_LADDER: CompressionProfile[] = [
  { multiplier: 2, maxEdge: 4096, minEdge: 1024, quality: 0.92, reencodeOpaquePng: false },
  { multiplier: 2, maxEdge: 3072, minEdge: 1024, quality: 0.88, reencodeOpaquePng: true },
  { multiplier: 1.75, maxEdge: 2560, minEdge: 1024, quality: 0.84, reencodeOpaquePng: true },
  { multiplier: 1.5, maxEdge: 2048, minEdge: 1024, quality: 0.8, reencodeOpaquePng: true },
  { multiplier: 1.35, maxEdge: 1800, minEdge: 1024, quality: 0.76, reencodeOpaquePng: true },
  { multiplier: 1.2, maxEdge: 1600, minEdge: 800, quality: 0.72, reencodeOpaquePng: true },
  { multiplier: 1.1, maxEdge: 1280, minEdge: 640, quality: 0.66, reencodeOpaquePng: true },
  {
    multiplier: MIN_MULTIPLIER,
    maxEdge: MIN_MAX_EDGE,
    minEdge: MIN_MIN_EDGE,
    quality: MIN_QUALITY,
    reencodeOpaquePng: true
  }
]

/** 기준 export 에 쓰는 프로필 — 사다리 4번째 칸(2048·0.8). Balanced 프리셋(1920·0.8)과 가까운 자리 */
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
    minEdge: profile.minEdge as Settings['minEdge'],
    quality: profile.quality,
    reencodeOpaquePng: profile.reencodeOpaquePng
  }
}

/**
 * 이미지 바이트 합계. jpeg 는 그중 JPEG 로 낸 몫 — 예전 예측식이 갈라 썼고 지금은 참고용으로만 남긴다.
 * 숫자 하나만 주면 전부 total 로 본다.
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
 * Figma 가 PDF 로 내보낼 때 이미지를 다시 인코딩하는 JPEG 품질(IJG 척도). 실측(2026-09-11): 같은 사진을
 * 품질 60/80/95 로 넣어도 PDF 안의 JPEG 는 전부 같은 양자화표였고, 그 표는 IJG 표준 휘도표의 0.455~0.5 배
 * = scale 48 = 품질 76. 우리 캔버스 인코더(Chrome, IJG 표)의 0.76 이 같은 표를 만든다 — 그래서 후보의
 * 용량은 "후보 품질로 인코딩한 결과를 다시 이 품질로 인코딩한 크기" 로 잰다(resize.figmaSizeOf).
 */
export const FIGMA_JPEG_QUALITY = 0.76

/**
 * 예측 = 고정분 + 보정비 × 이미지 바이트.
 *
 * 이미지 바이트는 후보의 출력을 Figma 품질(FIGMA_JPEG_QUALITY)로 다시 인코딩한 크기의 합이다 — Figma 가
 * PDF 를 만들 때 하는 일을 미리 해 보는 셈. 예전에는 "우리 JPEG 는 그대로 실린다" 고 보고 우리 품질의
 * 바이트를 그대로 더했는데, 실측으로 틀렸다: Figma 는 우리 JPEG 도 품질 76 으로 다시 인코딩하므로 품질을
 * 올린 후보는 과하게(선명한 결과를 놓침), 내린 후보는 적게(목표를 넘김) 예측됐다(+0.5%·+2.1%·+3.6% 가
 * 품질 순). 같은 잣대로 잰 기준 패스와 PDF 안 실제 이미지 바이트의 비(calibrationRatio)가 인코더 차이를
 * 흡수한다. 31장 덱 실측: 우리 셈 48MB 가 PDF 안에서 8.9MB — 그대로 더하면 고정분이 0 으로 잘린다.
 */
export function predictSize(fixed: number, imageBytes: number | ImageBytes, ratio = 1): number {
  const bytes = asImageBytes(imageBytes)
  return fixed + Math.max(0, bytes.total) * ratio
}

/**
 * 보정비 = PDF 안의 실제 이미지 바이트 / 기준 패스를 Figma 품질로 잰 바이트.
 * 잴 수 없으면 1, 터무니없으면 잘라 낸다. 기준 패스도 후보와 같은 잣대(figmaSizeOf)로 재야 비가 맞다.
 */
export function calibrationRatio(pdfImageBytes: number, baseline: number | ImageBytes): number {
  const bytes = asImageBytes(baseline)
  if (bytes.total <= 0 || pdfImageBytes <= 0) return 1
  return Math.min(2, Math.max(0.05, pdfImageBytes / bytes.total))
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

/**
 * 재볼 칸의 순서(좋음 → 작음). 처음 목표에 드는 칸에서 멈추면 그게 가장 선명한 답이다.
 *
 * - 기준이 목표 안이면 더 선명한 쪽만 — 남은 예산을 화질로 쓴다.
 * - 넘으면 더 센 쪽만. 단 잘라 넣기가 켜져 있으면 더 선명한 쪽도 앞에 세운다 — 조각 채택은 계획이
 *   아니라 인코딩 뒤 절감률(chooseCrop)로 정해져 칸마다 다르다. 같은 계획이라도 기준은 절감 3% 로
 *   전체본(1,000KB), 한 칸 위는 절감 18% 로 조각(980KB)일 수 있어 더 선명한데 더 작다(검토 재현).
 *   "계획이 새로 붙는 칸만" 으로 거르는 것은 근거가 안 된다 — 생략하려면 그 칸이 목표에 못 드는
 *   하한이 필요한데 계획만으로는 그런 하한이 없다. 값은 후보 설정 평가 최대 세 번 — 평가마다
 *   문서의 이미지와 조각을 전부 인코딩하므로 큰 문서는 시간이 꽤 는다.
 */
export function probeOrder(
  baselineIndex: number,
  baselineFits: boolean,
  cropToVisible: boolean
): number[] {
  if (baselineFits) return candidateIndices(baselineIndex, 'sharper')
  const smaller = candidateIndices(baselineIndex, 'smaller')
  return cropToVisible ? [...candidateIndices(baselineIndex, 'sharper'), ...smaller] : smaller
}

/**
 * 결과 탭에 적을 자동 선택 설정 — "1.1× · 최대 1280px · 최소 640px · 품질 74%". 마지막 단계가
 * 품질만 올린 변형을 재보므로 칸 이름만으로는 최종 설정을 알 수 없고, PDF 에서도 못 읽는다(Figma 가
 * 내보낼 때 이미지를 다시 인코딩한다 — 2026-09-11 실측, 네 PDF 의 JPEG 69장이 같은 양자화표). 그래서 적어 둔다.
 */
export function describeProfile(profile: CompressionProfile): string {
  return `${profile.multiplier}x max${profile.maxEdge} min${profile.minEdge} q${Math.round(profile.quality * 100)}${profile.reencodeOpaquePng ? '' : ' keep-png'}`
}

/** 실제 크기가 목표를 넘었을 때 다시 뽑아 보는 횟수의 상한 — 한 번이 곧 문서 전체 내보내기다 */
export const MAX_FIT_RETRIES = 2

/**
 * 최종 PDF 의 실제 바이트가 목표를 넘었을 때 다음에 뽑아 볼 후보 — 선명도(픽셀)를 지키려고 같은
 * 해상도에서 품질만 내린 것부터, 그다음 사다리의 아래 칸. 판단은 예측이 아니라 실제 바이트로 한다
 * (실측: 예측이 낮게 나와 5.7·5.9 MB 목표를 각각 +0.5%·+0.7% 넘긴 실행이 있었다, 2026-09-11).
 * 품질이 이미 바닥(MIN_QUALITY)이고 아래 칸도 없으면 빈 배열 — 그때는 못 맞췄다고 말한다.
 */
export function retryCandidates(chosen: CompressionProfile): CompressionProfile[] {
  const out: CompressionProfile[] = []
  const lower = Math.max(MIN_QUALITY, Math.round((chosen.quality - 0.04) * 100) / 100)
  if (lower < chosen.quality - 0.005) out.push({ ...chosen, quality: lower })
  // 아래 칸은 품질을 내린 변형보다도 덜 선명한 첫 칸 — 변형 76% 의 −0.04 가 5번 칸(72%) 그 자체라
  // 같은 설정을 두 번 뽑던 것을 막는다(검토 재현)
  const floor = out[out.length - 1] ?? chosen
  const below = PROFILE_LADDER.find((rung) => sharpnessOrder(rung, floor) > 0)
  if (below !== undefined && !out.some((candidate) => sameProfile(candidate, below)))
    out.push(below)
  return out.slice(0, MAX_FIT_RETRIES)
}

/** 최종 패스로 뽑을 설정의 순서 — 고른 것부터, 넘치면 재시도 후보. 같은 설정은 한 번만 */
export function fitAttemptPlan(chosen: CompressionProfile): CompressionProfile[] {
  return [chosen, ...retryCandidates(chosen).filter((c) => !sameProfile(c, chosen))]
}

export type FitAttempt = { profile: CompressionProfile; actual: number }

export type FitDecision = {
  /** last = 마지막으로 잰 병합본을 저장, best = 목표 안에 든 것 가운데 가장 선명한 보관본을 저장 */
  save: 'last' | 'best'
  /** 저장되는 것의 설정 */
  profile: CompressionProfile
  outcome: 'fits' | 'already-small' | 'unreachable' | 'missed'
}

/**
 * 저장할 PDF 와 결과 상태를 **실제 바이트**로 정한다 — 예측(chooseProfile)은 탐색 정보일 뿐이다.
 *
 * - 마지막 시도가 목표 안이면 그것(가장 선명한 쪽부터 시도했으니 그게 답).
 * - 아니면 목표 안에 든 것(앞선 시도, 기준 패스) 가운데 가장 선명한 것을 보관본에서 복구한다 —
 *   기준이 이미 목표 안인데 더 선명한 후보와 재시도가 전부 넘친 경우 마지막 초과본을 저장하던 결함(검토).
 * - 아무것도 못 들면: 재시도 후보가 있었으면 missed, 사다리 바닥이라 없었으면 unreachable.
 * - 최종 패스가 없으면(기준 그대로) 기준 패스의 실측으로 판정한다. 예측이 unreachable 이어도
 *   실측이 목표 안이면 fits — 결과 화면이 실물과 다른 말을 하면 안 된다.
 */
export function decideFit(
  targetBytes: number,
  baseline: FitAttempt,
  attempts: readonly FitAttempt[],
  retriesAvailable: boolean,
  predicted: 'fits' | 'already-small' | 'unreachable'
): FitDecision {
  const last = attempts[attempts.length - 1]
  if (last === undefined) {
    const fits = baseline.actual <= targetBytes
    return {
      save: 'last',
      profile: baseline.profile,
      outcome: fits
        ? predicted === 'fits'
          ? 'fits'
          : 'already-small'
        : predicted === 'unreachable'
          ? 'unreachable'
          : 'missed'
    }
  }
  if (last.actual <= targetBytes) return { save: 'last', profile: last.profile, outcome: 'fits' }
  const fitting = [
    ...attempts.filter((attempt) => attempt.actual <= targetBytes),
    ...(baseline.actual <= targetBytes ? [baseline] : [])
  ].sort((a, b) => sharpnessOrder(a.profile, b.profile))
  const best = fitting[0]
  if (best !== undefined) {
    return {
      save: 'best',
      profile: best.profile,
      outcome: sameProfile(best.profile, baseline.profile) ? 'already-small' : 'fits'
    }
  }
  return {
    save: 'last',
    profile: last.profile,
    outcome: retriesAvailable ? 'missed' : 'unreachable'
  }
}

/**
 * UI 가 저장할 병합본 — 새 조각이 왔으면 그것(보통 내보내기), 아니면 메인이 고른 슬롯:
 * saveBest 면 목표 안 보관본, 없으면 마지막 측정본
 */
export function savedSource(
  hasArrived: boolean,
  hasBest: boolean,
  saveBest: boolean
): 'arrived' | 'best' | 'stash' {
  if (hasArrived) return 'arrived'
  return saveBest && hasBest ? 'best' : 'stash'
}

/**
 * 어느 병합본을 저장하고 어떤 설정으로 적을지 — 마지막 패스의 병합·측정이 실패한 경우까지.
 * 측정이 실패하면 UI 의 마지막 측정 슬롯에는 그 실패한 패스의 조각이 남는다. 그때 목표 안 보관본이
 * 있으면 그것을 저장하고(saveBest), 없으면 저장되는 것은 실패한 패스의 재병합본이니 설정도 그것으로
 * 적는다 — 판정은 기준본으로 하면서 저장은 실패한 후보를 하던 불일치(검토).
 */
export function resolveSave(
  decision: FitDecision,
  measureFailed: boolean,
  keptFits: boolean,
  failedProfile: CompressionProfile | null
): { saveBest: boolean; profile: CompressionProfile } {
  if (measureFailed && keptFits) return { saveBest: true, profile: decision.profile }
  if (measureFailed && failedProfile !== null) return { saveBest: false, profile: failedProfile }
  return { saveBest: decision.save === 'best', profile: decision.profile }
}
