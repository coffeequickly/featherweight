// main <-> ui 공유 타입. Figma·DOM 의존 금지. (PRD §7.3)

export const TMP_NODE_NAME = '__sheaf_tmp__'
import type { MessageKey } from './i18n'

export const SETTINGS_KEY = 'sheaf.settings.v1'

/**
 * 사람에게 보여줄 "사유". 번역된 문자열 대신 코드+파라미터로 다닌다 —
 * 표시 언어와 분리되고, 사유별 후속 처리(그룹핑·도움말)가 문자열 비교에 안 묶인다.
 * 렌더링은 i18n.formatReason 이 한다. 코드 'reason.raw' 는 가공 없는 에러 메시지用.
 */
export type Reason = {
  code: MessageKey
  params?: Record<string, string | number>
}

/** figma.clientStorage 는 플러그인당 5MB. Uint8Array 는 JSON 팽창 없이 실제 크기로 계산된다. */
export const CLIENT_STORAGE_LIMIT = 5 * 1024 * 1024

export type Settings = {
  version: 2
  quality: number // 0.5–1.0
  multiplier: 1 | 1.5 | 2
  maxEdge: 1024 | 1600 | 2048 | 4096
  reencodeOpaquePng: boolean
  embedText: boolean // Phase 2
  /** 목표 용량에 맞춰 압축을 자동으로 고른다 (docs/FIT-TO-SIZE.md) */
  fitToSize: boolean
  fitTargetMb: number
}

export const DEFAULT_SETTINGS: Settings = {
  // v2: embedText 기본 on — 이 플러그인의 핵심 기능이 꺼진 채 출고되면 안 된다.
  // 버전을 올려 v1 로 저장된 설정(기본 off 시절)을 무효화한다.
  version: 2,
  quality: 0.8,
  multiplier: 1.5,
  maxEdge: 2048,
  reencodeOpaquePng: true,
  embedText: true,
  fitToSize: false,
  fitTargetMb: 5
}

export type SortMode = 'position' | 'name'

export type FrameItem = {
  id: string
  name: string
  width: number
  height: number
  x: number
  y: number
  imageCount: number
  textCount: number
  thumb?: Uint8Array
}

export type RGBA = { r: number; g: number; b: number; a: number }

export type FontRef = { family: string; style: string }

/** 트리를 걸으며 모은 원자료 (TextNode 세그먼트 1개) */
export type RawFontSegment = FontRef & { nodeId: string; charCount: number }

/** family+style 로 합친 결과. UI 폰트 목록과 fonts.json 초안에 쓴다. */
export type FontUsage = FontRef & {
  weight: number
  italic: boolean
  nodeCount: number
  charCount: number
}

export type TextSegment = {
  start: number
  end: number
  fontName: { family: string; style: string }
  fontSize: number
  fills: RGBA[]
  letterSpacing: { unit: 'PIXELS' | 'PERCENT'; value: number }
  textDecoration: string
  textCase: string
  hyperlink: { type: 'URL'; value: string } | null
}

export type TextRunSource = {
  // Phase 2, 메인 → UI
  nodeId: string
  characters: string
  svg: string
  offset: { x: number; y: number }
  segments: TextSegment[]
}

/** clientStorage 에 보관 중인 폰트 1개의 메타데이터. 바이트는 별도 키에 둔다. */
export type StoredFont = FontRef & {
  weight: number
  italic: boolean
  byteLength: number
  numGlyphs: number
  codePoints: number
  fileName: string
}

export type PartStats = {
  imagesProcessed: number
  bytesBefore: number
  bytesAfter: number
  /** 손대지 않고 통과시킨 이미지의 바이트 합. 목표 용량 예측에만 쓴다. */
  bytesUntouched: number
  fallbacks: Array<{ nodeId: string; reason: Reason }>
}

// create-figma-plugin 의 emit/on 용 핸들러 시그니처.
// (타입만 가져온다 — lib 은 런타임 의존을 갖지 않는다.)
import type { EventHandler } from '@create-figma-plugin/utilities'

