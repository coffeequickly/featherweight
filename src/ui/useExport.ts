// 내보내기 진행 상태와 부분 PDF 수집. 다 모이면 머지해서 저장한다. (PRD §7.5)

import { emit, on } from '@create-figma-plugin/utilities'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'

import {
  CancelHandler,
  DoneHandler,
  DoneReport,
  ErrorHandler,
  ExportHandler,
  PdfPart,
  PdfPartHandler,
  Progress,
  ProgressHandler,
  Reason,
  Settings,
  StoredFont,
  ToastHandler
} from '../lib/types'
import { formatBytes } from '../lib/fontStore'
import { t } from '../lib/i18n'
import { downloadPdf, mergePdfs } from './pdf'
import { drawTextLayer, FontCache } from './textLayer'
import { loadFontBytes } from './fontSource'

export type ExportReport = {
  fileName: string
  byteLength: number
  pageCount: number
  elapsedMs: number
  cancelled: boolean
  skipped: DoneReport['skipped']
  imagesProcessed: number
  imageBytesBefore: number
  imageBytesAfter: number
  textDrawn: number
  fallbacks: Array<{ nodeId: string; reason: Reason }>
}

export type ExportState = {
  busy: boolean
  progress: Progress | null
  report: ExportReport | null
  error: string | null
  start: (order: string[], settings: Settings, fileName: string) => void
  /** 마지막 요청 그대로 재시도. 실패 배너의 [다시 시도] 가 쓴다. */
  retry: () => void
  cancel: () => void
}

export function useExport(storedFonts: StoredFont[], embedText: boolean): ExportState {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [report, setReport] = useState<ExportReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  const parts = useRef<PdfPart[]>([])
  const startedAt = useRef(0)
  const fonts = useRef<StoredFont[]>(storedFonts)
  const wantsText = useRef(embedText)
  fonts.current = storedFonts
  wantsText.current = embedText

  useEffect(() => {
    const offProgress = on<ProgressHandler>('progress', setProgress)

    const offPart = on<PdfPartHandler>('pdf:part', (part) => {
      parts.current.push(part)
    })

    const offDone = on<DoneHandler>('done', (done) => {
      void finish(done)
    })

    const offError = on<ErrorHandler>('error', (payload) => {
      setError(payload.message)
      setBusy(false)
      setProgress(null)
    })

    async function finish(done: DoneReport): Promise<void> {
      const collected = parts.current
      parts.current = []

      try {
        if (collected.length === 0) {
          setError(done.cancelled ? t('export.cancelled') : t('export.nothing'))
          setReport({
            fileName: done.fileName,
            byteLength: 0,
            pageCount: 0,
            elapsedMs: Date.now() - startedAt.current,
            cancelled: done.cancelled,
            skipped: done.skipped,
            imagesProcessed: 0,
            imageBytesBefore: 0,
            imageBytesAfter: 0,
            textDrawn: 0,
            fallbacks: []
          })
          return
        }

        // 폰트 캐시는 문서 전체에 하나여야 한다. 페이지마다 만들면 같은 폰트가
        // 페이지 수만큼 중복 임베드된다 (5쪽이면 4종 → 20벌).
        let cache: FontCache | null = null

        const merged = await mergePdfs(collected, {
          title: done.fileName.replace(/\.pdf$/i, ''),
          createdAt: new Date(),
          drawText: wantsText.current
            ? async (document, page, index) => {
                const part = collected.find((candidate) => candidate.index === index)
                if (part === undefined || part.text.length === 0) return { drawn: 0, fallbacks: [] }
                cache ??= new FontCache(document, fonts.current, (font) => loadFontBytes(font))
                return await drawTextLayer(page, part.text, cache)
              }
            : undefined
        })
        const bytes = merged.bytes
        downloadPdf(bytes, done.fileName)
        // 플러그인 창을 안 보고 있어도 완료를 알 수 있게 캔버스 토스트로도 알린다
        emit<ToastHandler>(
          'toast',
          t('report.saved', { file: done.fileName, size: formatBytes(bytes.length) })
        )

        const stats = collected.reduce(
          (sum, part) => ({
            imagesProcessed: sum.imagesProcessed + part.stats.imagesProcessed,
            imageBytesBefore: sum.imageBytesBefore + part.stats.bytesBefore,
            imageBytesAfter: sum.imageBytesAfter + part.stats.bytesAfter,
            fallbacks: [...sum.fallbacks, ...part.stats.fallbacks]
          }),
          {
            imagesProcessed: 0,
            imageBytesBefore: 0,
            imageBytesAfter: 0,
            fallbacks: [] as Array<{ nodeId: string; reason: Reason }>
          }
        )

        setReport({
          fileName: done.fileName,
          byteLength: bytes.length,
          pageCount: collected.length,
          elapsedMs: Date.now() - startedAt.current,
          cancelled: done.cancelled,
          skipped: done.skipped,
          imagesProcessed: stats.imagesProcessed,
          imageBytesBefore: stats.imageBytesBefore,
          imageBytesAfter: stats.imageBytesAfter,
          textDrawn: merged.textDrawn,
          fallbacks: [...stats.fallbacks, ...merged.textFallbacks]
        })
        setError(null)
      } catch (mergeError) {
        setError(mergeError instanceof Error ? mergeError.message : String(mergeError))
      } finally {
        setBusy(false)
        setProgress(null)
      }
    }

    return () => {
      offProgress()
      offPart()
      offDone()
      offError()
    }
  }, [])

  const lastRequest = useRef<{ order: string[]; settings: Settings; fileName: string } | null>(null)

  const start = useCallback((order: string[], settings: Settings, fileName: string) => {
    lastRequest.current = { order, settings, fileName }
    parts.current = []
    startedAt.current = Date.now()
    setBusy(true)
    setError(null)
    setReport(null)
    setProgress({ label: t('progress.prepare'), current: 0, total: Math.max(order.length, 1) })
    emit<ExportHandler>('export', { order, settings, fileName })
  }, [])

  const retry = useCallback(() => {
    const request = lastRequest.current
    if (request !== null) start(request.order, request.settings, request.fileName)
  }, [start])

  const cancel = useCallback(() => {
    emit<CancelHandler>('cancel')
  }, [])

  return { busy, progress, report, error, start, retry, cancel }
}
