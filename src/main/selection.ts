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
import { knownEdge, persistEdgeCache, readEdge, rememberEdge } from './imageSize'
import { screenTextNode } from './text'

const EXPORTABLE_TYPES = [
  'FRAME',
  'COMPONENT',
  'COMPONENT_SET',
  'INSTANCE',
  'SECTION',
  'GROUP',
  // Figma Slides 의 슬라이드 하나. 크기·자식·exportAsync 가 프레임과 같다.
  'SLIDE'
] as const

type ExportableType = (typeof EXPORTABLE_TYPES)[number]

export type ExportableNode = SceneNode & { type: ExportableType }

const THUMB_LONG_EDGE = 160
/** 한 번에 그리는 썸네일 수. 전부 동시에 던지면 큰 문서에서 렌더러가 버벅인다. */
const THUMB_CONCURRENCY = 6

export function isExportable(node: BaseNode): node is ExportableNode {
  return (EXPORTABLE_TYPES as readonly string[]).includes(node.type)
}

/** 안에 든 것이 페이지가 되는 상자 — 섹션은 프레임을, 슬라이드 행은 슬라이드를 묶는다 */
const CONTAINER_TYPES: readonly string[] = ['SECTION', 'SLIDE_ROW']

/**
 * 상자를 고르면 그 안의 페이지들이 고른 것이다.
 *
 * 섹션은 보통 "1장·2장·3장" 을 묶는 용도라, 섹션 하나를 고르고 내보내면 안의 프레임이
 * 각각 한 쪽이 되기를 기대한다. 상자 안에 페이지가 될 만한 게 하나도 없으면(도형만 있는
 * 섹션) 상자 자체를 한 쪽으로 낸다. 상자 속 상자는 그대로 따라 들어간다.
 * 같은 노드가 두 번 잡히면(섹션과 그 안의 프레임을 같이 고름) 한 번만 센다.
 */
export function expandContainers(nodes: readonly SceneNode[]): ExportableNode[] {
  const out: ExportableNode[] = []
  const seen = new Set<string>()

  const push = (node: SceneNode): void => {
    if (node.name === TMP_NODE_NAME || seen.has(node.id)) return
    if (CONTAINER_TYPES.includes(node.type) && 'children' in node) {
      const before = out.length
      for (const child of node.children) push(child)
      if (out.length > before) return // 안의 것들이 페이지가 됐다
    }
    if (isExportable(node)) {
      seen.add(node.id)
      out.push(node)
    }
  }

  for (const node of nodes) push(node)
  return out
}

/** 현재 선택에서 export 가능한 노드를 추린다. 상자는 안의 것으로 풀고, 임시 클론은 뺀다. */
export function exportableSelection(): ExportableNode[] {
  const picked = expandContainers(figma.currentPage.selection)
  if (picked.length > 0) return picked

  // Slides 에서 아무것도 안 골랐으면 덱 전체 — 발표 자료는 통째로 내보내는 게 기본이다.
  // 문서 순서가 격자 순서(행 → 슬라이드)와 같다.
  if (figma.editorType === 'slides') {
    return figma.currentPage
      .findAllWithCriteria({ types: ['SLIDE'] })
      .filter((node) => node.name !== TMP_NODE_NAME) as ExportableNode[]
  }
  return []
}

export type SelectionScan = {
  items: FrameItem[]
  fonts: FontUsage[]
  /** 체크리스트 재료. 이미지 원본 크기는 비동기라 imageEdges 로 따로 채운다. */
  frames: PreflightFrame[]
  textRejects: TextReject[]
}

/** 트리를 안 걷고도 아는 것만 — 목록이 곧바로 떠야 한다. 이미지·텍스트 수는 뒤에 온다. */
export function listItems(nodes: readonly ExportableNode[]): FrameItem[] {
  return nodes.map((node) => ({
    id: node.id,
    name: node.name,
    width: Math.round(node.width),
    height: Math.round(node.height),
    x: node.x,
    y: node.y,
    imageCount: 0,
    textCount: 0
  }))
}

/**
 * 한 번에 이만큼(ms)만 읽고 편집기에 차례를 넘긴다 — 프레임 경계와 무관하게.
 * 노드 수로 끊으면 텍스트 위주 슬라이드(노드당 읽기 6~7번)와 도형 위주 슬라이드가
 * 같은 수에 다른 시간을 쓴다. 시간으로 끊어야 한 조각이 화면 한 프레임(16ms) 안에 든다.
 */
