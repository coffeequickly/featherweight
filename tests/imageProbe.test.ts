// 목표 용량 예측이 export 와 같은 눈으로 세는가.

import { describe, expect, it } from 'vitest'

import { CROP_RULES } from '../src/lib/imageCrop'
import { Encoded, EncodedLookup, probeItemsFrom, tallyProbe } from '../src/lib/imageProbe'
import { applyProfile, PROFILE_LADDER } from '../src/lib/fitToSize'
import { KEEP_BYTES_FLOOR } from '../src/lib/imageTarget'
import { DEFAULT_SETTINGS } from '../src/lib/types'
import { CropRect, ImageProbeItem, ImageUsage } from '../src/lib/types'

const SETTINGS = { multiplier: 1.5 as const, maxEdge: 1920 as const, minEdge: 640 as const }
const source = { width: 3000, height: 4000 }
const sizes = { photo: source }
const seen = new Map([['photo', { longEdge: 4000, bytes: 3_000_000 }]])

const crop = (
  nodeId: string,
  box: number,
  fx: number,
  fy: number,
  tx: number,
  ty: number
): ImageUsage => ({
  nodeId,
  imageHash: 'photo',
  name: nodeId,
  width: box,
  height: box,
  scaleMode: 'CROP',
  visible: 1,
  fillIndex: 0,
  crop: { x: fx, y: fy },
  cropTransform: [
    [fx, 0, tx],
    [0, fy, ty]
  ]
})
const whole = (nodeId: string): ImageUsage => ({
  nodeId,
  imageHash: 'photo',
  name: nodeId,
  width: 150,
  height: 200,
  scaleMode: 'FILL',
  visible: 1,
  fillIndex: 0,
  paintRotation: 0,
  localSize: { width: 150, height: 200 }
})
const A = crop('A', 100, 0.1, 0.075, 0.45, 0.4625)

describe('probeItemsFrom — 쪽마다 하나, 조각 계획을 들고', () => {
  it('잘라 쓴 자리만 있는 쪽은 조각 계획이 붙고, 전체가 보이는 자리가 있는 쪽은 W₀ 뿐이다', () => {
    const [cropped] = probeItemsFrom([A], SETTINGS, sizes, seen)
    expect(cropped).toMatchObject({
      imageHash: 'photo',
      targetLongEdge: 1920,
      skip: false,
      originalBytes: 3_000_000
    })
    expect(cropped.pieces).toHaveLength(1)
    expect(cropped.densityGain).toBeGreaterThan(1)
    const [plain] = probeItemsFrom([A, whole('E')], SETTINGS, sizes, seen)
    expect(plain.pieces).toBeUndefined()
  })

  it('기준 패스에서 못 본 이미지는 셀 근거가 없어 뺀다', () => {
    expect(probeItemsFrom([A], SETTINGS, sizes, new Map())).toEqual([])
  })
})

const rect: CropRect = { x0: 1349, y0: 1849, w: 302, h: 302 }
const item = (extra: Partial<ImageProbeItem> = {}): ImageProbeItem => ({
  imageHash: 'photo',
  targetLongEdge: 1920,
  skip: false,
  originalBytes: 3_000_000,
  ...extra
})
const lookup = (
  wholeBytes: Encoded | 'original' | null,
  pieceBytes: Array<Encoded | null>
): EncodedLookup => {
  let at = 0
  return { whole: () => wholeBytes, piece: () => pieceBytes[at++] ?? null }
}

describe('tallyProbe — export 와 같은 규칙으로 더한다', () => {
  it('조각 합이 충분히 작으면 조각으로, 아니면 W₀ 로 센다', () => {
    const w: Encoded = { bytes: 500_000, mime: 'image/jpeg' }
    const small = tallyProbe(
      [item({ pieces: [{ targetLongEdge: 640, crop: rect }], densityGain: 1 })],
      lookup(w, [{ bytes: 300_000, mime: 'image/jpeg' }])
    )
    expect(small).toEqual({
      totalBytes: 300_000,
      jpegBytes: 300_000,
      failed: 0,
      cropped: 1,
      recovered: 0
    })
    const tooClose = tallyProbe(
      [item({ pieces: [{ targetLongEdge: 640, crop: rect }], densityGain: 1 })],
      lookup(w, [
        { bytes: 500_000 * (1 - CROP_RULES.minSavingSameDensity) + 1, mime: 'image/jpeg' }
      ])
    )
    expect(tooClose).toMatchObject({ totalBytes: 500_000, cropped: 0 })
  })

  it('조각이 하나라도 안 재졌으면 W₀ — export 의 복구와 같은 규칙, recovered 로 센다', () => {
    const w: Encoded = { bytes: 500_000, mime: 'image/jpeg' }
    const tally = tallyProbe(
      [
        item({
          pieces: [
            { targetLongEdge: 640, crop: rect },
            { targetLongEdge: 640, crop: rect }
          ],
          densityGain: 1
        })
      ],
      lookup(w, [{ bytes: 1000, mime: 'image/jpeg' }, null])
    )
    expect(tally).toEqual({
      totalBytes: 500_000,
      jpegBytes: 500_000,
      failed: 0,
      cropped: 0,
      recovered: 1
    })
  })

  it('손 안 대는 항목·캐시에 없는 항목·W₀ 가 원본보다 안 작은 항목은 원본으로 — 조각은 보지 않는다', () => {
    const pieces = [{ targetLongEdge: 640, crop: rect }]
    expect(
      tallyProbe(
        [item({ skip: true, pieces })],
        lookup({ bytes: 1, mime: 'image/jpeg' }, [{ bytes: 1, mime: 'image/jpeg' }])
      )
    ).toMatchObject({ totalBytes: 3_000_000, cropped: 0 })
    expect(
      tallyProbe(
        [item({ originalBytes: KEEP_BYTES_FLOOR, pieces })],
        lookup({ bytes: 1, mime: 'image/jpeg' }, [])
      )
    ).toMatchObject({ totalBytes: KEEP_BYTES_FLOOR })
    expect(tallyProbe([item({ pieces })], lookup(null, []))).toMatchObject({
      totalBytes: 3_000_000,
      failed: 1
    })
    expect(
      tallyProbe([item({ pieces })], lookup('original', [{ bytes: 1, mime: 'image/jpeg' }]))
    ).toMatchObject({ totalBytes: 3_000_000, cropped: 0 })
    expect(
      tallyProbe([item({ pieces })], lookup({ bytes: 3_000_000, mime: 'image/jpeg' }, []))
    ).toMatchObject({ totalBytes: 3_000_000, cropped: 0 })
  })

  it('같은 원본을 쪽마다 다르게 쓰면 쪽마다 따로 — 한 쪽은 조각, 한 쪽은 W₀', () => {
    const w: Encoded = { bytes: 500_000, mime: 'image/jpeg' }
    const tally = tallyProbe(
      [item({ pieces: [{ targetLongEdge: 640, crop: rect }], densityGain: 1 }), item()],
      lookup(w, [{ bytes: 200_000, mime: 'image/jpeg' }])
    )
    expect(tally).toEqual({
      totalBytes: 700_000,
      jpegBytes: 700_000,
      failed: 0,
      cropped: 1,
      recovered: 0
    })
  })

  it('PNG 로 남긴 조각은 JPEG 몫에 넣지 않는다', () => {
    const w: Encoded = { bytes: 500_000, mime: 'image/png' }
    const tally = tallyProbe(
      [item({ pieces: [{ targetLongEdge: 640, crop: rect }], densityGain: 1 })],
      lookup(w, [{ bytes: 100_000, mime: 'image/png' }])
    )
    expect(tally).toMatchObject({ totalBytes: 100_000, jpegBytes: 0, cropped: 1 })
  })
})

