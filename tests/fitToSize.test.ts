import { describe, expect, it } from 'vitest'

import {
  BASELINE_INDEX,
  calibrationRatio,
  candidateIndices,
  chooseProfile,
  clampTargetMb,
  fixedBytes,
  MAX_QUALITY,
  MAX_TARGET_MB,
  mbToBytes,
  MIN_MAX_EDGE,
  MIN_MULTIPLIER,
  MIN_QUALITY,
  MIN_TARGET_MB,
  predictSize,
  Probe,
  PROFILE_LADDER,
  sharperVariants,
  sharpnessOrder
} from '../src/lib/fitToSize'

const MB = 1024 * 1024

/** 사다리 칸(또는 품질만 바꾼 변형)을 잰 결과 */
const probe = (index: number, imageBytes: number, quality?: number): Probe => ({
  profile: quality === undefined ? PROFILE_LADDER[index] : { ...PROFILE_LADDER[index], quality },
  bytes: { total: imageBytes, jpeg: 0 }
})

describe('PROFILE_LADDER', () => {
  it('좋음 → 작음 순서다 — 뒤로 갈수록 품질·해상도가 낮아진다', () => {
    for (let i = 1; i < PROFILE_LADDER.length; i += 1) {
      const prev = PROFILE_LADDER[i - 1]
      const cur = PROFILE_LADDER[i]
      expect(cur.quality).toBeLessThanOrEqual(prev.quality)
      expect(cur.maxEdge).toBeLessThanOrEqual(prev.maxEdge)
      expect(cur.multiplier).toBeLessThanOrEqual(prev.multiplier)
    }
  })

  it('마지막 항목이 최소 품질 가드에 닿는다 — 그 아래로는 내려가지 않는다', () => {
    const last = PROFILE_LADDER[PROFILE_LADDER.length - 1]
    expect(last.quality).toBe(MIN_QUALITY)
    expect(last.multiplier).toBe(MIN_MULTIPLIER)
    expect(last.maxEdge).toBe(MIN_MAX_EDGE)
  })

  it('어떤 항목도 최소 품질 아래로 내려가지 않는다 (AC4)', () => {
    for (const profile of PROFILE_LADDER) {
      expect(profile.quality).toBeGreaterThanOrEqual(MIN_QUALITY)
      expect(profile.multiplier).toBeGreaterThanOrEqual(MIN_MULTIPLIER)
      expect(profile.maxEdge).toBeGreaterThanOrEqual(MIN_MAX_EDGE)
    }
  })
})

describe('fixedBytes', () => {
  it('PDF 크기에서 이미지 몫을 뺀 나머지 — 텍스트·폰트·구조', () => {
    expect(fixedBytes(8 * MB, 6 * MB)).toBe(2 * MB)
  })

  it('음수가 되지 않는다 — 측정 오차로 이미지가 더 커 보여도 0 으로 막는다', () => {
    expect(fixedBytes(1 * MB, 3 * MB)).toBe(0)
  })
})