const SLICE_MS = 8

/** 플러그인 메인은 편집기와 같은 스레드다 — 타이머로 한 번 넘겨야 캔버스가 그려진다 */
function yieldToEditor(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * 선택 → 폰트·체크리스트 재료·프레임별 집계. 트리는 프레임당 한 번만 걷고, 그 한 번에
 * 텍스트·폰트·이미지를 다 본다.
 *
 * 노드 하나를 읽는 것도 전부 엔진 왕복이라(fills·strokes·effects·absoluteTransform…)
 * 31장 × 수백 노드를 한 번에 걸으면 캔버스가 초 단위로 멈춘다. 그래서 프레임 단위가
 * 아니라 **노드 수 단위**로 끊는다 — 큰 슬라이드 한 장도 여러 번에 나눠 걷는다.
 * 도중에 선택이 바뀌면(isStale) null — 이어 봐야 버려진다. (PRD FR-1)
 */
export async function scanSelection(
  nodes: readonly ExportableNode[],
  isStale: () => boolean
): Promise<SelectionScan | null> {
  const items: FrameItem[] = []
  const frames: PreflightFrame[] = []
  const segments: RawFontSegment[] = []
  const textRejects: TextReject[] = []
  const slice = { since: Date.now() }

  for (const node of nodes) {
    const scan = await scanNode(node, slice, isStale)
    if (scan === null) return null
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

/**
 * PDF export 는 숨겨진 노드를 빼므로 여기서도 visible=false 는 세지 않는다.
 * 재귀 대신 스택으로 걷는다 — 조각 시간이 다하면 그 자리에서 멈춰 편집기에 차례를 넘기고
 * 이어 간다. slice 는 프레임을 넘어 이어지는 시계라 호출자가 들고 있는다.
 */
async function scanNode(
  root: ExportableNode,
  slice: { since: number },
  isStale: () => boolean
): Promise<Scan | null> {
  const scan: Scan = { images: [], textCount: 0, fontSegments: [], textRejects: [] }
  const stack: SceneNode[] = [root]

  while (stack.length > 0) {
    if (Date.now() - slice.since >= SLICE_MS) {
      await yieldToEditor()
      if (isStale()) return null
      slice.since = Date.now()
    }

    const current = stack.pop() as SceneNode
    if (current.visible === false) continue

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
      // 스택이라 뒤집어 넣어야 문서 순서대로 나온다 (children 도 한 번의 엔진 읽기다)
      for (let index = current.children.length - 1; index >= 0; index -= 1) {
        stack.push(current.children[index])
      }
    }
  }

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

/** 이만큼 읽을 때마다 화면에 중간 결과를 준다 */
const EDGE_PROGRESS_EVERY = 6

/**
 * 이미지 해시 → 원본 긴 변(px). 크기를 못 읽은 것은 빠진다.
 *
 * 한 장씩 읽고 사이마다 편집기에 차례를 넘기며, 몇 장마다 onProgress 로 그때까지의 답을
 * 준다 — 캐시에 있던 것은 시작하자마자 한 번 준다. 도중에 선택이 바뀌면 그만둔다.
 * 읽는 방법은 imageSize.ts — 디코드 없이 파일 머리에서.
 */
export async function imageEdges(
  hashes: Iterable<string>,
  isStale: () => boolean,
  onProgress?: (edges: Record<string, number>) => void
): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  const missing: string[] = []

  for (const hash of new Set(hashes)) {
    const cached = knownEdge(hash)
    if (cached !== undefined) out[hash] = cached
    else missing.push(hash)
  }

  if (missing.length === 0) return out
  onProgress?.({ ...out })

  let sinceProgress = 0
  for (const hash of missing) {
    if (isStale()) break
    const image = figma.getImageByHash(hash)
    if (image !== null) {
      const edge = await readEdge(image)
      if (edge !== null) {
        rememberEdge(hash, edge)
        out[hash] = edge
        sinceProgress += 1
        if (sinceProgress >= EDGE_PROGRESS_EVERY) {
          sinceProgress = 0
          onProgress?.({ ...out })
        }
      }
    }
    await yieldToEditor()
  }

  void persistEdgeCache()
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
