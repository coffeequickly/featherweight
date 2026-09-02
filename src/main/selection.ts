import { aggregateFontUsage } from '../lib/fontInventory'
import { transformScale } from '../lib/imageTarget'
import {
  FontUsage,
  FrameItem,
  PreflightFrame,
  RawFontSegment,
  TextReject,
  TMP_NODE_NAME
} from '../lib/types'
import { imageUsagesOf } from './images'
import { screenTextNode } from './text'

const EXPORTABLE_TYPES = [
  'FRAME',
  'COMPONENT',
  'COMPONENT_SET',
  'INSTANCE',
  'SECTION',
  'GROUP'
] as const

type ExportableType = (typeof EXPORTABLE_TYPES)[number]

export type ExportableNode = SceneNode & { type: ExportableType }

const THUMB_LONG_EDGE = 160
/** 한 번에 그리는 썸네일 수. 전부 동시에 던지면 큰 문서에서 렌더러가 버벅인다. */
const THUMB_CONCURRENCY = 6

export function isExportable(node: BaseNode): node is ExportableNode {
  return (EXPORTABLE_TYPES as readonly string[]).includes(node.type)
}

/** 현재 선택에서 export 가능한 최상위 노드만 추린다. 임시 클론은 제외한다. */
export function exportableSelection(): ExportableNode[] {
  return figma.currentPage.selection.filter(
    (node): node is ExportableNode => isExportable(node) && node.name !== TMP_NODE_NAME
  )
}

export type SelectionScan = {
  items: FrameItem[]
  fonts: FontUsage[]
  /** 체크리스트 재료. 이미지 원본 크기는 비동기라 imageEdges 로 따로 채운다. */
  frames: PreflightFrame[]
  textRejects: TextReject[]
}

/**
 * 선택 → 목록·폰트·체크리스트 재료. 동기다 — 목록이 곧바로 떠야 한다.
 * 트리는 프레임당 한 번만 걷고, 그 한 번에 텍스트·폰트·이미지를 다 본다. (PRD FR-1)
 */
export function scanSelection(nodes: readonly ExportableNode[]): SelectionScan {
  const items: FrameItem[] = []
  const frames: PreflightFrame[] = []
  const segments: RawFontSegment[] = []
  const textRejects: TextReject[] = []

  for (const node of nodes) {
    const scan = scanNode(node)
    segments.push(...scan.fontSegments)
    textRejects.push(...scan.textRejects)

    items.push({
      id: node.id,
      name: node.name,
      width: Math.round(node.width),
      height: Math.round(node.height),
      x: node.x,
      y: node.y,
      imageCount: new Set(scan.images.map((usage) => usage.imageHash)).size,
      textCount: scan.textCount
    })

    // 건너뛸 기준선은 렌더 크기로 센다 — 프레임 자체가 스케일돼 있을 수 있다 (images.ts 와 같은 규칙)
    const scale = transformScale(node.absoluteTransform)
    frames.push({
      id: node.id,
      longEdge: Math.max(node.width * scale.x, node.height * scale.y),
      images: scan.images
    })
  }

  return { items, fonts: aggregateFontUsage(segments), frames, textRejects }
}

type Scan = {
  images: PreflightFrame['images']
  /** 글자가 있는 텍스트 노드 수. 빈 텍스트는 글리프가 없어 어느 쪽으로도 안 센다. */
  textCount: number
  fontSegments: RawFontSegment[]
  textRejects: TextReject[]
}

/** PDF export 는 숨겨진 노드를 빼므로 여기서도 visible=false 는 세지 않는다. */
function scanNode(root: ExportableNode): Scan {
  const scan: Scan = { images: [], textCount: 0, fontSegments: [], textRejects: [] }

  const visit = (current: SceneNode): void => {
    if (current.visible === false) return

    if (current.type === 'TEXT' && current.characters !== '') {
      scan.textCount += 1
      collectFonts(current, scan.fontSegments)
      // export 때와 같은 판정을 미리 돌린다 — "왜 아웃라인인지" 를 내보내기 전에 안다
      const screened = screenTextNode(current)
      if (!screened.ok) {
        scan.textRejects.push({ nodeId: current.id, name: current.name, reason: screened.reason })
      }
    }

    scan.images.push(...imageUsagesOf(current))

    if ('children' in current) {
      for (const child of current.children) visit(child)
    }
  }

  visit(root)
  return scan
}

/** 한 TextNode 안에서 폰트가 섞여 있을 수 있어 세그먼트 단위로 읽는다. */
function collectFonts(node: TextNode, out: RawFontSegment[]): void {
  try {
    for (const segment of node.getStyledTextSegments(['fontName'])) {
      out.push({
        family: segment.fontName.family,
        style: segment.fontName.style,
        nodeId: node.id,
        charCount: segment.characters.length
      })
    }
  } catch {
    // 폰트를 못 읽는 노드가 있어도 목록 표시는 계속한다.
  }
}

/** 해시는 내용 주소라 한 번 읽은 크기는 영원히 맞다 — 플러그인이 살아 있는 동안 들고 있는다 */
const edgeCache = new Map<string, number>()

/**
 * 이미지 해시 → 원본 긴 변(px). 크기를 못 읽은 것은 빠진다.
 * getSizeAsync 는 메타데이터라 바이트를 읽지 않는다 — 선택할 때마다 불러도 된다.
 */
export async function imageEdges(hashes: Iterable<string>): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  const pending: Promise<void>[] = []

  for (const hash of new Set(hashes)) {
    const cached = edgeCache.get(hash)
    if (cached !== undefined) {
      out[hash] = cached
      continue
    }
    const image = figma.getImageByHash(hash)
    if (image === null) continue
    pending.push(
      image
        .getSizeAsync()
        .then((size) => {
          const edge = Math.max(size.width, size.height)
          edgeCache.set(hash, edge)
          out[hash] = edge
        })
        .catch(() => {
          // 못 읽으면 예고에서 빠질 뿐이다 — export 는 자기 눈으로 다시 본다
        })
    )
  }

  await Promise.all(pending)
  return out
}

/**
 * 썸네일을 묶음으로 병렬 렌더. 30장을 하나씩 기다리면 몇 초가 걸리던 일이다.
 * 도중에 선택이 바뀌었으면(isStale) 남은 것은 그리지 않는다 — 어차피 버려진다.
 */
export async function renderThumbs(
  nodes: readonly ExportableNode[],
  isStale: () => boolean
): Promise<Array<{ id: string; thumb: Uint8Array }>> {
  const out: Array<{ id: string; thumb: Uint8Array }> = []

  for (let start = 0; start < nodes.length; start += THUMB_CONCURRENCY) {
    if (isStale()) break
    const chunk = nodes.slice(start, start + THUMB_CONCURRENCY)
    const thumbs = await Promise.all(chunk.map(renderThumb))
    chunk.forEach((node, index) => {
      const thumb = thumbs[index]
      if (thumb !== null) out.push({ id: node.id, thumb })
    })
  }

  return out
}

/** 썸네일 실패가 목록 표시를 막지 않는다. */
async function renderThumb(node: ExportableNode): Promise<Uint8Array | null> {
  try {
    const longEdge = Math.max(node.width, node.height)
    if (longEdge <= 0) return null
    const scale = Math.min(1, THUMB_LONG_EDGE / longEdge)
    return await node.exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: scale }
    })
  } catch {
    return null
  }
}