export interface UiReadyHandler extends EventHandler {
  name: 'ui:ready'
  /** UI 만 언어를 안다 (navigator.language) — 메인은 이 값으로 사전을 맞춘다 */
  handler: (locale: string) => void
}

export interface SettingsHandler extends EventHandler {
  name: 'settings'
  handler: (value: Settings) => void
}

export interface SettingsSaveHandler extends EventHandler {
  name: 'settings:save'
  handler: (value: Settings) => void
}

export interface SelectionHandler extends EventHandler {
  name: 'selection'
  handler: (items: FrameItem[]) => void
}

export interface FontsHandler extends EventHandler {
  name: 'fonts'
  handler: (items: FontUsage[]) => void
}

export type ExportRequest = { order: string[]; settings: Settings; fileName: string }

export interface ExportHandler extends EventHandler {
  name: 'export'
  handler: (request: ExportRequest) => void
}

export interface CancelHandler extends EventHandler {
  name: 'cancel'
  handler: () => void
}

export type Progress = { label: string; current: number; total: number }

export interface ProgressHandler extends EventHandler {
  name: 'progress'
  handler: (progress: Progress) => void
}

/** 프레임 1개 = PDF 1부. UI 가 index 순으로 머지한다. */
export type PdfPart = {
  index: number
  name: string
  bytes: Uint8Array
  text: TextRunSource[]
  stats: PartStats
}

export interface PdfPartHandler extends EventHandler {
  name: 'pdf:part'
  handler: (part: PdfPart) => void
}

/** 측정 패스 결과 — UI 가 머지한 실제 PDF 크기를 메인에 돌려준다 */
export interface FitMeasuredHandler extends EventHandler {
  name: 'fit:measured'
  handler: (payload: { reqId: string; pdfBytes: number; imageBytes: number }) => void
}

/** Fit to Size 결과 — 리포트에 그대로 보여준다 */
export type FitReport = {
  targetBytes: number
  outcome: 'fits' | 'already-small' | 'unreachable'
  /** 예측 크기 — unreachable 이면 이 문서에서 가능한 가장 작은 크기(하한) */
  predictedBytes: number
}

export type DoneReport = {
  /** 측정 요청의 짝 — measureOnly 일 때만 있다 */
  reqId?: string
  /** true 면 UI 는 머지해서 크기만 재고 저장하지 않는다 (목표 용량 탐색 1회차) */
  measureOnly?: boolean
  fit?: FitReport
  fileName: string
  cancelled: boolean
  skipped: Array<{ id: string; name: string; reason: Reason }>
}

export interface DoneHandler extends EventHandler {
  name: 'done'
  handler: (report: DoneReport) => void
}

export interface StoredFontsHandler extends EventHandler {
  name: 'fonts:stored'
  handler: (fonts: StoredFont[]) => void
}

export interface FontSaveHandler extends EventHandler {
  name: 'font:save'
  handler: (payload: { font: StoredFont; bytes: Uint8Array }) => void
}

export interface FontDeleteHandler extends EventHandler {
  name: 'font:delete'
  handler: (ref: FontRef) => void
}

export interface NoticeHandler extends EventHandler {
  name: 'notice'
  handler: (payload: { message: string; error: boolean }) => void
}

export type ResizeRequestPayload = {
  reqId: string
  bytes: Uint8Array
  targetLongEdge: number
  quality: number
  reencodeOpaquePng: boolean
  /** 탐색용 캐시 키 — UI 가 원본을 들고 있으려고 쓴다 (docs/FIT-TO-SIZE.md) */
  imageHash?: string
}

export interface ImageResizeHandler extends EventHandler {
  name: 'image:resize'
  handler: (payload: ResizeRequestPayload) => void
}

export type ResizeResultPayload =
  | {
      reqId: string
      ok: true
      bytes: Uint8Array
      mime: string
      width: number
      height: number
      changed: boolean
    }
  | { reqId: string; ok: false; reason: string }

