// 이미지 원본 긴 변(px) — 어디서 읽든 한 번만, 디코드 없이.
//
// Figma 의 getSizeAsync 는 크기를 알려 주려고 사진을 통째로 디코드한다 — 편집기 스레드에서
// 한 장에 100ms 쯤(54장 5.5초 실측). 바이트를 받아 파일 머리만 읽으면 346ms 다.
// 해시는 내용 주소라 한 번 읽은 크기는 영원히 맞다 — 세션을 넘어 clientStorage 에도 둔다.
// 선택 때 읽은 것을 내보내기가 그대로 쓴다.

import { imageDimensions } from '../lib/imageHeader'

const edgeCache = new Map<string, number>()
const EDGE_CACHE_KEY = 'imageEdges'
/** 저장해 두는 크기 수. 넘으면 오래된 것부터 버린다 — 덱 수십 개 분량이면 넉넉하다 */
const EDGE_CACHE_CAP = 3000
let dirty = false

/** 플러그인이 뜰 때 한 번 — 지난번에 읽은 덱은 크기를 다시 안 읽는다 */
export async function loadEdgeCache(): Promise<void> {
  try {
    const stored = (await figma.clientStorage.getAsync(EDGE_CACHE_KEY)) as
      Record<string, number> | undefined
    if (stored === undefined) return
    for (const [hash, edge] of Object.entries(stored)) {
      if (typeof edge === 'number' && edge > 0 && !edgeCache.has(hash)) edgeCache.set(hash, edge)
    }
  } catch {
    // 못 읽으면 이번 세션만 기억한다
  }
}

/** 새로 읽은 것이 있을 때만 쓴다 — 읽기만 한 뒤에는 아무 일도 없다 */
export async function persistEdgeCache(): Promise<void> {
  if (!dirty) return
  dirty = false
  const entries = [...edgeCache.entries()].slice(-EDGE_CACHE_CAP)
  try {
    await figma.clientStorage.setAsync(EDGE_CACHE_KEY, Object.fromEntries(entries))
  } catch {
    dirty = true
  }
}

export function knownEdge(hash: string): number | undefined {
  return edgeCache.get(hash)
}

export function rememberEdge(hash: string, edge: number): void {
  if (edgeCache.get(hash) === edge) return
  edgeCache.set(hash, edge)
  dirty = true
}

/**
 * 파일 머리에서 먼저, 안 되면 Figma 에 묻는다 — 그건 통째로 디코드라 느리다.
 * 바이트를 이미 받아 뒀으면 넘겨서 두 번 받지 않는다. 못 읽으면 null.
 */
export async function readEdge(image: Image, bytes?: Uint8Array): Promise<number | null> {
  try {
    const size = imageDimensions(bytes ?? (await image.getBytesAsync()))
    if (size !== null) return Math.max(size.width, size.height)
  } catch {
    // 바이트를 못 받으면 아래로
  }
  try {
    const size = await image.getSizeAsync()
    return Math.max(size.width, size.height)
  } catch {
    return null
  }
}
