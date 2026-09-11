// 프레임 1개 → PDF 1부. 원본은 절대 건드리지 않는다. (PRD §7.4, §12)

import { PdfPart, Reason, Settings, TextRunSource, TMP_MARK_KEY, TMP_NODE_NAME } from '../lib/types'
import { withTimeout } from '../lib/withTimeout'
import { ImageManySender, ImageRequestSender, OriginalSink, shrinkImages } from './images'
import { ExportableNode, isExportable } from './selection'
import { isTemporary, markTemporary } from './temporary'
import {
  collectTextNodes,
  detachInstances,
  extractText,
  hideTextGlyphs,
  screenTextNode
} from './text'

const EXPORT_TIMEOUT_MS = 30_000

// 클론을 화면 밖으로 치워서 원본·다른 레이어와 겹치지 않게 한다
const OFFSCREEN_X = 100_000
const OFFSCREEN_STEP = 10_000

export type FrameResult =
  { ok: true; part: PdfPart } | { ok: false; id: string; name: string; reason: Reason }

/**
 * clone → (Phase 1.5: 이미지 교체) → (Phase 2: 텍스트 추출) → exportAsync → clone.remove()
 * 클론 제거는 성공·실패·취소 어느 경로에서도 finally 로 보장한다. (PRD G4)
 */
export type FrameContext = {
  settings: Settings
  sendResizeRequest: ImageRequestSender
  /** 조각 여럿을 한 번에 — 없으면 보이는 창만 잘라 넣기를 하지 않는다 */
  sendResizeManyRequest?: ImageManySender
  /** 목표 용량 탐색 중일 때만 준다 — 손대지 않은 이미지의 원본을 UI 캐시로 보낸다 */
  keepOriginal?: OriginalSink
  onImageProgress: (current: number, total: number) => void
  /** fill 을 지워도 되는 노드를 UI 에 물어본다 (글리프 커버리지는 UI 에서만 볼 수 있다) */
  validateText: (sources: TextRunSource[]) => Promise<{
    eligible: string[]
    rejected: Array<{ nodeId: string; reason: Reason }>
  }>
  isCancelled: () => boolean
}

export async function exportFrame(
  id: string,
  index: number,
  context: FrameContext
): Promise<FrameResult> {
  const node = await figma.getNodeByIdAsync(id)

  if (node === null) {
    return { ok: false, id, name: id, reason: { code: 'exporter.nodeGone' } }
  }
  if (!isExportable(node)) {
    return {
      ok: false,
      id,
      name: node.name,
      reason: { code: 'exporter.badType', params: { type: node.type } }
    }
  }

  // clone() 도 try 안에서 — 한 프레임의 클론 실패(인스턴스 안의 프레임 등)가 내보내기 전체를
  // 죽이면 안 된다. 실패한 프레임만 건너뛰고 나머지로 PDF 를 만든다 (PRD FR-4)
  let clone: ExportableNode | null = null
  try {
    let current = node.clone() as ExportableNode
    clone = current
    markTemporary(current)
    // clone() 직후 페이지 루트로 옮긴다 — 오토레이아웃 부모 안에 남으면 형제가 밀린다 (S6)
    parkOffscreen(current, index)
    // 인스턴스 안의 텍스트는 숨길 때 레이아웃을 못 굳힌다 — 클론이니 전부 떼어 낸다 (text.ts)
    current = detachInstances(current) as ExportableNode
    clone = current
    markTemporary(current)

    const images = await shrinkImages(
      current,
      context.settings,
      context.sendResizeRequest,
      context.onImageProgress,
      context.isCancelled,
      context.keepOriginal,
      // 잘라 넣기를 끄면 조각 요청 통로를 아예 안 준다 — 계획도 요청도 없다
      context.settings.cropToVisible ? context.sendResizeManyRequest : undefined
    )
    // 취소는 단계 경계에서 본다 — Figma 호출 자체는 못 끊지만 다음 단계로는 안 간다 (PRD §7.4)
    if (context.isCancelled()) return cancelledFrame(id, node.name)

    const text = context.settings.embedText
      ? await prepareText(current, node, context)
      : {
          sources: [] as TextRunSource[],
          fallbacks: [] as Array<{ nodeId: string; reason: Reason }>
        }
    if (context.isCancelled()) return cancelledFrame(id, node.name)

    const bytes = await withTimeout(
      current.exportAsync({ format: 'PDF', contentsOnly: true }),
      EXPORT_TIMEOUT_MS,
      node.name
    )

    return {
      ok: true,
      part: {
        index,
        name: node.name,
        bytes,
        text: text.sources,
        stats: {
          imagesProcessed: images.processed,
          imagesCropped: images.cropped,
          imagesRecovered: images.recovered,
          imageHashes: images.seen,
          bytesJpeg: images.bytesJpeg,
          bytesBefore: images.bytesBefore,
          bytesAfter: images.bytesAfter,
          bytesUntouched: images.bytesUntouched,
          fallbacks: text.fallbacks,
          imageWarnings: images.warnings.map((reason) => ({ nodeId: id, reason }))
        }
      }
    }
  } catch (error) {
    return {
      ok: false,
      id,
      name: node.name,
      reason: {
        code: 'reason.raw',
        params: { message: error instanceof Error ? error.message : String(error) }
      }
    }
  } finally {
    if (clone !== null) {
      try {
        if (!clone.removed) clone.remove()
      } catch {
        // 이미 지워졌거나 지울 수 없는 상태 — 잔존 정리가 다음 실행 때 표식으로 찾아 지운다
      }
    }
  }
}

