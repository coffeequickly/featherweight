import { emit, on, showUI } from '@create-figma-plugin/utilities'

import { pdfFileName } from './lib/fileName'
import {
  applyProfile,
  BASELINE_INDEX,
  candidateIndices,
  chooseProfile,
  clampTargetMb,
  CompressionProfile,
  fixedBytes,
  mbToBytes,
  predictSize,
  Probe,
  PROFILE_LADDER
} from './lib/fitToSize'
import { processFloor, transformScale } from './lib/imageTarget'
import { awaitResponse, nextRequestId, rejectAllPending, settleResponse } from './main/bridge'
import { exportFrame, removeLeftoverClones } from './main/exporter'
import { forgetSeenImages, OriginalSink, planFor, seenImageInfo } from './main/images'
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
  FitMeasuredHandler,
  FitReport,
  ImageProbeResultHandler,
  ImageCacheHandler,
  ImageProbeHandler,
  ImageProbeItem,
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

  // 목표 용량 탐색: UI 가 머지해 잰 실제 PDF 크기
  on<ImageProbeResultHandler>('image:probe:result', (payload) => {
    settleResponse(payload.reqId, payload)
  })

  on<FitMeasuredHandler>('fit:measured', (payload) => {
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

/** 진행률 해상도. 전체 작업 하나의 축을 이만큼으로 쪼갠다. */
const PROGRESS_TOTAL = 1000

/**
 * 진행률이 차지하는 구간. 목표 용량 맞추기는 export 를 두 번 하므로 구간을 나눠
 * 한 방향으로만 채운다 — 프레임마다, 패스마다 0→100 을 반복하면 아무것도 못 읽는다.
 */
type ProgressWindow = { start: number; span: number }

const FULL_WINDOW: ProgressWindow = { start: 0, span: 1 }
const FIT_BASELINE: ProgressWindow = { start: 0, span: 0.45 }
const FIT_PROBE: ProgressWindow = { start: 0.45, span: 0.15 }
const FIT_FINAL: ProgressWindow = { start: 0.6, span: 0.4 }

/** 후보 한 개를 재는 데 주는 시간 — 이미지가 많으면 인코딩만으로도 오래 걸린다 */
const PROBE_TIMEOUT_MS = 180_000
/** 머지+폰트 임베드까지 기다린다 */
const MEASURE_TIMEOUT_MS = 180_000

function reportProgress(label: string, fraction: number, window: ProgressWindow): void {
  const clamped = Math.min(1, Math.max(0, fraction))
  emit<ProgressHandler>('progress', {
    label,
    current: Math.round((window.start + window.span * clamped) * PROGRESS_TOTAL),
    total: PROGRESS_TOTAL
  })
}

async function runExport({ order, settings, fileName }: ExportRequest): Promise<void> {
  if (exporting) return
  exporting = true
  cancelled = false

  try {
    removeLeftoverClones()
    forgetSeenImages()

    const outName = pdfFileName(fileName === '' ? figma.root.name : fileName)

    if (settings.fitToSize) {
      await runFitExport(order, settings, outName)
      return
    }

    const pass = await runPass(order, settings, FULL_WINDOW)
    emit<DoneHandler>('done', { fileName: outName, cancelled, skipped: pass.skipped })
  } catch (error) {
    emit<ErrorHandler>('error', {
      message: error instanceof Error ? error.message : String(error)
    })
  } finally {
    // 취소·에러로 빠져나와도 임시 클론은 남기지 않는다 (PRD G4)
    rejectAllPending(t('main.exportFinished'))
    removeLeftoverClones()
    forgetSeenImages()
    exporting = false
  }
}

type PassResult = {
  skipped: DoneReport['skipped']
  /** 이 패스 결과 PDF 안에 들어간 이미지 바이트 합 (손대지 않은 것 포함) */
  imageBytes: number
}

/** 프레임을 하나씩 내보내 pdf:part 로 흘린다. 진행률은 주어진 구간 안에서만 움직인다. */
async function runPass(
  order: string[],
  settings: Settings,
  window: ProgressWindow,
  keepOriginal?: OriginalSink
): Promise<PassResult> {
  const skipped: DoneReport['skipped'] = []
  let imageBytes = 0

  for (let index = 0; index < order.length; index += 1) {
    if (cancelled) break

    const at = (within: number): number => (index + within) / order.length
    reportProgress(t('progress.page', { page: index + 1, pages: order.length }), at(0), window)

    const result = await exportFrame(order[index], index, {
      settings,
      sendResizeRequest: (payload: ResizeRequestPayload) => {
        emit<ImageResizeHandler>('image:resize', payload)
      },
      keepOriginal,
      // 이미지 진행은 그 페이지 몫(1/총쪽수) 안에서만 움직인다
      onImageProgress: (current, total) => {
        reportProgress(
          t('progress.pageImages', {
            page: index + 1,
            pages: order.length,
            current,
            total
          }),
          at(total === 0 ? 0 : current / total),
          window
        )
      },
      validateText: (sources: TextRunSource[]) => requestTextValidation(sources),
      isCancelled: () => cancelled
    })

    if (result.ok) {
      emit<PdfPartHandler>('pdf:part', result.part)
      imageBytes += result.part.stats.bytesAfter + result.part.stats.bytesUntouched
    } else {
      skipped.push({ id: result.id, name: result.name, reason: result.reason })
    }
  }

  return { skipped, imageBytes }
}

/**
 * 목표 용량 맞추기. (docs/FIT-TO-SIZE.md)
 *
 * 기준 프로필로 한 번 뽑아 UI 에서 실제 크기를 재고 — 폰트 임베드까지 합쳐진 값이라야
 * 예측이 맞는다 — 고정분을 구한다. 그다음 압축이 더 센 후보들을 UI 에서 재보고,
 * 목표를 만족하는 가장 화질 좋은 것으로 다시 뽑는다.
 */
async function runFitExport(order: string[], settings: Settings, outName: string): Promise<void> {
  const targetBytes = mbToBytes(clampTargetMb(settings.fitTargetMb))
  const baseline = applyProfile(settings, PROFILE_LADDER[BASELINE_INDEX])

  const first = await runPass(order, baseline, FIT_BASELINE, (imageHash, bytes) => {
    emit<ImageCacheHandler>('image:cache', { imageHash, bytes })
  })
  if (cancelled) {
    emit<DoneHandler>('done', { fileName: outName, cancelled, skipped: first.skipped })
    return
  }

  reportProgress(t('progress.measure'), 1, FIT_BASELINE)
  const measured = await requestMeasurement(outName)

  // 크기를 못 쟀으면(머지 실패) 예측할 근거가 없다 — 기준 결과로 조용히 마무리한다
  if (measured.pdfBytes <= 0) {
    emit<DoneHandler>('done', { fileName: outName, cancelled, skipped: first.skipped })
    return
  }

  const fixed = fixedBytes(measured.pdfBytes, measured.imageBytes)

  const probes = await runProbes(order, fixed, targetBytes, measured.imageBytes)
  const outcome = chooseProfile(probes, fixed, targetBytes, measured.imageBytes)
  const fit: FitReport = {
    targetBytes,
    outcome: outcome.kind,
    predictedBytes: outcome.predicted
  }

  // 기준 그대로가 답이면 다시 뽑지 않는다 — 부분을 안 보내면 UI 가 방금 머지해 둔 것을
  // 그대로 저장한다. 세 경우가 여기로 온다:
  //   · 이미 목표 아래 (AC5 — 공짜로 화질을 버리지 않는다)
  //   · 잴 이미지가 없어 후보가 하나도 없었다 (텍스트 위주 문서)
  //   · 취소
  const keepBaseline =
    outcome.kind === 'already-small' || outcome.profileIndex === BASELINE_INDEX || cancelled
  if (keepBaseline) {
    emit<DoneHandler>('done', { fileName: outName, cancelled, skipped: first.skipped, fit })
    return
  }

  reportProgress(t('progress.refine'), 0, FIT_FINAL)
  const chosen = applyProfile(settings, PROFILE_LADDER[outcome.profileIndex])
  const second = await runPass(order, chosen, FIT_FINAL)
  emit<DoneHandler>('done', { fileName: outName, cancelled, skipped: second.skipped, fit })
}

/**
 * 후보를 좋은 쪽부터 재본다. 목표를 만족하는 것이 나오면 멈춘다 — 사다리가 정렬돼
 * 있으므로 그보다 센 후보는 화질만 더 버릴 뿐이다.
 */
async function runProbes(
  order: string[],
  fixed: number,
  targetBytes: number,
  baselineImageBytes: number
): Promise<Probe[]> {
  const probes: Probe[] = []
  if (predictSize(fixed, baselineImageBytes) <= targetBytes) return probes

  const candidates = candidateIndices(BASELINE_INDEX)
  for (let step = 0; step < candidates.length; step += 1) {
    if (cancelled) break

    const profileIndex = candidates[step]
    const profile = PROFILE_LADDER[profileIndex]
    reportProgress(
      t('progress.probe', { current: step + 1, total: candidates.length }),
      (step + 1) / candidates.length,
      FIT_PROBE
    )

    const items = await probeItemsFor(order, profile)
    if (items.length === 0) break // 잴 이미지가 없다 — 고정분만 남았으니 더 봐야 소용없다

    const reqId = nextRequestId('probe')
    const promise = awaitResponse<{ totalBytes: number; failed: number }>(reqId, PROBE_TIMEOUT_MS)
    emit<ImageProbeHandler>('image:probe', {
      reqId,
      items,
      quality: profile.quality,
      reencodeOpaquePng: profile.reencodeOpaquePng
    })
    const result = await promise

    probes.push({ profileIndex, imageBytes: result.totalBytes })
    if (predictSize(fixed, result.totalBytes) <= targetBytes) break
  }

  return probes
}

/** 이 프로필로 처리한다면 각 이미지가 몇 바이트가 될지 UI 가 재볼 목록. */
async function probeItemsFor(
  order: string[],
  profile: CompressionProfile
): Promise<ImageProbeItem[]> {
  const seen = seenImageInfo()
  const byHash = new Map<string, ImageProbeItem>()

  for (const id of order) {
    const node = await figma.getNodeByIdAsync(id)
    if (node === null || node.removed || !('absoluteTransform' in node)) continue

    const frame = node as SceneNode
    const scale = transformScale(frame.absoluteTransform)
    const floor = processFloor(profile, Math.max(frame.width * scale.x, frame.height * scale.y))

    for (const plan of planFor(frame, profile)) {
      const info = seen.get(plan.imageHash)
      if (info === undefined) continue // 기준 패스에서 못 본 이미지 — 셀 근거가 없다

      const skip = info.longEdge <= floor
      const found = byHash.get(plan.imageHash)
      if (found === undefined) {
        byHash.set(plan.imageHash, {
          imageHash: plan.imageHash,
          targetLongEdge: plan.targetLongEdge,
          skip,
          originalBytes: info.bytes
        })
        continue
      }
      // 같은 이미지를 여러 프레임이 쓰면 가장 크게 쓰는 쪽에 맞춘다
      found.targetLongEdge = Math.max(found.targetLongEdge, plan.targetLongEdge)
      found.skip = found.skip && skip
    }
  }

  return [...byHash.values()]
}

/**
 * UI 에 "지금까지 보낸 부분들을 머지해서 크기만 재 달라"고 한다.
 * 큰 문서는 폰트 임베드까지 시간이 걸리므로 기본 타임아웃보다 넉넉히 준다.
 */
async function requestMeasurement(
  outName: string
): Promise<{ pdfBytes: number; imageBytes: number }> {
  const reqId = nextRequestId('fit')
  const promise = awaitResponse<{ pdfBytes: number; imageBytes: number }>(reqId, MEASURE_TIMEOUT_MS)
  emit<DoneHandler>('done', {
    reqId,
    measureOnly: true,
    fileName: outName,
    cancelled: false,
    skipped: []
  })
  return await promise
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
