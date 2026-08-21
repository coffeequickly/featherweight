import { t } from '../src/lib/i18n'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'

import { MergeMeta, MergePart, mergePdfs, PRODUCER } from '../src/ui/pdf'

/** mergePdfs 는 통계도 같이 돌려준다. 여기 테스트는 바이트만 본다. */
async function mergeBytes(parts: MergePart[], meta: MergeMeta): Promise<Uint8Array> {
  return (await mergePdfs(parts, meta)).bytes
}

/** Figma 가 프레임 하나를 내보낸 것과 같은 모양 — 1페이지 PDF */
async function onePage(width: number, height: number, label: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([width, height])
  page.drawText(label, { x: 20, y: height - 40, size: 12 })
  return await doc.save()
}

const CREATED_AT = new Date('2026-08-20T12:00:00Z')

describe('mergePdfs', () => {
  it('index 순으로 이어 붙인다 — 도착 순서와 무관하게', async () => {
    const parts = [
      { index: 2, bytes: await onePage(595, 842, 'C') },
      { index: 0, bytes: await onePage(595, 842, 'A') },
      { index: 1, bytes: await onePage(595, 842, 'B') }
    ]

    const merged = await mergeBytes(parts, { title: '이력서', createdAt: CREATED_AT })
    const out = await PDFDocument.load(merged)

    expect(out.getPageCount()).toBe(3)
  })

  it('페이지 크기를 그대로 유지한다 (A4 595×842)', async () => {
    const merged = await mergeBytes([{ index: 0, bytes: await onePage(595, 842, 'A') }], {
      title: 't',
      createdAt: CREATED_AT
    })
    const out = await PDFDocument.load(merged)
    const { width, height } = out.getPage(0).getSize()

    expect(Math.round(width)).toBe(595)
    expect(Math.round(height)).toBe(842)
  })

  it('크기가 다른 페이지가 섞여도 각자 크기를 지킨다', async () => {
    const merged = await mergeBytes(
      [
        { index: 0, bytes: await onePage(595, 842, 'A4') },
        { index: 1, bytes: await onePage(1440, 1024, 'wide') }
      ],
      { title: 't', createdAt: CREATED_AT }
    )
    const out = await PDFDocument.load(merged)

    expect(Math.round(out.getPage(0).getWidth())).toBe(595)
    expect(Math.round(out.getPage(1).getWidth())).toBe(1440)
  })

  it('메타데이터를 채운다', async () => {
    const merged = await mergeBytes([{ index: 0, bytes: await onePage(595, 842, 'A') }], {
      title: '이력서',
      createdAt: CREATED_AT
    })
    // load() 는 기본값으로 Producer/ModDate 를 pdf-lib 것으로 덮어쓴다 — 파일 내용을 보려면 꺼야 한다
    const out = await PDFDocument.load(merged, { updateMetadata: false })

    expect(out.getTitle()).toBe('이력서')
    expect(out.getProducer()).toBe(PRODUCER)
    expect(out.getCreationDate()?.getTime()).toBe(CREATED_AT.getTime())
  })

  it('여러 페이지짜리 부분도 전부 가져온다', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([595, 842])
    doc.addPage([595, 842])
    const twoPages = await doc.save()

    const merged = await mergeBytes(
      [
        { index: 0, bytes: twoPages },
        { index: 1, bytes: await onePage(595, 842, 'C') }
      ],
      { title: 't', createdAt: CREATED_AT }
    )

    expect((await PDFDocument.load(merged)).getPageCount()).toBe(3)
  })

  it('빈 입력은 에러', async () => {
    await expect(mergePdfs([], { title: 't', createdAt: CREATED_AT })).rejects.toThrow(
      t('pdf.noParts')
    )
  })
})
