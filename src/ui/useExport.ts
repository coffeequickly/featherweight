// 내보내기 진행 상태와 부분 PDF 수집. 다 모이면 머지해서 저장한다. (PRD §7.5)

import { emit, on } from '@create-figma-plugin/utilities'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'

import {
  CancelHandler,
  DoneHandler,
  DoneReport,
  ErrorHandler,
  ExportHandler,
  FitMeasuredHandler,
  FitReport,
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
import { forgetOriginals } from './imageCache'
import { downloadPdf, MergeOutput, mergePdfs } from './pdf'
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
  /** 목표 용량 맞추기를 켰을 때만 있다 */
  fit: FitReport | null
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

/** 이 부분들이 PDF 안에서 차지하는 이미지 바이트 — 손대지 않고 통과시킨 것까지 센다 */
function imageBytesOf(parts: readonly PdfPart[]): number {
  return parts.reduce((sum, part) => sum + part.stats.bytesAfter + part.stats.bytesUntouched, 0)
}

export function useExport(storedFonts: StoredFont[], embedText: boolean): ExportState {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [report, setReport] = useState<ExportReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  const parts = useRef<PdfPart[]>([])
  // 목표 용량 탐색 1회차 결과. 2회차가 없으면(이미 목표 이하) 이걸 그대로 저장한다.
  const measured = useRef<{ parts: PdfPart[]; merged: MergeOutput | null } | null>(null)
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

    /** 부분들을 한 PDF 로 합친다. 폰트 캐시는 문서 전체에 하나여야 한다. */
    async function mergeCollected(collected: PdfPart[], fileName: string): Promise<MergeOutput> {
      // 페이지마다 캐시를 만들면 같은 폰트가 페이지 수만큼 중복 임베드된다 (5쪽이면 4종 → 20벌)
      let cache: FontCache | null = null

      return await mergePdfs(collected, {
        title: fileName.replace(/\.pdf$/i, ''),
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
    }

    /**
     * 목표 용량 탐색 1회차: 저장하지 않고 실제 크기만 재서 메인에 돌려준다.
     * 머지가 실패하면 크기 0 으로 알린다 — 메인이 탐색을 접고 기준 결과로 마무리한다.
     */
    async function measure(done: DoneReport, collected: PdfPart[]): Promise<void> {
      try {
        const merged = await mergeCollected(collected, done.fileName)
        measured.current = { parts: collected, merged }
        emit<FitMeasuredHandler>('fit:measured', {
          reqId: done.reqId ?? '',
          pdfBytes: merged.bytes.length,
          imageBytes: imageBytesOf(collected)
        })
      } catch {
        measured.current = { parts: collected, merged: null }
        emit<FitMeasuredHandler>('fit:measured', {
          reqId: done.reqId ?? '',
          pdfBytes: 0,
          imageBytes: 0
        })
      }
    }

    async function finish(done: DoneReport): Promise<void> {
      const arrived = parts.current
      parts.current = []

      if (done.measureOnly === true) {
        await measure(done, arrived)
        return
      }

      // 2회차가 아무것도 안 보냈으면 1회차 결과를 그대로 쓴다 (이미 목표 이하였던 경우)
      const stash = measured.current
      measured.current = null
      forgetOriginals()

      const collected = arrived.length > 0 ? arrived : (stash?.parts ?? [])
      const premerged = arrived.length > 0 ? null : (stash?.merged ?? null)

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
            fallbacks: [],
            fit: done.fit ?? null
          })
          return
        }

        const merged = premerged ?? (await mergeCollected(collected, done.fileName))
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
          fallbacks: [...stats.fallbacks, ...merged.textFallbacks],
          fit: done.fit ?? null
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
    measured.current = null
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
