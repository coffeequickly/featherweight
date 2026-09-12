// 이미지 탭 목록 — 어떤 그림이 몇 px 에서 몇 px 이 되는지.
//
// 이 목록이 설정 설명을 대신한다. 숫자가 틀리면 화면 전체가 거짓말이 되므로,
// 실제 export 와 같은 규칙(skipFloor · planImageTargets)을 쓰는지 여기서 못 박는다.

import { describe, expect, it } from 'vitest'

import { imageRoster } from '../src/lib/preflight'
import { DEFAULT_SETTINGS, ImageUsage, Preflight, Settings } from '../src/lib/types'

const SETTINGS: Settings = { ...DEFAULT_SETTINGS, multiplier: 1.5, maxEdge: 1920, minEdge: 640 }

function usage(hash: string, name: string, width: number, height = width): ImageUsage {
  return {
    nodeId: `node-${hash}`,
    imageHash: hash,
    name,
    width,
    height,
    scaleMode: 'FILL',
    visible: 1
  }
}

/** A4 세로 한 장 — 긴 변 842pt. 균형(1.5×)이면 기준선 1263px */
function sheet(images: ImageUsage[], edges: Record<string, number>): Preflight {
  return {
    frames: [{ id: 'f1', longEdge: 842, images }],
    imageEdges: edges,
    textRejects: []
  }
}

describe('imageRoster', () => {
  it('원본과 목표를 함께 준다 — 표시 크기 × 배율', () => {
    const roster = imageRoster(sheet([usage('h', '표지 배경', 842)], { h: 3024 }), SETTINGS)
    expect(roster).toHaveLength(1)
    expect(roster[0]).toMatchObject({
      name: '표지 배경',
      original: 3024,
      target: 1263,
      kept: false
    })
  })

  it('기준선 이하는 그대로 나간다 — 로고·아이콘', () => {
    const roster = imageRoster(sheet([usage('logo', '로고', 60)], { logo: 512 }), SETTINGS)
    expect(roster[0]).toMatchObject({ name: '로고', original: 512, kept: true })
  })

  it('원본이 목표보다 작으면 확대하지 않는다 — 그대로', () => {
    const roster = imageRoster(sheet([usage('h', '작은 사진', 842)], { h: 900 }), SETTINGS)
    expect(roster[0]).toMatchObject({ target: 1263, kept: true })
  })

  it('같은 사진을 여러 자리에 쓰면 가장 크게 쓰는 자리에 맞춘다', () => {
    const roster = imageRoster(
      sheet([usage('h', '작게 쓴 자리', 100), usage('h', '크게 쓴 자리', 800)], { h: 4000 }),
      SETTINGS
    )
    expect(roster).toHaveLength(1)
    expect(roster[0]).toMatchObject({ name: '크게 쓴 자리', target: 1200 })
  })

  it('배율을 올리면 목표가 따라 오른다', () => {
    const doc = sheet([usage('h', '사진', 1200)], { h: 6000 })
    expect(imageRoster(doc, { ...SETTINGS, multiplier: 1 })[0].target).toBe(1200)
    expect(imageRoster(doc, { ...SETTINGS, multiplier: 3, maxEdge: 3840 })[0].target).toBe(3600)
  })

  it('한 장 상한이 배율을 이기면 그 사실을 표시한다', () => {
    const doc = sheet([usage('h', '사진', 1600)], { h: 6000 })
    // 1600 × 1.5 = 2400 인데 상한이 1920 이다
    const capped = imageRoster(doc, { ...SETTINGS, maxEdge: 1920 })[0]
    expect(capped).toMatchObject({ target: 1920, capped: true })

    const free = imageRoster(doc, { ...SETTINGS, maxEdge: 3840 })[0]
    expect(free).toMatchObject({ target: 2400, capped: false })
  })

  it('크기를 아직 못 읽었으면 원본이 null 이고 "그대로" 라고 단정하지 않는다', () => {
    const roster = imageRoster(sheet([usage('h', '읽는 중', 842)], {}), SETTINGS)
    expect(roster[0]).toMatchObject({ original: null, kept: false })
  })

  it('줄어드는 것이 먼저, 그 안에서 큰 것부터. 그대로 나가는 것은 뒤로', () => {
    const roster = imageRoster(
      sheet([usage('a', '작은 사진', 842), usage('b', '큰 사진', 842), usage('c', '로고', 60)], {
        a: 2000,
        b: 4000,
        c: 512
      }),
      SETTINGS
    )
    expect(roster.map((row) => row.name)).toEqual(['큰 사진', '작은 사진', '로고'])
  })
})

