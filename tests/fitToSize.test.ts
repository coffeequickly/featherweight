import { describe, expect, it } from 'vitest'

import {
  BASELINE_INDEX,
  calibrationRatio,
  candidateIndices,
  chooseProfile,
  clampTargetMb,
  describeProfile,
  fixedBytes,
  probeOrder,
  retryCandidates,
  MAX_FIT_RETRIES,
  decideFit,
  FIGMA_JPEG_QUALITY,
  fitAttemptPlan,
  resolveSave,
  savedSource,
  MAX_QUALITY,
  MIN_MIN_EDGE,
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

describe('보정 — 기준 패스를 Figma 품질로 잰 값 대비 PDF 안 실제', () => {
  it('비율 = PDF 안 실제 / 기준 패스 측정값. 못 재면 1, 터무니없으면 잘라 낸다', () => {
    expect(calibrationRatio(9 * MB, 18 * MB)).toBeCloseTo(0.5)
    expect(calibrationRatio(10 * MB, { total: 18 * MB, jpeg: 6 * MB })).toBeCloseTo(10 / 18)
    // 예측 = 고정분 + 보정비 × 전체 — JPEG 몫을 따로 더하지 않는다(Figma 가 다시 인코딩한다)
    expect(predictSize(1 * MB, { total: 2 * MB, jpeg: 1 * MB }, 0.5)).toBe(2 * MB)
    expect(calibrationRatio(0, 18 * MB)).toBe(1)
    expect(calibrationRatio(9 * MB, 0)).toBe(1)
    expect(calibrationRatio(9 * MB, { total: 9 * MB, jpeg: 9 * MB })).toBe(1)
    expect(calibrationRatio(1 * MB, 100 * MB)).toBe(0.05)
    expect(calibrationRatio(100 * MB, 1 * MB)).toBe(2)
  })

  it('보정비는 전체에 고르게 곱한다 — 재는 값이 이미 Figma 품질이라 JPEG 몫을 따로 두지 않는다', () => {
    expect(predictSize(1 * MB, 20 * MB, 0.5)).toBe(11 * MB)
    expect(predictSize(1 * MB, { total: 20 * MB, jpeg: 5 * MB }, 0.5)).toBe(11 * MB)
    // 우리 셈 18MB 가 PDF 안에서는 9MB — 보정 없이는 넘치고, 보정하면 10MB 안에 든다
    const outcome = chooseProfile([probe(4, 18 * MB)], 1 * MB, 10 * MB, 30 * MB, 0.5)
    expect(outcome).toEqual({ kind: 'fits', profile: PROFILE_LADDER[4], predicted: 10 * MB })
    expect(chooseProfile([probe(4, 18 * MB)], 1 * MB, 10 * MB, 30 * MB).kind).toBe('unreachable')
  })

  it('옛 사고(예측 5.8MB → 실제 8.0MB)의 원인이던 JPEG 분리는 없다 — 그 전제(우리 JPEG 는 그대로 실린다)가 틀렸다', () => {
    // 그때는 우리 품질의 JPEG 바이트를 그대로 더해 품질 높은 후보를 과하게, 낮은 후보를 적게 예측했다.
    // 지금은 후보 출력을 Figma 품질(76)로 다시 인코딩한 크기를 재므로 한 비율로 충분하다(실측 근거는 fitToSize.ts)
    const heavyJpeg: Probe = {
      profile: PROFILE_LADDER[4],
      bytes: { total: 18 * MB, jpeg: 12 * MB }
    }
    expect(predictSize(1 * MB, heavyJpeg.bytes, 0.2)).toBeCloseTo(4.6 * MB)
    expect(FIGMA_JPEG_QUALITY).toBe(0.76)
  })
})

describe('PROFILE_LADDER 의 하한', () => {
  it('맨 아래칸은 640 까지 내려간다', () => {
    // 사용자의 minEdge 를 빌려 쓰던 시절, targetFor 가 그 값을 무시하고 640 을 하드코딩해서
    // 아무 일도 없었다. 하한이 실제로 동작하게 된 뒤로는 사다리가 제 하한을 들어야
    // 최소를 올려 둔 사용자에게도 목표 용량이 예전만큼 줄어든다.
    const last = PROFILE_LADDER[PROFILE_LADDER.length - 1]
    expect(last.minEdge).toBe(MIN_MIN_EDGE)
    expect(last.minEdge).toBe(640)
  })

  it('아래로 갈수록 하한이 낮아지기만 한다', () => {
    for (let i = 1; i < PROFILE_LADDER.length; i += 1) {
      expect(PROFILE_LADDER[i].minEdge).toBeLessThanOrEqual(PROFILE_LADDER[i - 1].minEdge)
    }
  })

  it('어느 칸도 하한이 상한을 넘지 않는다', () => {
    for (const profile of PROFILE_LADDER) {
      expect(profile.minEdge).toBeLessThanOrEqual(profile.maxEdge)
    }
  })
})

describe('probeOrder — 잘라 넣기가 켜져 있으면 기준이 목표를 넘어도 더 선명한 칸을 재본다', () => {
  it('기준 안이면 선명한 쪽만, 넘으면 센 쪽만 — 잘라 넣기 켬이면 선명한 쪽을 앞에 세운다', () => {
    expect(probeOrder(BASELINE_INDEX, true, false)).toEqual([0, 1, 2])
    expect(probeOrder(BASELINE_INDEX, true, true)).toEqual([0, 1, 2])
    expect(probeOrder(BASELINE_INDEX, false, false)).toEqual([4, 5, 6, 7])
    expect(probeOrder(BASELINE_INDEX, false, true)).toEqual([0, 1, 2, 4, 5, 6, 7])
  })

  it('같은 계획·다른 채택 — 기준은 절감 부족으로 전체본 1,000KB, 한 칸 위는 조각 980KB. 목표 990KB 면 위 칸이 답이다', () => {
    const KB = 1000
    // 재본 값(검토 재현 — 실측 아님). 기준(3번 칸)은 1,000KB
    const probes: Probe[] = [
      { profile: PROFILE_LADDER[2], bytes: { total: 980 * KB, jpeg: 980 * KB } },
      { profile: PROFILE_LADDER[4], bytes: { total: 900 * KB, jpeg: 900 * KB } }
    ]
    const outcome = chooseProfile(probes, 0, 990 * KB, { total: 1000 * KB, jpeg: 1000 * KB })
    expect(outcome.kind).toBe('fits')
    if (outcome.kind === 'fits') expect(sharpnessOrder(outcome.profile, PROFILE_LADDER[2])).toBe(0)
  })
})

describe('describeProfile — 콘솔에 적는 자동 선택 설정(화면 문구는 i18n 이 조립)', () => {
  it('배율·최대·최소·품질을 한 줄로, PNG 를 그대로 두는 맨 위 칸만 표시가 붙는다', () => {
    expect(describeProfile({ ...PROFILE_LADDER[6], quality: 0.74 })).toBe('1.1x max1280 min640 q74')
    expect(describeProfile(PROFILE_LADDER[0])).toBe('2x max4096 min1024 q92 keep-png')
  })
})

describe('retryCandidates — 실제 크기가 목표를 넘었을 때 다음 후보', () => {
  it('같은 해상도에서 품질 −0.04 가 먼저, 그다음 사다리 아래 칸 — 상한 두 개', () => {
    const rung5 = PROFILE_LADDER[5]
    const next = retryCandidates(rung5)
    expect(next).toHaveLength(Math.min(2, MAX_FIT_RETRIES))
    expect(next[0]).toEqual({ ...rung5, quality: 0.68 })
    expect(next[1]).toEqual(PROFILE_LADDER[6])
  })

  it('품질만 올린 변형이 뽑혔으면 같은 해상도의 한 단계 아래 품질부터, 그다음은 그보다 덜 선명한 칸 — 같은 설정 두 번 없음', () => {
    const variant = { ...PROFILE_LADDER[5], quality: 0.76 }
    expect(retryCandidates(variant)).toEqual([
      { ...PROFILE_LADDER[5], quality: 0.72 },
      PROFILE_LADDER[6]
    ])
    const plan = fitAttemptPlan(variant)
    expect(plan).toHaveLength(1 + MAX_FIT_RETRIES)
    for (let i = 0; i < plan.length; i += 1)
      for (let j = i + 1; j < plan.length; j += 1)
        expect(sharpnessOrder(plan[i], plan[j])).toBeLessThan(0)
  })

  it('맨 아래 칸(품질 바닥)이면 뽑아 볼 것이 없다', () => {
    expect(retryCandidates(PROFILE_LADDER[PROFILE_LADDER.length - 1])).toEqual([])
  })
})

describe('decideFit — 저장할 PDF 와 결과 상태는 실제 바이트로 정한다', () => {
  const target = 5_242_880
  const baseline = PROFILE_LADDER[3]
  const sharper = PROFILE_LADDER[2]

  it('기준이 목표 안인데 더 선명한 후보와 재시도가 전부 넘치면 기준본을 복구해 저장한다 — already-small', () => {
    const plan = fitAttemptPlan(sharper)
    const actuals = [6_300_000, 6_200_000, 6_000_000] // 대역 실측 — 전부 초과
    const attempts = plan.map((profile, i) => ({ profile, actual: actuals[i] }))
    const decision = decideFit(
      target,
      { profile: baseline, actual: 4_900_000 },
      attempts,
      true,
      'fits'
    )
    expect(decision).toEqual({ save: 'best', profile: baseline, outcome: 'already-small' })
  })

  it('마지막 시도가 목표 안이면 그것 — fits', () => {
    const attempts = [
      { profile: sharper, actual: 6_300_000 },
      { profile: { ...sharper, quality: 0.8 }, actual: 5_100_000 }
    ]
    const decision = decideFit(
      target,
      { profile: baseline, actual: 4_900_000 },
      attempts,
      true,
      'fits'
    )
    expect(decision).toEqual({ save: 'last', profile: attempts[1].profile, outcome: 'fits' })
  })

  it('예측은 unreachable 이어도 최종 실측이 목표 안이면 fits — 결과 화면은 실물을 따른다', () => {
    const smallest = PROFILE_LADDER[PROFILE_LADDER.length - 1]
    const decision = decideFit(
      target,
      { profile: baseline, actual: 6_000_000 },
      [{ profile: smallest, actual: 5_000_000 }],
      false,
      'unreachable'
    )
    expect(decision.outcome).toBe('fits')
    expect(decision.save).toBe('last')
  })

  it('아무것도 못 들면 — 재시도가 있었으면 missed, 사다리 바닥이라 없었으면 unreachable', () => {
    const smallest = PROFILE_LADDER[PROFILE_LADDER.length - 1]
    expect(
      decideFit(
        target,
        { profile: baseline, actual: 6_000_000 },
        [{ profile: smallest, actual: 5_500_000 }],
        false,
        'unreachable'
      ).outcome
    ).toBe('unreachable')
    expect(
      decideFit(
        target,
        { profile: baseline, actual: 6_000_000 },
        [
          { profile: PROFILE_LADDER[5], actual: 5_500_000 },
          { profile: PROFILE_LADDER[6], actual: 5_300_000 }
        ],
        true,
        'fits'
      ).outcome
    ).toBe('missed')
  })

  it('최종 패스가 없으면 기준 실측으로 — 기준이 목표 안이면 already-small', () => {
    expect(
      decideFit(target, { profile: baseline, actual: 4_900_000 }, [], false, 'already-small')
        .outcome
    ).toBe('already-small')
  })

  it('UI 가 저장할 슬롯 — 새 조각이 오면 그것, 아니면 메인이 고른 보관본 또는 마지막 측정본', () => {
    expect(savedSource(true, true, true)).toBe('arrived')
    expect(savedSource(false, true, true)).toBe('best')
    expect(savedSource(false, false, true)).toBe('stash')
    expect(savedSource(false, true, false)).toBe('stash')
  })
})

describe('resolveSave — 마지막 패스의 병합·측정이 실패했을 때', () => {
  const target = 5_242_880
  const baseline = PROFILE_LADDER[3]
  const sharper = PROFILE_LADDER[2]

  it('첫 최종 후보의 측정이 실패해도 기준본이 목표 안이면 보관본을 저장하고 기준 설정으로 적는다', () => {
    const decision = decideFit(target, { profile: baseline, actual: 4_900_000 }, [], true, 'fits')
    expect(resolveSave(decision, true, true, sharper)).toEqual({
      saveBest: true,
      profile: baseline
    })
  })

  it('보관본이 없으면 저장되는 것은 실패한 후보의 재병합본 — 설정도 그것으로', () => {
    const decision = decideFit(target, { profile: baseline, actual: 6_000_000 }, [], true, 'fits')
    expect(resolveSave(decision, true, false, sharper)).toEqual({
      saveBest: false,
      profile: sharper
    })
  })

  it('측정이 실패하지 않았으면 decideFit 그대로', () => {
    const decision = decideFit(
      target,
      { profile: baseline, actual: 4_900_000 },
      [{ profile: sharper, actual: 6_300_000 }],
      true,
      'fits'
    )
    expect(resolveSave(decision, false, true, null)).toEqual({ saveBest: true, profile: baseline })
  })
})