describe('chooseProfile', () => {
  const fixed = 1 * MB

  it('기준이 이미 목표보다 작고 잴 것이 없으면 그대로 둔다 (AC5)', () => {
    const outcome = chooseProfile([], fixed, 10 * MB, 2 * MB)
    expect(outcome.kind).toBe('already-small')
    expect(outcome.predicted).toBe(3 * MB)
  })

  it('기준이 목표 안이면 더 선명한 후보 중 목표 안에 드는 가장 좋은 것 — 예산을 쓴다', () => {
    // 기준(3) 3MB · 목표 10MB · 후보: 0 → 12MB(넘침), 1 → 9MB, 2 → 6MB
    const outcome = chooseProfile(
      [probe(2, 5 * MB), probe(0, 11 * MB), probe(1, 8 * MB)],
      fixed,
      10 * MB,
      2 * MB
    )
    expect(outcome).toEqual({ kind: 'fits', profile: PROFILE_LADDER[1], predicted: 9 * MB })
  })

  it('더 선명한 후보가 전부 목표를 넘으면 기준 그대로 — 선명하게가 천장이다', () => {
    const outcome = chooseProfile([probe(0, 30 * MB), probe(2, 12 * MB)], fixed, 10 * MB, 2 * MB)
    expect(outcome).toEqual({ kind: 'already-small', predicted: 3 * MB })
  })

  it('목표를 만족하는 후보 중 가장 화질 좋은 것을 고른다 (AC2)', () => {
    // 기준(index 3)은 9MB 로 목표 초과. 4 번은 6MB, 5 번은 3MB → 4 번이 정답
    const probes: Probe[] = [probe(5, 2 * MB), probe(4, 5 * MB), probe(6, 1 * MB)]
    const outcome = chooseProfile(probes, fixed, 7 * MB, 8 * MB)

    expect(outcome.kind).toBe('fits')
    if (outcome.kind === 'fits') {
      expect(outcome.profile).toBe(PROFILE_LADDER[4])
      expect(outcome.predicted).toBe(6 * MB)
    }
  })

  it('probes 순서가 뒤섞여 있어도 결과가 같다', () => {
    const shuffled: Probe[] = [probe(6, 1 * MB), probe(4, 5 * MB), probe(5, 2 * MB)]
    const outcome = chooseProfile(shuffled, fixed, 7 * MB, 8 * MB)
    if (outcome.kind === 'fits') expect(outcome.profile).toBe(PROFILE_LADDER[4])
  })

  it('아무 후보도 목표를 못 맞추면 최소 품질 결과와 하한을 준다 (AC4)', () => {
    const probes: Probe[] = [probe(4, 5 * MB), probe(7, 3 * MB)]
    const outcome = chooseProfile(probes, fixed, 1 * MB, 8 * MB)

    expect(outcome.kind).toBe('unreachable')
    if (outcome.kind === 'unreachable') {
      expect(outcome.profile).toBe(PROFILE_LADDER[7]) // 사다리에서 가장 작은 것
      expect(outcome.predicted).toBe(4 * MB) // 고정분 1MB + 이미지 3MB = 하한
    }
  })

  it('고정분만으로 목표를 넘으면 이미지를 다 줄여도 불가능하다', () => {
    // 텍스트 위주 문서: 고정분 5MB, 이미지는 이미 작다
    const probes: Probe[] = [probe(7, 0.2 * MB)]
    const outcome = chooseProfile(probes, 5 * MB, 3 * MB, 0.5 * MB)

    expect(outcome.kind).toBe('unreachable')
    expect(outcome.predicted).toBeGreaterThan(5 * MB)
  })

  it('후보가 하나도 없으면 기준 결과로 불가능 판정', () => {
    const outcome = chooseProfile([], fixed, 1 * MB, 8 * MB)
    expect(outcome.kind).toBe('unreachable')
  })
})

describe('candidateIndices', () => {
  it('기준보다 압축이 센 쪽만 재본다 — 목표 초과 상황에서 더 좋은 화질은 볼 이유가 없다', () => {
    const indices = candidateIndices(BASELINE_INDEX, 'smaller')
    expect(indices[0]).toBe(BASELINE_INDEX + 1)
    expect(indices).not.toContain(BASELINE_INDEX)
    expect(indices[indices.length - 1]).toBe(PROFILE_LADDER.length - 1)
  })

  it('사다리 끝이 기준이면 잴 후보가 없다', () => {
    expect(candidateIndices(PROFILE_LADDER.length - 1, 'smaller')).toEqual([])
  })

  it('기준이 목표 안이면 더 선명한 쪽을 좋은 것부터 — 맨 위(선명하게)가 천장', () => {
    expect(candidateIndices(BASELINE_INDEX, 'sharper')).toEqual([0, 1, 2])
    expect(candidateIndices(0, 'sharper')).toEqual([])
  })
})

describe('목표값 변환', () => {
  it('MB ↔ 바이트', () => {
    expect(mbToBytes(5)).toBe(5 * MB)
    expect(predictSize(1 * MB, 2 * MB)).toBe(3 * MB)
  })

  it('허용 범위 밖은 잘라낸다', () => {
    expect(clampTargetMb(0.1)).toBe(MIN_TARGET_MB)
    expect(clampTargetMb(9999)).toBe(MAX_TARGET_MB)
  })

  it('소수점 한 자리로 맞춘다', () => {
    expect(clampTargetMb(4.87)).toBe(4.9)
  })

  it('숫자가 아니면 기본값 5', () => {
    expect(clampTargetMb(Number.NaN)).toBe(5)
  })
})

describe('sharpnessOrder', () => {
  it('사다리 순서와 같다 — 앞 칸이 더 선명하다', () => {
    for (let i = 1; i < PROFILE_LADDER.length; i += 1) {
      expect(sharpnessOrder(PROFILE_LADDER[i - 1], PROFILE_LADDER[i])).toBeLessThan(0)
    }
  })

  it('같은 칸에서 품질만 올린 변형은 그 칸보다 선명하고 위 칸보다는 덜 선명하다', () => {
    const variant = { ...PROFILE_LADDER[1], quality: 0.96 }
    expect(sharpnessOrder(variant, PROFILE_LADDER[1])).toBeLessThan(0)
    expect(sharpnessOrder(PROFILE_LADDER[0], variant)).toBeLessThan(0)
  })
})

