import { emit, on, showUI } from '@create-figma-plugin/utilities'

import { pdfFileName } from './lib/fileName'
import { awaitResponse, nextRequestId, rejectAllPending, settleResponse } from './main/bridge'
import { exportFrame, removeLeftoverClones } from './main/exporter'
import { deleteFont, listFonts, pruneOrphanFonts, readFontBytes, saveFont } from './main/fontStore'
import {
  CancelHandler,
  DEFAULT_SETTINGS,
  DoneHandler,
  DoneReport,
  ErrorHandler,
  ExportHandler,
  ExportRequest,
  FontDeleteHandler,
  FontRef,
  FontSaveHandler,
  FontsHandler,
  FontBytesHandler,
  FontBytesResultHandler,
  ImageResizeHandler,
  ImageResizeResultHandler,
  NoticeHandler,
  ResizeRequestPayload,
  ResizeResultPayload,
  PdfPartHandler,
  DocNameHandler,
  FrameFocusHandler,
  NodesFocusHandler,
  ProgressHandler,
  Reason,
  ToastHandler,
  ResizeWindowHandler,
  StoredFont,
  StoredFontsHandler,
  TextRunSource,
  TextValidateHandler,
  TextValidateResult,
  TextValidateResultHandler,
  SelectionHandler,
  SETTINGS_KEY,
  Settings,
  SettingsHandler,
  SettingsSaveHandler,
  UiReadyHandler
} from './lib/types'
import { detectLocale, setLocale, t } from './lib/i18n'
import { buildSelection, exportableSelection } from './main/selection'

export default async function main(): Promise<void> {
  await cleanupLeftovers()
  await cleanupOrphanFonts()

  on<UiReadyHandler>('ui:ready', (locale) => {
    setLocale(detectLocale(locale))
    emit<DocNameHandler>('doc:name', figma.root.name)
    void sendSettings()
    void sendSelection()
    void sendStoredFonts()
  })

  on<ExportHandler>('export', (request) => {
    void runExport(request)
  })

  on<CancelHandler>('cancel', () => {
    cancelled = true
    rejectAllPending(t('main.cancelled'))
  })

  on<ImageResizeResultHandler>('image:resize:result', (payload: ResizeResultPayload) => {
    settleResponse(payload.reqId, payload)
  })

  on<TextValidateResultHandler>('text:validate:result', (payload: TextValidateResult) => {
    settleResponse(payload.reqId, payload)
  })

  // UI 에는 clientStorage 가 없어서 폰트 바이트를 여기서 꺼내 준다
  on<FontBytesHandler>('font:bytes', (payload) => {
    void readFontBytes(payload.ref).then((bytes) => {
      emit<FontBytesResultHandler>('font:bytes:result', {
        reqId: payload.reqId,
        bytes: bytes ?? null
      })
    })
  })

  on<FontSaveHandler>('font:save', (payload) => {
    void storeFont(payload.font, payload.bytes)
  })

  on<FontDeleteHandler>('font:delete', (ref) => {
    void dropFont(ref)
  })

  on<FrameFocusHandler>('frame:focus', (id) => {
    void focusFrame(id)
  })

  on<NodesFocusHandler>('nodes:focus', (ids) => {
    void focusNodes(ids)
  })

  on<ToastHandler>('toast', (message) => {
    figma.notify(message)
  })

  on<SettingsSaveHandler>('settings:save', (value) => {
    void figma.clientStorage.setAsync(SETTINGS_KEY, value)
  })

  figma.on('selectionchange', () => {
    // 리포트 클릭으로 우리가 만든 선택 변경은 목록을 다시 그릴 이유가 아니다
    if (squelchSelectionEvents > 0) {
      squelchSelectionEvents -= 1
      return
    }
    void sendSelection()
  })

  on<ResizeWindowHandler>('resize:window', (size) => {
    figma.ui.resize(size.width, size.height)
  })

  showUI({ width: 400, height: 480 })
}

let cancelled = false
let exporting = false

/**
 * 프레임을 하나씩 순차로 내보낸다. 동시성 1 — 빠르게 만들려다 메모리로 죽는 쪽이 더 비싸다.
 * 실패한 프레임이 있어도 나머지로 PDF 를 만든다. (PRD §7.4, FR-4)
 */
/** 진행률 해상도 — 페이지 하나를 이만큼으로 쪼개 이미지 진행까지 담는다 */
const PROGRESS_STEPS = 100