describe('크롭이 예측에 들어가면 더 선명한 프로필이 목표에 든다', () => {
  it('W₀ 로만 세면 기준에 머물지만, 조각으로 세면 위 칸이 목표 안이다', async () => {
    const { chooseProfile, PROFILE_LADDER, BASELINE_INDEX } = await import('../src/lib/fitToSize')
    const fixed = 1_000_000
    const target = 1_700_000
    const sharper = PROFILE_LADDER[BASELINE_INDEX - 1]
    const baseline = PROFILE_LADDER[BASELINE_INDEX]
    const pieces = [{ targetLongEdge: 640, crop: rect }]
    // 위 칸(더 선명)에서 W₀ 는 900K, 조각은 300K
    const w: Encoded = { bytes: 900_000, mime: 'image/jpeg' }
    const withCrops = tallyProbe(
      [item({ pieces, densityGain: 1 })],
      lookup(w, [{ bytes: 300_000, mime: 'image/jpeg' }])
    )
    const wholeOnly = tallyProbe([item()], lookup(w, []))
    const baselineBytes = { total: 600_000, jpeg: 600_000 } // 기준 칸은 이미 목표 안

    const chosenWith = chooseProfile(
      [{ profile: sharper, bytes: { total: withCrops.totalBytes, jpeg: withCrops.jpegBytes } }],
      fixed,
      target,
      baselineBytes
    )
    const chosenWithout = chooseProfile(
      [{ profile: sharper, bytes: { total: wholeOnly.totalBytes, jpeg: wholeOnly.jpegBytes } }],
      fixed,
      target,
      baselineBytes
    )

    expect(chosenWith).toMatchObject({ kind: 'fits', profile: sharper, predicted: fixed + 300_000 })
    expect(chosenWithout).toMatchObject({ kind: 'already-small' })
    expect(baseline).toBeDefined()
  })
})

describe('잘라 넣기 끄기', () => {
  it('cropToVisible 이 꺼지면 예측 항목에 조각 계획이 없다 — 내보내기와 같은 눈', () => {
    const [item] = probeItemsFrom([A], SETTINGS, sizes, seen, false)
    expect(item.pieces).toBeUndefined()
    expect(item.densityGain).toBeUndefined()
  })
})

describe('조각 관문은 사다리 칸마다 다르다 — 목표 용량 탐색이 더 선명한 칸을 걸러선 안 되는 이유', () => {
  it('4096² 원본에 25% 창 여섯: 기준 칸(2048)은 픽셀 합 관문에 걸려 통째, 한 칸 위(2560)는 조각 계획', () => {
    const square = { big: { width: 4096, height: 4096 } }
    const seenBig = new Map([['big', { longEdge: 4096, bytes: 5_000_000 }]])
    const usages: ImageUsage[] = []
    for (const [i, x] of [0.05, 0.37, 0.69].entries()) {
      for (const [j, y] of [0.05, 0.65].entries()) {
        usages.push({ ...crop(`n${i}${j}`, 400, 0.25, 0.25, x, y), imageHash: 'big' })
      }
    }
    const at = (index: number) =>
      probeItemsFrom(usages, applyProfile(DEFAULT_SETTINGS, PROFILE_LADDER[index]), square, seenBig)
    const baseline = at(3)
    const sharper = at(2)
    expect(baseline).toHaveLength(1)
    expect(baseline[0].pieces).toBeUndefined()
    expect(sharper[0].pieces).toHaveLength(6)
  })
})
