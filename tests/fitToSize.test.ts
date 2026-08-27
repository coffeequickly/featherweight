import { describe, expect, it } from 'vitest'

import {
  BASELINE_INDEX,
  candidateIndices,
  chooseProfile,
  clampTargetMb,
  fixedBytes,
  MAX_TARGET_MB,
  mbToBytes,
  MIN_MAX_EDGE,
  MIN_MULTIPLIER,
  MIN_QUALITY,
  MIN_TARGET_MB,
  predictSize,
  PROFILE_LADDER,
  Probe
} from '../src/lib/fitToSize'

const MB = 1024 * 1024

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

  it('기준이 이미 목표보다 작으면 그대로 둔다 (AC5)', () => {
    const outcome = chooseProfile([], fixed, 10 * MB, 2 * MB)
    expect(outcome.kind).toBe('already-small')
    expect(outcome.predicted).toBe(3 * MB)
  })

  it('목표를 만족하는 후보 중 가장 화질 좋은 것을 고른다 (AC2)', () => {
    // 기준(index 3)은 9MB 로 목표 초과. 4 번은 6MB, 5 번은 3MB → 4 번이 정답
    const probes: Probe[] = [
      { profileIndex: 5, imageBytes: 2 * MB },
      { profileIndex: 4, imageBytes: 5 * MB },
      { profileIndex: 6, imageBytes: 1 * MB }
    ]
    const outcome = chooseProfile(probes, fixed, 7 * MB, 8 * MB)

    expect(outcome.kind).toBe('fits')
    if (outcome.kind === 'fits') {
      expect(outcome.profileIndex).toBe(4)
      expect(outcome.predicted).toBe(6 * MB)
    }
  })

  it('probes 순서가 뒤섞여 있어도 결과가 같다', () => {
    const shuffled: Probe[] = [
      { profileIndex: 6, imageBytes: 1 * MB },
      { profileIndex: 4, imageBytes: 5 * MB },
      { profileIndex: 5, imageBytes: 2 * MB }
    ]
    const outcome = chooseProfile(shuffled, fixed, 7 * MB, 8 * MB)
    if (outcome.kind === 'fits') expect(outcome.profileIndex).toBe(4)
  })

  it('아무 후보도 목표를 못 맞추면 최소 품질 결과와 하한을 준다 (AC4)', () => {
    const probes: Probe[] = [
      { profileIndex: 4, imageBytes: 5 * MB },
      { profileIndex: 7, imageBytes: 3 * MB }
    ]
    const outcome = chooseProfile(probes, fixed, 1 * MB, 8 * MB)

    expect(outcome.kind).toBe('unreachable')
    if (outcome.kind === 'unreachable') {
      expect(outcome.profileIndex).toBe(7) // 사다리에서 가장 작은 것
      expect(outcome.predicted).toBe(4 * MB) // 고정분 1MB + 이미지 3MB = 하한
    }
  })

  it('고정분만으로 목표를 넘으면 이미지를 다 줄여도 불가능하다', () => {
    // 텍스트 위주 문서: 고정분 5MB, 이미지는 이미 작다
    const probes: Probe[] = [{ profileIndex: 7, imageBytes: 0.2 * MB }]
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
    const indices = candidateIndices(BASELINE_INDEX)
    expect(indices[0]).toBe(BASELINE_INDEX + 1)
    expect(indices).not.toContain(BASELINE_INDEX)
    expect(indices[indices.length - 1]).toBe(PROFILE_LADDER.length - 1)
  })

  it('사다리 끝이 기준이면 잴 후보가 없다', () => {
    expect(candidateIndices(PROFILE_LADDER.length - 1)).toEqual([])
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