describe('설정을 바꿔도 흔들리지 않는 것', () => {
  /** 같은 그림이 두 프레임에 다른 이름·다른 크기로 놓인 문서 */
  function twoFrames(): Preflight {
    return {
      frames: [
        { id: 'f1', longEdge: 1920, images: [usage('h', '20191111_222551_IMG_3026', 900)] },
        { id: 'f2', longEdge: 1920, images: [usage('h', 'Background', 1600)] }
      ],
      imageEdges: { h: 4096 },
      textRejects: []
    }
  }

  it('이름은 가장 크게 놓인 자리를 따른다 — 상한을 올려도 안 바뀐다', () => {
    // 실기 제보: 최대를 3840 → 5120 으로 올리자 대표 그림 이름이 갈아치워졌다.
    // 예전에는 "목표가 가장 큰 자리" 를 골랐는데 목표는 설정을 타서 승자가 바뀌었다.
    const low = imageRoster(twoFrames(), { ...SETTINGS, multiplier: 2, maxEdge: 3840 })
    const high = imageRoster(twoFrames(), { ...SETTINGS, multiplier: 2, maxEdge: 5120 })

    expect(low[0].name).toBe('Background')
    expect(high[0].name).toBe('Background')
    expect(low[0].name).toBe(high[0].name)
  })

  it('목표는 여전히 가장 큰 자리를 따른다', () => {
    const roster = imageRoster(twoFrames(), { ...SETTINGS, multiplier: 2, maxEdge: 5120 })
    // 1600pt 자리 × 2배 = 3200px (900pt 자리의 1800px 이 아니라)
    expect(roster[0].target).toBe(3200)
  })

  it('레이어는 두 프레임 것을 모두 모은다', () => {
    const roster = imageRoster(twoFrames(), SETTINGS)
    expect(roster[0].nodeIds).toEqual(['node-h'])
  })
})

