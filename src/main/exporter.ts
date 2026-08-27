// 프레임 1개 → PDF 1부. 원본은 절대 건드리지 않는다. (PRD §7.4, §12)

import { PdfPart, Reason, Settings, TextRunSource, TMP_NODE_NAME } from '../lib/types'
import { withTimeout } from '../lib/withTimeout'
import { ImageRequestSender, OriginalSink, shrinkImages } from './images'
import { ExportableNode, isExportable } from './selection'
import { clearTextFills, collectTextNodes, extractText, screenTextNode } from './text'

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

  // clone() 직후 페이지 루트로 옮긴다 — 오토레이아웃 부모 안에 남으면 형제가 밀린다 (S6)
  const clone = node.clone() as ExportableNode
  try {
    clone.name = TMP_NODE_NAME
    figma.currentPage.appendChild(clone)
    clone.x = OFFSCREEN_X + index * OFFSCREEN_STEP

    const images = await shrinkImages(
      clone,
      context.settings,
      context.sendResizeRequest,
      context.onImageProgress,
      context.isCancelled,
      context.keepOriginal
    )

    const text = context.settings.embedText
      ? await prepareText(clone, node, context)
      : {
          sources: [] as TextRunSource[],
          fallbacks: [] as Array<{ nodeId: string; reason: Reason }>
        }

    const bytes = await withTimeout(
      clone.exportAsync({ format: 'PDF', contentsOnly: true }),
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
          bytesBefore: images.bytesBefore,
          bytesAfter: images.bytesAfter,
          bytesUntouched: images.bytesUntouched,
          fallbacks: [
            ...images.warnings.map((reason) => ({ nodeId: id, reason })),
            ...text.fallbacks
          ]
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
    clone.remove()
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

    const screened = screenTextNode(node)
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
    clearTextFills(candidate.node)
    sources.push(candidate.source)
  }

  return { sources, fallbacks }
}

/** 이전 실행이 죽으면서 남은 임시 클론을 지운다. (PRD §7.4-0) */
export function removeLeftoverClones(): number {
  const leftovers = figma.currentPage.findAll((node) => node.name === TMP_NODE_NAME)
  for (const node of leftovers) node.remove()
  return leftovers.length
}
