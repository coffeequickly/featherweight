import { aggregateFontUsage } from '../lib/fontInventory'
import { FontUsage, FrameItem, RawFontSegment, TMP_NODE_NAME } from '../lib/types'

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

export function isExportable(node: BaseNode): node is ExportableNode {
  return (EXPORTABLE_TYPES as readonly string[]).includes(node.type)
}

/** 현재 선택에서 export 가능한 최상위 노드만 추린다. 임시 클론은 제외한다. */
export function exportableSelection(): ExportableNode[] {
  return figma.currentPage.selection.filter(
    (node): node is ExportableNode => isExportable(node) && node.name !== TMP_NODE_NAME
  )
}

/**
 * 선택 → 목록 + 폰트 집계. 트리는 프레임당 한 번만 건다.
 * 썸네일 실패가 목록 표시를 막지 않는다. (PRD FR-1)
 */
export async function buildSelection(
  nodes: readonly ExportableNode[]
): Promise<{ items: FrameItem[]; fonts: FontUsage[] }> {
  const items: FrameItem[] = []
  const segments: RawFontSegment[] = []

  for (const node of nodes) {
    const scan = scanNode(node)
    segments.push(...scan.fontSegments)

    const item: FrameItem = {
      id: node.id,
      name: node.name,
      width: Math.round(node.width),
      height: Math.round(node.height),
      x: node.x,
      y: node.y,
      imageCount: scan.images.size,
      textCount: scan.textCount
    }

    const thumb = await renderThumb(node)
    if (thumb !== null) item.thumb = thumb

    items.push(item)
  }

  return { items, fonts: aggregateFontUsage(segments) }
}

type Scan = {
  /** 서로 다른 이미지의 개수. 같은 사진을 열 군데 써도 파일에는 한 번 들어간다 —
      리포트가 PDF 를 실측해 세는 수와 단위를 맞춘다. */
  images: Set<string>
  textCount: number
  fontSegments: RawFontSegment[]
}

/** PDF export 는 숨겨진 노드를 빼므로 여기서도 visible=false 는 세지 않는다. */
function scanNode(root: ExportableNode): Scan {
  const scan: Scan = { images: new Set(), textCount: 0, fontSegments: [] }

  const visit = (current: SceneNode): void => {
    if (current.visible === false) return

    if (current.type === 'TEXT') {
      scan.textCount += 1
      collectFonts(current, scan.fontSegments)
    }

    if ('fills' in current && Array.isArray(current.fills)) {
      for (const paint of current.fills) {
        if (paint.type === 'IMAGE' && paint.visible !== false && paint.imageHash !== null)
          scan.images.add(paint.imageHash)
      }
    }

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