function cancelledFrame(id: string, name: string): FrameResult {
  return { ok: false, id, name, reason: { code: 'main.cancelled' } }
}

/**
 * 클론을 원본·다른 레이어와 안 겹치게 치운다.
 *
 * Slides 에서는 슬라이드가 격자(SLIDE_GRID → SLIDE_ROW) 밖으로 못 나간다 — 페이지에
 * 붙이면 던진다. 그때는 clone() 이 넣어 준 자리(원본 옆)에 그대로 두고 내보낸 뒤
 * 지운다. 잠깐 격자에 슬라이드가 하나 더 보일 수 있다. (Slides 스파이크 — 실측 대상)
 */
function parkOffscreen(clone: ExportableNode, index: number): void {
  try {
    figma.currentPage.appendChild(clone)
    clone.x = OFFSCREEN_X + index * OFFSCREEN_STEP
  } catch {
    // 격자 밖으로 못 꺼내는 편집기 — 제자리에 둔다
  }
}

/**
 * 텍스트 재료를 뽑고, UI 가 승인한 노드만 fill 을 비운다.
 *
 * 순서가 중요하다: 추출 → 검증 → fill 제거. 먼저 지우면 SVG 에도 텍스트가 안 나오고,
 * 검증을 건너뛰면 폰트가 없는 노드가 글자 없이 사라진다.
 */
async function prepareText(
  clone: ExportableNode,
  original: ExportableNode,
  context: FrameContext
): Promise<{ sources: TextRunSource[]; fallbacks: Array<{ nodeId: string; reason: Reason }> }> {
  const fallbacks: Array<{ nodeId: string; reason: Reason }> = []
  const candidates = []

  // 리포트의 nodeId 는 원본 것이어야 한다 — 클론은 내보내고 나면 지워져서
  // "이 사유를 클릭해 해당 텍스트 보기" 가 갈 곳이 없어진다.
  // clone() 은 자식 순서를 보존하므로 순회 순서로 짝을 맞춘다.
  const cloneTexts = collectTextNodes(clone)
  const originalTexts = collectTextNodes(original)

  for (let index = 0; index < cloneTexts.length; index += 1) {
    const node = cloneTexts[index]
    const reportId = originalTexts[index]?.id ?? node.id

    const screened = screenTextNode(node, clone)
    if (!screened.ok) {
      fallbacks.push({ nodeId: reportId, reason: screened.reason })
      continue
    }

    const extracted = await extractText(node, clone)
    if ('failed' in extracted) {
      fallbacks.push({ nodeId: reportId, reason: extracted.failed })
      continue
    }
    extracted.source.nodeId = reportId
    candidates.push(extracted)
  }

  if (candidates.length === 0) return { sources: [], fallbacks }

  const verdict = await context.validateText(candidates.map((candidate) => candidate.source))
  fallbacks.push(...verdict.rejected)

  const approved = new Set(verdict.eligible)
  const sources: TextRunSource[] = []
  for (const candidate of candidates) {
    if (!approved.has(candidate.source.nodeId)) continue
    hideTextGlyphs(candidate.node)
    sources.push(candidate.source)
  }

  return { sources, fallbacks }
}

/**
 * 이전 실행이 죽으면서 남은 임시 클론을 지운다. (PRD §7.4-0)
 *
 * 우리 표식(pluginData)이 있는 노드만 우리 것이다. 표식이 생기기 전 버전이 남긴 클론은 이름이
 * 같고 페이지 직속이며 화면 밖 자리에 있는 것만 지운다 — 사용자가 우연히 같은 이름을 붙인
 * 프레임은 건드리지 않는다. 지울 수 없는 노드가 있어도 나머지는 지우고, 절대 던지지 않는다
 * (내보내기의 finally 와 플러그인 시작에서 불린다).
 */
export function removeLeftoverClones(): number {
  let removed = 0
  try {
    const marked = figma.currentPage.findAllWithCriteria({ pluginData: { keys: [TMP_MARK_KEY] } })
    const legacy = figma.currentPage.children.filter(
      (node) => node.name === TMP_NODE_NAME && !isTemporary(node) && node.x >= OFFSCREEN_X
    )
    for (const node of [...marked, ...legacy]) {
      try {
        if (node.removed) continue
        node.remove()
        removed += 1
      } catch {
        // 잠겼거나 지울 수 없는 자리의 노드 — 두고 간다
      }
    }
  } catch {
    // 페이지를 못 읽는 상태 — 정리를 못 해도 플러그인은 떠야 한다
  }
  return removed
}
