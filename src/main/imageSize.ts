// 이미지 원본 긴 변(px) — 어디서 읽든 한 번만, 디코드 없이.
//
// Figma 의 getSizeAsync 는 크기를 알려 주려고 사진을 통째로 디코드한다 — 편집기 스레드에서
// 한 장에 100ms 쯤(54장 5.5초 실측). 바이트를 받아 파일 머리만 읽으면 346ms 다.
// 해시는 내용 주소라 한 번 읽은 크기는 영원히 맞다 — 세션을 넘어 clientStorage 에도 둔다.
// 선택 때 읽은 것을 내보내기가 그대로 쓴다.

import { PixelSize } from '../lib/imageDensity'
import { withTimeout } from '../lib/withTimeout'
import { imageDimensions } from '../lib/imageHeader'

const edgeCache = new Map<string, PixelSize>()
/**
 * 양변을 담는 키. 옛 키들은 열 때 지운다 — 다시 읽는 편이 싸다.
 * 'imageEdges' 는 긴 변만, 'imageSizes' 는 EXIF 방향을 안 본 크기(세로 사진의 가로세로가 뒤집힘)
 */
const EDGE_CACHE_KEY = 'imageSizes2'
const LEGACY_EDGE_KEYS = ['imageEdges', 'imageSizes']
/** 저장해 두는 크기 수. 넘으면 오래된 것부터 버린다 — 덱 수십 개 분량이면 넉넉하다 */
const EDGE_CACHE_CAP = 3000
let dirty = false

/** 플러그인이 뜰 때 한 번 — 지난번에 읽은 덱은 크기를 다시 안 읽는다 */
export async function loadEdgeCache(): Promise<void> {
  try {
    for (const key of LEGACY_EDGE_KEYS)
      void figma.clientStorage.deleteAsync(key).catch(() => undefined)
    const stored = (await figma.clientStorage.getAsync(EDGE_CACHE_KEY)) as
      Record<string, [number, number]> | undefined
    if (stored === undefined) return
    for (const [hash, size] of Object.entries(stored)) {
      if (!Array.isArray(size) || size.length !== 2) continue
      const [width, height] = size
      if (width > 0 && height > 0 && !edgeCache.has(hash)) edgeCache.set(hash, { width, height })
    }
  } catch {
    // 못 읽으면 이번 세션만 기억한다
  }
}

/** 새로 읽은 것이 있을 때만 쓴다 — 읽기만 한 뒤에는 아무 일도 없다 */
export async function persistEdgeCache(): Promise<void> {
  if (!dirty) return
  dirty = false
  const entries = [...edgeCache.entries()]
    .slice(-EDGE_CACHE_CAP)
    .map(([hash, size]) => [hash, [size.width, size.height]] as const)
  try {
    await figma.clientStorage.setAsync(EDGE_CACHE_KEY, Object.fromEntries(entries))
  } catch {
    dirty = true
  }
}

export function knownSize(hash: string): PixelSize | undefined {
  return edgeCache.get(hash)
}

/** 긴 변만 필요한 자리 — 옛 이름을 유지해 부르는 쪽을 안 바꾼다 */
export function knownEdge(hash: string): number | undefined {
  const size = edgeCache.get(hash)
  return size === undefined ? undefined : Math.max(size.width, size.height)
}

export function rememberSize(hash: string, size: PixelSize): void {
  const had = edgeCache.get(hash)
  if (had !== undefined && had.width === size.width && had.height === size.height) return
  edgeCache.set(hash, size)
  dirty = true
}

/**
 * 파일 머리에서 먼저, 안 되면 Figma 에 묻는다 — 그건 통째로 디코드라 느리다.
 * 바이트를 이미 받아 뒀으면 넘겨서 두 번 받지 않는다. 못 읽으면 null.
 */
/** 크기 읽기 한도 — getSizeAsync 는 통째 디코드라 큰 이미지에서 오래 걸릴 수 있다 */
const READ_TIMEOUT_MS = 20_000

export async function readSize(image: Image, bytes?: Uint8Array): Promise<PixelSize | null> {
  try {
    const size = imageDimensions(
      bytes ?? (await withTimeout(image.getBytesAsync(), READ_TIMEOUT_MS, 'image'))
    )
    if (size !== null) return size
  } catch {
    // 바이트를 못 받으면 아래로
  }
  try {
    return await withTimeout(image.getSizeAsync(), READ_TIMEOUT_MS, 'image')
  } catch {
    return null
  }
}
