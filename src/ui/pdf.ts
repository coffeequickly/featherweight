// PDF 머지·저장. mergePdfs 는 DOM 을 안 쓰므로 Node 에서 테스트한다. (PRD §11)

import { t } from '../lib/i18n'
import { Reason } from '../lib/types'
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFPage, PDFRawStream, PDFStream } from 'pdf-lib'

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
  /** 아웃라인으로 남은 텍스트가 실제로 얼마나 차지하는가 */
  outlines: OutlineCost
}

/**
 * Figma 가 아웃라인 텍스트를 내보내는 방식은 Type 3 폰트다 — 글리프 하나가 벡터
 * 프로그램이고, 폰트·크기·스타일 조합마다 새 객체가 생긴다. 그래서 텍스트만 있는
 * 문서가 10~20MB 로 부푼다.
 *
 * 이걸 세는 이유 둘:
 *   · 사용자에게 "아웃라인으로 남은 텍스트가 몇 MB 인지" 알려 준다. 개수만으로는
 *     폰트를 추가할 이유가 안 와닿는다.
 *   · 우리 파이프라인의 누수를 잡는다. 전부 임베드했는데 Type 3 가 남아 있으면,
 *     글리프를 못 지운 것이다 (유령 텍스트 버그).
 */
export type OutlineCost = {
  /** 남은 Type 3 폰트 개수. 우리가 글리프를 못 지웠는지 잡아내는 신호다. */
  fonts: number
  /**
   * 페이지 콘텐츠 스트림의 총 바이트 — 벡터로 그려진 것들의 무게다.
   *
   * 아웃라인 텍스트는 여기 들어간다. 실측한 경쟁 제품의 5쪽 이력서는 이 값이 7.7MB
   * 였고 (파일 9.2MB), 같은 문서를 폰트로 임베드한 우리 결과는 0.25MB 였다.
   * 이미지 배치나 우리가 그린 텍스트 연산도 섞이지만 그쪽은 무시할 만큼 작다.
   */
  vectorBytes: number
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

  const outlines = measureOutlines(out)

  // save() 는 메타데이터를 건드리지 않는다. 덮어쓰는 쪽은 PDFDocument.load/create 이므로
  // 결과를 다시 읽어 확인할 때는 load(bytes, { updateMetadata: false }) 로 열어야 한다.
  return { bytes: await out.save({ useObjectStreams: true }), textDrawn, textFallbacks, outlines }
}

/**
 * 아웃라인의 무게를 잰다 — Type 3 폰트 개수와 페이지 벡터 콘텐츠의 바이트.
 * 둘 다 압축된 실제 크기로 센다 (파일에서 차지하는 몫).
 */
function measureOutlines(document: PDFDocument): OutlineCost {
  let fonts = 0
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict)) continue
    const subtype = object.get(PDFName.of('Subtype'))
    if (subtype instanceof PDFName && subtype.asString() === '/Type3') fonts += 1
  }

  let vectorBytes = 0
  for (const page of document.getPages()) {
    // Contents 는 스트림 하나일 수도, 스트림 참조의 배열일 수도 있다
    const contents = document.context.lookup(page.node.get(PDFName.of('Contents')))
    const streams =
      contents instanceof PDFArray
        ? contents.asArray().map((ref) => document.context.lookup(ref))
        : [contents]
    for (const stream of streams) {
      if (stream instanceof PDFRawStream) vectorBytes += stream.contents.length
      else if (stream instanceof PDFStream) vectorBytes += stream.sizeInBytes()
    }
  }

  return { fonts, vectorBytes }
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
