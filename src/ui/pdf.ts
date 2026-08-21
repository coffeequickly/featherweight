// PDF 머지·저장. mergePdfs 는 DOM 을 안 쓰므로 Node 에서 테스트한다. (PRD §11)

import { t } from '../lib/i18n'
import { Reason } from '../lib/types'
import { PDFDocument, PDFPage } from 'pdf-lib'

import { DrawResult } from './textLayer'

export type MergePart = { index: number; bytes: Uint8Array }

export type MergeMeta = {
  title: string
  createdAt: Date
  /** Phase 2: 페이지를 붙인 직후 그 위에 진짜 폰트로 텍스트를 얹는다 */
  drawText?: (document: PDFDocument, page: PDFPage, partIndex: number) => Promise<DrawResult>
}

export type MergeOutput = {
  bytes: Uint8Array
  textDrawn: number
  textFallbacks: Array<{ nodeId: string; reason: Reason }>
}

export const PRODUCER = 'Featherweight'

/**
 * 부분 PDF 들을 index 순으로 이어 붙인다.
 * 프레임 1개는 보통 1페이지지만, 여러 페이지가 나와도 순서대로 다 가져온다.
 */
export async function mergePdfs(
  parts: readonly MergePart[],
  meta: MergeMeta
): Promise<MergeOutput> {
  if (parts.length === 0) throw new Error(t('pdf.noParts'))

  const ordered = [...parts].sort((a, b) => a.index - b.index)
  const out = await PDFDocument.create()
  let textDrawn = 0
  const textFallbacks: Array<{ nodeId: string; reason: Reason }> = []

  for (const part of ordered) {
    const source = await PDFDocument.load(part.bytes)
    const pages = await out.copyPages(source, source.getPageIndices())
    for (const page of pages) {
      out.addPage(page)
      if (meta.drawText === undefined) continue
      const drawn = await meta.drawText(out, page, part.index)
      textDrawn += drawn.drawn
      textFallbacks.push(...drawn.fallbacks)
    }
  }

  out.setTitle(meta.title)
  out.setProducer(PRODUCER)
  out.setCreator(PRODUCER)
  out.setCreationDate(meta.createdAt)
  out.setModificationDate(meta.createdAt)

  // save() 는 메타데이터를 건드리지 않는다. 덮어쓰는 쪽은 PDFDocument.load/create 이므로
  // 결과를 다시 읽어 확인할 때는 load(bytes, { updateMetadata: false }) 로 열어야 한다.
  return { bytes: await out.save({ useObjectStreams: true }), textDrawn, textFallbacks }
}

/** iframe 안에서 a[download] 로 저장 다이얼로그를 띄운다. */
export function downloadPdf(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