export interface ImageResizeResultHandler extends EventHandler {
  name: 'image:resize:result'
  handler: (payload: ResizeResultPayload) => void
}

/** UI 가 clientStorage 의 폰트 바이트를 요청한다 (clientStorage 는 메인 전용). */
export interface FontBytesHandler extends EventHandler {
  name: 'font:bytes'
  handler: (payload: { reqId: string; ref: FontRef }) => void
}

export interface FontBytesResultHandler extends EventHandler {
  name: 'font:bytes:result'
  handler: (payload: { reqId: string; bytes: Uint8Array | null }) => void
}

/** fill 을 지우기 전에 "이 노드를 진짜 폰트로 그릴 수 있는가" 를 UI 에 묻는다. (FR-7 조건 4) */
export interface TextValidateHandler extends EventHandler {
  name: 'text:validate'
  handler: (payload: { reqId: string; sources: TextRunSource[] }) => void
}

export type TextValidateResult = {
  reqId: string
  eligible: string[]
  rejected: Array<{ nodeId: string; reason: Reason }>
}

export interface TextValidateResultHandler extends EventHandler {
  name: 'text:validate:result'
  handler: (payload: TextValidateResult) => void
}

/**
 * 목표 용량 탐색용. 캐시된 원본을 주어진 설정으로 재인코딩해 바이트 합계만 돌려준다.
 * 실제 fill 교체도, Figma 왕복도 없다 — 그래서 후보를 여러 개 재도 싸다.
 */
export type ImageProbeItem = {
  imageHash: string
  targetLongEdge: number
  /** 메인이 이 프로필에서 손대지 않을 이미지 — 인코딩 없이 원본 바이트로 센다 */
  skip: boolean
  /** 원본 바이트 수. skip 이거나 캐시에 없을 때 이 값으로 센다. */
  originalBytes: number
}

/**
 * 리사이즈 없이 원본 바이트만 UI 캐시에 넣는다.
 * 이번 프로필에서는 건너뛰지만 더 센 프로필에서는 처리될 이미지가 있어서,
 * 그때 재보려면 원본이 UI 에 있어야 한다. Fit to Size 일 때만 보낸다.
 */
export interface ImageCacheHandler extends EventHandler {
  name: 'image:cache'
  handler: (payload: { imageHash: string; bytes: Uint8Array }) => void
}

export interface ImageProbeHandler extends EventHandler {
  name: 'image:probe'
  handler: (payload: {
    reqId: string
    items: ImageProbeItem[]
    quality: number
    reencodeOpaquePng: boolean
  }) => void
}

export interface ImageProbeResultHandler extends EventHandler {
  name: 'image:probe:result'
  handler: (payload: { reqId: string; totalBytes: number; failed: number }) => void
}

/** 문서 이름 — UI 가 파일명 기본값을 제안할 때 쓴다. */
export interface DocNameHandler extends EventHandler {
  name: 'doc:name'
  handler: (name: string) => void
}

/** 목록의 프레임을 캔버스에서 보여준다 — 선택은 건드리지 않는다. */
export interface FrameFocusHandler extends EventHandler {
  name: 'frame:focus'
  handler: (id: string) => void
}

/** 리포트 사유를 클릭하면 해당 노드들을 선택하고 화면에 담는다. */
export interface NodesFocusHandler extends EventHandler {
  name: 'nodes:focus'
  handler: (ids: string[]) => void
}

/** UI 가 끝낸 일을 figma.notify 토스트로 알린다 (플러그인 창 밖에서도 보인다). */
export interface ToastHandler extends EventHandler {
  name: 'toast'
  handler: (message: string) => void
}

/** UI 에서 창 크기를 조절하면 메인이 figma.ui.resize 를 부른다. */
export interface ResizeWindowHandler extends EventHandler {
  name: 'resize:window'
  handler: (size: { width: number; height: number }) => void
}

export interface ErrorHandler extends EventHandler {
  name: 'error'
  handler: (payload: { message: string }) => void
}