describe('sharperVariants', () => {
  it('품질만 +0.08, +0.04 — 선명한 것부터', () => {
    expect(sharperVariants(PROFILE_LADDER[3]).map((v) => v.quality)).toEqual([0.88, 0.84])
    expect(sharperVariants(PROFILE_LADDER[3]).every((v) => v.maxEdge === 2048)).toBe(true)
  })

  it('천장 0.98 을 넘지 않고, 같은 값은 하나로', () => {
    expect(sharperVariants(PROFILE_LADDER[0]).map((v) => v.quality)).toEqual([0.98, 0.96])
    expect(sharperVariants({ ...PROFILE_LADDER[0], quality: 0.96 }).map((v) => v.quality)).toEqual([
      0.98
    ])
    expect(sharperVariants({ ...PROFILE_LADDER[0], quality: MAX_QUALITY })).toEqual([])
  })
})

describe('chooseProfile — 칸 사이 변형', () => {
  const fixed = 1 * MB

  it('맞는 칸보다 선명한 변형이 목표 안에 들면 그것을 고른다', () => {
    // 칸 0: 14MB(넘침) · 칸 1: 3.5MB · 칸 1 의 품질 0.96 변형: 6MB · 0.92 변형: 4.5MB — 목표 9.5MB
    const outcome = chooseProfile(
      [probe(0, 13 * MB), probe(1, 2.5 * MB), probe(1, 5 * MB, 0.96), probe(1, 3.5 * MB, 0.92)],
      fixed,
      9.5 * MB,
      2 * MB
    )
    expect(outcome).toEqual({
      kind: 'fits',
      profile: { ...PROFILE_LADDER[1], quality: 0.96 },
      predicted: 6 * MB
    })
  })

  it('변형이 전부 넘치면 칸 그대로', () => {
    const outcome = chooseProfile(
      [probe(0, 13 * MB), probe(1, 2.5 * MB), probe(1, 12 * MB, 0.96)],
      fixed,
      9.5 * MB,
      2 * MB
    )
    expect(outcome).toEqual({ kind: 'fits', profile: PROFILE_LADDER[1], predicted: 3.5 * MB })
  })
})

describe('보정 — Figma 가 다시 넣는 몫만', () => {
  it('비율 = (PDF 안 실제 − 우리 JPEG) / (우리 셈 − 우리 JPEG). 못 재면 1, 터무니없으면 잘라 낸다', () => {
    expect(calibrationRatio(9 * MB, 18 * MB)).toBeCloseTo(0.5)
    expect(calibrationRatio(10 * MB, { total: 18 * MB, jpeg: 6 * MB })).toBeCloseTo(1 / 3)
    expect(calibrationRatio(0, 18 * MB)).toBe(1)
    expect(calibrationRatio(9 * MB, 0)).toBe(1)
    expect(calibrationRatio(9 * MB, { total: 9 * MB, jpeg: 9 * MB })).toBe(1)
    expect(calibrationRatio(1 * MB, 100 * MB)).toBe(0.05)
    expect(calibrationRatio(100 * MB, 1 * MB)).toBe(2)
  })

  it('우리 JPEG 는 그대로 더하고 나머지에만 비율을 곱한다', () => {
    expect(predictSize(1 * MB, 20 * MB, 0.5)).toBe(11 * MB)
    expect(predictSize(1 * MB, { total: 20 * MB, jpeg: 5 * MB }, 0.5)).toBe(13.5 * MB)
    // 우리 셈 18MB 가 PDF 안에서는 9MB — 보정 없이는 넘치고, 보정하면 10MB 안에 든다
    const outcome = chooseProfile([probe(4, 18 * MB)], 1 * MB, 10 * MB, 30 * MB, 0.5)
    expect(outcome).toEqual({ kind: 'fits', profile: PROFILE_LADDER[4], predicted: 10 * MB })
    expect(chooseProfile([probe(4, 18 * MB)], 1 * MB, 10 * MB, 30 * MB).kind).toBe('unreachable')
  })

  it('JPEG 가 많은 후보는 비율 덕을 못 본다 — 실측 5.8 예측이 8.0 으로 나온 그 경우', () => {
    const heavyJpeg: Probe = {
      profile: PROFILE_LADDER[4],
      bytes: { total: 18 * MB, jpeg: 12 * MB }
    }
    expect(predictSize(1 * MB, heavyJpeg.bytes, 0.2)).toBeCloseTo(14.2 * MB)
    // 기준 60MB × 0.2 = 13MB 라 목표를 넘고, 유일한 후보도 14.2MB 라 못 맞춘다
    expect(chooseProfile([heavyJpeg], 1 * MB, 10 * MB, 60 * MB, 0.2).kind).toBe('unreachable')
  })
})