async function runExport({ order, settings, fileName }: ExportRequest): Promise<void> {
  if (exporting) return
  exporting = true
  cancelled = false

  const skipped: DoneReport['skipped'] = []

  try {
    removeLeftoverClones()

    for (let index = 0; index < order.length; index += 1) {
      if (cancelled) break

      // 진행률은 "전체 작업" 하나의 축이어야 한다. 페이지 안의 이미지 진행까지
      // 여기에 녹여서, 프레임마다 0→100 을 반복하지 않고 한 방향으로만 찬다.
      const reportProgress = (label: string, within = 0): void => {
        emit<ProgressHandler>('progress', {
          label,
          current: Math.round((index + within) * PROGRESS_STEPS),
          total: order.length * PROGRESS_STEPS
        })
      }

      reportProgress(t('progress.page', { page: index + 1, pages: order.length }))

      const result = await exportFrame(order[index], index, {
        settings,
        sendResizeRequest: (payload: ResizeRequestPayload) => {
          emit<ImageResizeHandler>('image:resize', payload)
        },
        // 이미지 진행은 그 페이지 몫(1/총쪽수) 안에서만 움직인다
        onImageProgress: (current, total) => {
          reportProgress(
            t('progress.pageImages', {
              page: index + 1,
              pages: order.length,
              current,
              total
            }),
            total === 0 ? 0 : current / total
          )
        },
        validateText: (sources: TextRunSource[]) => requestTextValidation(sources),
        isCancelled: () => cancelled
      })
      if (result.ok) {
        emit<PdfPartHandler>('pdf:part', result.part)
      } else {
        skipped.push({ id: result.id, name: result.name, reason: result.reason })
      }
    }

    emit<DoneHandler>('done', {
      fileName: pdfFileName(fileName === '' ? figma.root.name : fileName),
      cancelled,
      skipped
    })
  } catch (error) {
    emit<ErrorHandler>('error', {
      message: error instanceof Error ? error.message : String(error)
    })
  } finally {
    // 취소·에러로 빠져나와도 임시 클론은 남기지 않는다 (PRD G4)
    rejectAllPending(t('main.exportFinished'))
    removeLeftoverClones()
    exporting = false
  }
}

/** 텍스트 검증은 UI 에서만 가능하다 (fontkit 이 거기 있다). 실패하면 전부 fallback 처리. */
async function requestTextValidation(
  sources: TextRunSource[]
): Promise<{ eligible: string[]; rejected: Array<{ nodeId: string; reason: Reason }> }> {
  if (sources.length === 0) return { eligible: [], rejected: [] }

  const reqId = nextRequestId('text')
  const promise = awaitResponse<TextValidateResult>(reqId)
  emit<TextValidateHandler>('text:validate', { reqId, sources })

  try {
    const result = await promise
    return { eligible: result.eligible, rejected: result.rejected }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const reason: Reason = { code: 'reason.raw', params: { message } }
    return {
      eligible: [],
      rejected: sources.map((source) => ({ nodeId: source.nodeId, reason }))
    }
  }
}

async function sendSettings(): Promise<void> {
  const stored = (await figma.clientStorage.getAsync(SETTINGS_KEY)) as Settings | undefined
  const value =
    stored !== undefined && stored.version === DEFAULT_SETTINGS.version
      ? { ...DEFAULT_SETTINGS, ...stored }
      : DEFAULT_SETTINGS
  emit<SettingsHandler>('settings', value)
}

let squelchSelectionEvents = 0

/** 목록 행 클릭: 화면만 옮긴다. 선택을 바꾸면 목록이 다시 그려져 버린다. */
async function focusFrame(id: string): Promise<void> {
  const node = await figma.getNodeByIdAsync(id)
  if (node === null || node.type === 'DOCUMENT' || node.type === 'PAGE') return
  figma.viewport.scrollAndZoomIntoView([node as SceneNode])
}

/** 리포트 사유 클릭: 해당 노드들을 선택해 하이라이트하고 화면에 담는다. */
async function focusNodes(ids: string[]): Promise<void> {
  const nodes: SceneNode[] = []
  for (const id of ids) {
    const node = await figma.getNodeByIdAsync(id)
    if (node !== null && node.type !== 'DOCUMENT' && node.type !== 'PAGE') {
      nodes.push(node as SceneNode)
    }
  }
  if (nodes.length === 0) return

  squelchSelectionEvents += 1
  figma.currentPage.selection = nodes
  figma.viewport.scrollAndZoomIntoView(nodes)
}

async function sendSelection(): Promise<void> {
  const { items, fonts } = await buildSelection(exportableSelection())
  emit<SelectionHandler>('selection', items)
  emit<FontsHandler>('fonts', fonts)
}

/** 인덱스에서 빠진 폰트 바이트가 한도만 차지하고 있으면 지운다. */
async function cleanupOrphanFonts(): Promise<void> {
  try {
    const removed = await pruneOrphanFonts()
    if (removed > 0) {
      figma.notify(t('main.orphanCleaned', { count: removed }))
    }
  } catch {
    // 정리는 실패해도 플러그인 동작을 막지 않는다.
  }
}

async function sendStoredFonts(): Promise<void> {
  emit<StoredFontsHandler>('fonts:stored', await listFonts())
}

async function storeFont(font: StoredFont, bytes: Uint8Array): Promise<void> {
  try {
    emit<StoredFontsHandler>('fonts:stored', await saveFont(font, bytes))
    emit<NoticeHandler>('notice', {
      message: t('main.fontSaved', { family: font.family, style: font.style }),
      error: false
    })
  } catch (error) {
    // 5MB 한도를 넘기면 setAsync 가 reject 한다.
    emit<NoticeHandler>('notice', {
      message: t('main.fontSaveFailed', {
        error: error instanceof Error ? error.message : String(error)
      }),
      error: true
    })
    void sendStoredFonts()
  }
}

async function dropFont(ref: FontRef): Promise<void> {
  try {
    emit<StoredFontsHandler>('fonts:stored', await deleteFont(ref))
  } catch (error) {
    emit<NoticeHandler>('notice', {
      message: t('main.fontDeleteFailed', {
        error: error instanceof Error ? error.message : String(error)
      }),
      error: true
    })
  }
}

/** 이전 실행이 죽으면서 남은 임시 클론을 지운다. (PRD §7.4-0) */
async function cleanupLeftovers(): Promise<void> {
  const removed = removeLeftoverClones()
  if (removed > 0) {
    figma.notify(t('main.leftoverCleaned', { count: removed }))
  }
}