describe('쓰는 영역 · 잘라냄 — 목록의 숫자는 export 의 계획과 같다', () => {
  const sizes = {
    crop: { width: 3000, height: 4000 },
    band: { width: 3000, height: 4000 },
    whole: { width: 3000, height: 4000 }
  }
  /** 창 10%×7.5% 를 100px 상자에 — 감싸는 사각형 302×302(여백 1px) */
  const cropped: ImageUsage = {
    ...usage('crop', 'crop', 100),
    scaleMode: 'CROP',
    fillIndex: 0,
    crop: { x: 0.1, y: 0.075 },
    cropTransform: [
      [0.1, 0, 0.45],
      [0, 0.075, 0.4625]
    ]
  }
  /** 가로띠 FILL — 세로의 25% 만 보인다, 감싸는 사각형 3000×1002 */
  const band: ImageUsage = {
    ...usage('band', 'band', 300, 100),
    fillIndex: 0,
    localSize: { width: 300, height: 100 }
  }
  const whole: ImageUsage = {
    ...usage('whole', 'whole', 150, 200),
    fillIndex: 0,
    localSize: { width: 150, height: 200 }
  }
  const unknown: ImageUsage = {
    ...usage('unknown', 'unknown', 300, 100),
    fillIndex: 0,
    localSize: { width: 300, height: 100 }
  }
  function sheetOf(images: ImageUsage[], settings = SETTINGS) {
    const preflight = {
      frames: [{ id: 'f', longEdge: 842, images }],
      imageEdges: { crop: 4000, band: 4000, whole: 4000, unknown: 4000, photo: 4000 },
      imageSizes: { ...sizes, photo: sizes.crop }
    } as unknown as Preflight
    return Object.fromEntries(imageRoster(preflight, settings).map((row) => [row.imageHash, row]))
  }

  it('일부만 쓰는 자리는 쓰는 영역 비와 조각(저장 긴 변·버리는 비·픽셀), 통째로 쓰는 자리는 조각이 없다', () => {
    const rows = sheetOf([cropped, band, whole, unknown])
    expect(rows.crop.partial).toBe(true)
    expect(rows.crop.used).toBeCloseTo(0.0075, 6)
    expect(rows.crop.crop).toEqual({
      target: 302,
      cut: 1 - (302 * 302) / 12_000_000,
      width: 302,
      height: 302
    })
    expect(rows.crop.pixels).toBe(12_000_000)
    expect(rows.crop.storedPixels).toBe(302 * 302)

    expect(rows.band.partial).toBe(true)
    expect(rows.band.used).toBeCloseTo(0.25, 6)
    expect(rows.band.crop?.target).toBe(640)
    expect(rows.band.crop?.cut).toBeCloseTo(1 - (3000 * 1002) / 12_000_000, 6)
    expect(rows.band.crop?.width).toBe(640)
    expect(rows.band.storedPixels).toBe(640 * (rows.band.crop?.height ?? 0))

    expect(rows.whole.partial).toBe(false)
    expect(rows.whole.used).toBe(1)
    expect(rows.whole.crop).toBeNull()
    expect(rows.whole.storedPixels).toBe(480 * 640) // 통째 W₀ = scaledSize(3000×4000, 640)

    // 크기를 모르면 아무것도 단정하지 않는다
    expect(rows.unknown).toMatchObject({
      partial: false,
      used: null,
      crop: null,
      pixels: null,
      storedPixels: null
    })
  })

  it('같은 그림을 통째로 쓰는 자리가 하나라도 있으면 조각이 없다 — 규칙상 W₀ 가 남아야 해서', () => {
    const small: ImageUsage = {
      ...usage('photo', 'whole', 60, 80),
      nodeId: 'b',
      fillIndex: 0,
      localSize: { width: 60, height: 80 }
    }
    const rows = sheetOf([{ ...cropped, imageHash: 'photo', nodeId: 'a' }, small])
    expect(rows.photo.partial).toBe(false)
    expect(rows.photo.crop).toBeNull()
    expect(rows.photo.used).toBeCloseTo(0.0075, 6) // 가장 크게 놓인 자리(100px 상자)의 것
    // 통째 W₀ — 10% 창을 100px 상자에 쓰는 자리의 밀도 보정이 T₀ 를 상한(1920)에 붙인다
    expect(rows.photo.target).toBe(1920)
    expect(rows.photo.storedPixels).toBe(1440 * 1920)
  })

  it('잘라 넣기를 끄면 조각이 없고 통째 픽셀로 센다 — partial 은 남아 "통째로" 의 이유를 말한다', () => {
    const rows = sheetOf([band], { ...SETTINGS, cropToVisible: false })
    expect(rows.band.partial).toBe(true)
    expect(rows.band.crop).toBeNull()
    expect(rows.band.storedPixels).toBe(480 * 640)
  })

  it('이미지를 상자보다 작게 놓은 CROP(원본 밖 창)은 잘라 넣지 않지만 쓰는 영역은 겹치는 만큼 말한다', () => {
    const loose: ImageUsage = {
      ...cropped,
      cropTransform: [
        [1, 0, 0.5],
        [0, 1, 0.5]
      ]
    }
    const rows = sheetOf([loose])
    expect(rows.crop.crop).toBeNull()
    expect(rows.crop.partial).toBe(false)
    expect(rows.crop.used).toBeCloseTo(0.25, 6)
  })

  it('프레임 밖으로 넘치면 쓰는 영역은 창 × 프레임 안에 남는 비 — 조각은 창 기준 그대로', () => {
    const rows = sheetOf([
      { ...band, visible: 0.5 },
      { ...whole, visible: 0.19 }
    ])
    expect(rows.band.used).toBeCloseTo(0.125, 6)
    expect(rows.band.crop?.target).toBe(640)
    expect(rows.whole.used).toBeCloseTo(0.19, 6)
    expect(rows.whole.crop).toBeNull()
  })
})
