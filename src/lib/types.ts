// main <-> ui 공유 타입. Figma·DOM 의존 금지. (PRD §7.3)

/**
 * `sheaf.*` 와 `__sheaf_tmp__` 는 옛 이름이지만 **바꾸면 안 된다.**
 * clientStorage 키라서 이름을 고치는 순간 기존 사용자의 저장된 설정과 폰트가 통째로
 * 사라진다(플러그인 입장에서는 처음 실행하는 것과 같다). 임시 노드 이름도 마찬가지다 —
 * 옛 버전이 남긴 잔여물을 이 이름으로 찾아 지운다.
 */
export const TMP_NODE_NAME = '__sheaf_tmp__'
/** 임시 클론의 소유권 표식(pluginData 키). 이름은 사용자도 쓸 수 있지만 이 키는 우리만 쓴다 */
export const TMP_MARK_KEY = 'sheaf.tmp'
import type { MessageKey } from './i18n'
import type { PixelSize } from './imageDensity'

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
  /**
   * 이 이미지가 캔버스에서 차지하는 크기의 몇 배까지 픽셀을 남길지.
   * PDF 는 1pt = 1/72인치라 배율이 곧 DPI다 — 1× = 72, 2× = 144, 4× = 288.
   * 3·4 는 인쇄용으로 뒤에 넣었다. 옛 저장값(1·1.5·2)은 그대로 유효하다.
   */
  multiplier: 1 | 1.25 | 1.5 | 1.75 | 2 | 2.5 | 3 | 3.5 | 4
  /** 긴 변 상한 — HD · FHD · QHD · 4K. 옛 값(1024·1600·2048·4096)은 settingsOptions.snapSettings 가 옮긴다 */
  maxEdge: 1280 | 1920 | 2560 | 3840 | 5120 | 7680
  /** 원본이 이 픽셀 이하면 아예 손대지 않는다 — 로고·아이콘을 지키는 절대 하한 */
  minEdge: 480 | 640 | 800 | 1024 | 1280 | 1600 | 2048
  reencodeOpaquePng: boolean
  embedText: boolean // Phase 2
  /** 텍스트에 건 URL 하이퍼링크를 PDF 링크 주석으로 넣는다 — 텍스트를 다시 그리며 잃는 것을 되살린다 */
  keepLinks: boolean
  /** 폰트에 없는 글자를 대체 폰트(Inter → Pretendard)로 그린다. 끄면 그 텍스트는 아웃라인 */
  glyphFallback: boolean
  /**
   * 보이는 창만 잘라 넣기 (docs/IMAGE-CROP.md). 끄면 예전처럼 이미지를 통째로 줄인다 —
   * 내보내기와 목표 용량 예측이 같이 꺼진다. 첫 배포의 도망갈 길.
   */
  cropToVisible: boolean
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
  maxEdge: 1920,
  // 균형 프리셋과 같아야 한다 — 어긋나면 새 사용자가 "균형" 이라고 보면서 다른 값을 받는다
  minEdge: 640,
  reencodeOpaquePng: true,
  embedText: true,
  keepLinks: true,
  glyphFallback: true,
  cropToVisible: true,
  fitToSize: false,
  fitTargetMb: 5
}

/**
 * 정렬 기준. 방향(뒤집기)은 따로 둔다 — 셋 × 둘을 여섯 칸으로 늘어놓으면 고를 수 없다.
 *
 * "고른 순서" 는 없다. figma.currentPage.selection 은 클릭한 차례를 보존하지 않아서
 * (실기 확인: 1·2·3·4·5 를 차례로 골랐는데 1·4·5·2·3 이 왔다) 지킬 수 없는 약속이었다.
 * 순서를 직접 정하는 길은 정렬 탭에서 행을 끌어 옮기는 쪽이고, 그 상태는 "직접" 칩이 말한다.
 */
export type SortMode = 'position' | 'name' | 'layer'

export type FrameItem = {
  id: string
  name: string
  width: number
  height: number
  x: number
  y: number
  imageCount: number
  textCount: number
  /**
   * 레이어 패널에서 위에서 몇 번째인가. Figma 의 children 은 아래에서 위 순서라
   * 뒤집어 담는다 — 화면에서 보는 순서와 같아야 "레이어 순서" 라는 말이 맞는다.
   */
  layerIndex: number
  thumb?: Uint8Array
}

export type RGBA = { r: number; g: number; b: number; a: number }

export type FontRef = { family: string; style: string }

/** 트리를 걸으며 모은 원자료 (TextNode 세그먼트 1개) */
export type RawFontSegment = FontRef & {
  nodeId: string
  charCount: number
  /** 이 세그먼트가 쓰는 글자(코드포인트, 중복 없이, 상한 있음) — 폴더의 파일이 그 글자를 갖는지 보는 데 쓴다 */
  codePoints?: number[]
  /** 글자 크기(px) — 광학 크기(opsz) static 인스턴스("Inter 18pt"/"24pt") 중 가까운 것을 고르는 데 쓴다 */
  fontSize?: number
}

/** family+style 로 합친 결과. UI 폰트 목록과 체크리스트에 쓴다. */
export type FontUsage = FontRef & {
  weight: number
  italic: boolean
  nodeCount: number
  charCount: number
  /** 이 폰트를 쓰는 텍스트 노드들 — 폰트가 없으면 이 노드들이 아웃라인으로 나간다 */
  nodeIds: string[]
  /** 문서가 이 폰트로 쓰는 글자(코드포인트, 상한 있음). 폴더에서 고른 파일이 이 글자를 갖는지 본다 */
  codePoints?: number[]
  /** 이 폰트로 쓴 글자 크기의 대표값(px, 글자 수 가중 중앙값). 광학 크기 인스턴스 중 가까운 것을 고른다 */
  size?: number
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
  /**
   * OpenType 기능 태그(소문자) → 켬/끔. ss18 같은 스타일 세트는 글리프가 바뀌고, kern/liga 는
   * Figma 가 기본으로 켜 두는데 사용자가 끌 수 있다 — 끈 것도 따라야 같은 모양이 나온다
   */
  features: Record<string, boolean>
  /**
   * 글머리·번호 목록. Figma 는 마커를 어디로도 주지 않아서(lib/listMarker 참고)
   * 이 두 값으로 우리가 만들어 그린다. 목록이 아니면 'NONE' 과 0 이다.
   */
  listType: 'ORDERED' | 'UNORDERED' | 'NONE'
  /** 들여쓰기 단계(1 부터). 텍스트 시작이 이만큼 밀린다 */
  indentation: number
}

export type TextRunSource = {
  // Phase 2, 메인 → UI
  nodeId: string
  characters: string
  svg: string
  offset: { x: number; y: number }
  /**
   * Figma 가 실제로 그린 글자의 잉크 폭(pt, 부모 배율 제거) — absoluteRenderBounds.
   * 우리 폰트로 같은 줄을 놓은 폭과 견줘 "같은 이름의 다른 판" 을 잡는다. 없으면 검사하지 않는다.
   */
  inkWidth?: number
  segments: TextSegment[]
}

/** clientStorage 에 보관 중인 폰트 1개의 메타데이터. 바이트는 별도 키에 둔다. */
/**
 * 파일 자체가 말하는 것 — 자리(style)와는 별개다. 넣을 때 적어 두고, 옛 버전이 넣어
 * 이 정보가 없는 항목은 플러그인이 뜰 때 한 번 읽어 채운다 (ui/fontFacts.ts).
 */
export type FontFileFacts = {
  /** 폰트가 들고 있는 테이블 이름들 — glyf/CFF 구분용 */
  tables: readonly string[]
  /** 가변 축 이름들. 비어 있으면 static. */
  axes: readonly string[]
  /** OS/2 의 usWeightClass */
  weightClass?: number
  /** 이탤릭 플래그 (OS/2 fsSelection) */
  italic?: boolean
  /** 가변 폰트의 굵기 축 기본값 — 인스턴스를 안 뽑으면 이 굵기로 나간다 */
  defaultWeight?: number
  /** name 테이블의 버전 숫자("3.019") — 같은 이름의 다른 판을 가려내는 데 쓴다 */
  version?: string
  /**
   * OS/2 fsType 의 임베드 허용. 규격대로 여러 비트가 켜져 있으면 덜 제한적인 쪽이다.
   * 없으면(OS/2 없음·옛 항목) 모른다 — 막지 않는다.
   */
  embedding?: 'installable' | 'editable' | 'preview' | 'restricted' | 'bitmap-only'
  /** fsType 의 "No subsetting" — 서브셋 대신 전체를 넣어야 한다 */
  noSubsetting?: boolean
  /**
   * 이 사실을 읽은 코드의 판(FACTS_VERSION). "값이 있다" 와 "검사를 마쳤다" 는 다르다 —
   * OS/2 가 없는 정상 파일은 아무리 다시 읽어도 embedding 이 안 생긴다. 이 칸이 최신이면 다시 읽지 않는다.
   */
  read?: number
}

/**
 * 사실 스키마의 판. factsOf 가 새 칸을 읽기 시작하면 올린다 — 그때만 옛 항목을 다시 읽는다.
 * 1: tables/axes/weightClass/italic/defaultWeight, 2: version, 3: embedding/noSubsetting
 */
export const FACTS_VERSION = 3

export type StoredFont = FontRef & {
  /** 자리(Figma 스타일)에서 추정한 굵기·기울기 — 파일 것이 아니다 */
  weight: number
  italic: boolean
  byteLength: number
  numGlyphs: number
  codePoints: number
  fileName: string
  /** 파일의 실제 사실. 없으면 옛 버전이 넣은 것 — 아직 검사 전 */
  facts?: FontFileFacts
}

export type PartStats = {
  imagesProcessed: number
  /** 그중 보이는 창만 잘라 넣은 원본 수 — 품질을 지키고도 바이트가 줄 때만 (lib/imageCrop.ts) */
  imagesCropped: number
  /** 조각을 만들다 실패해 기존 방식(W₀)으로 물러선 원본 수 — 출력은 정상 */
  imagesRecovered: number
  /** 우리가 만든 JPEG 출력 바이트 — PDF 에 그대로(DCT) 실린다. 나머지는 Figma 가 다시 넣는다 */
  bytesJpeg: number
  /** 이 쪽의 서로 다른 이미지 해시. 쪽마다 합쳐 "이미지 N장" 을 체크리스트와 같은 기준으로 센다 */
  imageHashes: string[]
  bytesBefore: number
  bytesAfter: number
  /** 손대지 않고 통과시킨 이미지의 바이트 합. 목표 용량 예측에만 쓴다. */
  bytesUntouched: number
  /** 아웃라인으로 남은 텍스트 노드와 사유 — 텍스트만. "아웃라인 텍스트 N개" 가 이 길이다 */
  fallbacks: Array<{ nodeId: string; reason: Reason }>
  /** 이미지 처리 경고 — nodeId 는 그 프레임. 텍스트 수에 섞이지 않게 따로 든다 */
  imageWarnings: Array<{ nodeId: string; reason: Reason }>
}

// create-figma-plugin 의 emit/on 용 핸들러 시그니처.
// (타입만 가져온다 — lib 은 런타임 의존을 갖지 않는다.)
import type { EventHandler } from '@create-figma-plugin/utilities'
import type { Transform } from './imageTarget'

export interface UiReadyHandler extends EventHandler {
  name: 'ui:ready'
  /** UI 만 언어를 안다 (navigator.language) — 메인은 이 값으로 사전을 맞춘다 */
  handler: (locale: string) => void
}

/** 어느 편집기에서 돌고 있나 — 화면 문구가 "프레임" 과 "슬라이드" 를 가른다 */
export type EditorKind = 'figma' | 'slides'

export interface EditorHandler extends EventHandler {
  name: 'editor'
  handler: (editor: EditorKind) => void
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

/**
 * 썸네일은 목록보다 늦게 온다. 프레임마다 exportAsync 를 기다렸다가 목록을 보내면
 * 30장짜리 선택에서 몇 초 동안 빈 화면이 된다 — 목록을 먼저 보내고 그림은 따라 붙인다.
 */
export interface FrameThumbsHandler extends EventHandler {
  name: 'frames:thumbs'
  handler: (thumbs: Array<{ id: string; thumb: Uint8Array }>) => void
}

/** 썸네일은 정렬 화면을 열 때만 만든다 — 31장 렌더가 캔버스를 버벅이게 했다 */
export interface FrameThumbsRequestHandler extends EventHandler {
  name: 'frames:thumbs:request'
  /**
   * 그릴 프레임의 id. 개수가 아니라 id 여야 한다 — 메인의 선택 배열은 Figma 가 준 순서고
   * UI 는 그것을 정렬해 보여 주므로, "앞에서 넷" 이 서로 다른 넷을 가리킨다.
   * 실기에서 시작 탭의 세 번째 칸이 계속 비어 있었던 이유다.
   */
  handler: (ids: string[]) => void
}

/**
 * 프레임별 이미지·텍스트 수. 목록(selection)은 이름·크기만으로 즉시 나가고, 트리를
 * 걷는 집계는 몇 장씩 끊어 편집기에 숨을 돌려 주며 뒤따라 온다.
 */
export interface FrameMetaHandler extends EventHandler {
  name: 'frames:meta'
  handler: (meta: Array<{ id: string; imageCount: number; textCount: number }>) => void
}

/** 이미지 fill 을 쓰는 노드 하나 — 표시 크기는 부모 배율까지 곱한 렌더 기준이다 */
export type ImageUsage = {
  nodeId: string
  imageHash: string
  /** 레이어 이름 — 이미지 목록에서 어느 그림인지 가리키는 유일한 단서다 */
  name: string
  /** 노드의 표시 크기 (px) */
  width: number
  height: number
  /** FILL의 창 계산용 로컬 상자. 화면 배율을 적용한 width/height와 구분한다. */
  localSize?: { width: number; height: number }
  scaleMode: 'FILL' | 'FIT' | 'CROP' | 'TILE'
  /**
   * CROP 일 때 원본의 몇 분의 몇이 이 자리에 보이는가(축별, 0~1).
   * 없으면 온전히 보이는 것으로 본다.
   */
  crop?: { x: number; y: number }
  /**
   * 이 fill 이 노드의 몇 번째인가 — 조각으로 갈아끼울 때 자리를 집는 데 쓴다.
   * 선택 시점 예고에는 없어도 되므로 선택이다.
   */
  fillIndex?: number
  /** CROP 의 imageTransform 그대로 — 창을 자르고 T′ 를 만들려면 비뿐 아니라 원점이 필요하다 */
  cropTransform?: Transform
  /** FILL·FIT 의 회전(도). 0 이 아니면 창이 축에 나란하지 않아 잘라 넣지 않는다 */
  paintRotation?: number
  /**
   * 클립 안에 남는 넓이의 비(0~1). 1 이면 온전히 보인다.
   *
   * 프레임 밖으로 넘치는 그림은 넘친 만큼이 안 보이는데도 목표 픽셀은 노드 전체로 잡힌다 —
   * 자르지 않고 통째로 줄이기 때문이다. 그 낭비를 화면이 말할 수 있게 재 둔다.
   */
  visible: number
}

export type PreflightFrame = {
  id: string
  /** 렌더 기준 긴 변(px) — 이미지 목표와 그림의 기준이다 */
  longEdge: number
  images: ImageUsage[]
}

/** 구조 때문에 진짜 폰트로 못 넣는 텍스트 — 선·효과·그라데이션 등. 폰트 유무는 따로 본다. */
export type TextReject = { nodeId: string; name: string; reason: Reason }

/**
 * 선택 시점에 미리 본 것 — 내보내기 전 체크리스트의 재료.
 *
 * 설정(배율·상한·하한)에 따라 달라지는 판단은 UI 가 한다. 메인은 설정을 모르는 사실만
 * 보낸다 — 그래야 설정을 바꿀 때마다 메인을 다시 부르지 않는다.
 */
export type Preflight = {
  frames: PreflightFrame[]
  /** 이미지 해시 → 원본 긴 변(px). 크기를 못 읽은 이미지는 빠진다. */
  imageEdges: Record<string, number>
  /**
   * 이미지 해시 → 원본 양변(px). 잘라 쓰거나 비율이 어긋난 자리의 목표를 셈하려면
   * 긴 변만으로는 부족하다 — 밀도를 정하는 축이 짧은 변일 수 있다.
   */
  imageSizes?: Record<string, PixelSize>
  textRejects: TextReject[]
  /** 원본 크기를 아직 읽는 중 — imageEdges 에 빠진 것이 "못 읽음" 이 아니라 "아직" 이다 */
  sizing?: boolean
}

export interface PreflightHandler extends EventHandler {
  name: 'preflight'
  handler: (preflight: Preflight) => void
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
  /** imageBytes 는 우리가 넣은 바이트 합, pdfImageBytes 는 PDF 안에 실제로 든 이미지 바이트 */
  handler: (payload: {
    reqId: string
    pdfBytes: number
    imageBytes: number
    /** imageBytes 중 우리가 만든 JPEG 몫 */
    imageJpegBytes: number
    pdfImageBytes: number
  }) => void
}

/** Fit to Size 결과 — 리포트에 그대로 보여준다 */
export type FitReport = {
  targetBytes: number
  outcome: 'fits' | 'already-small' | 'unreachable'
  /** 예측 크기 — unreachable 이면 이 문서에서 가능한 가장 작은 크기(하한) */
  predictedBytes: number
  /**
   * 자동으로 고른 최종 설정. 칸 이름만으로는 알 수 없고(마지막 단계가 품질만 올린 변형을 재본다)
   * PDF 에서도 못 읽는다(Figma 가 내보낼 때 다시 인코딩) — 결과 탭에 적어야 검증이 된다
   */
  profile?: {
    multiplier: number
    maxEdge: number
    minEdge: number
    quality: number
    reencodeOpaquePng: boolean
  }
  /** 재본 후보 수 — 기준 패스는 빼고 */
  candidates?: number
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

/** UI 가 옛 항목의 파일 사실을 읽어 보내면 인덱스에 적는다 → fonts:stored 로 되돌려 준다 */
export interface FontFactsHandler extends EventHandler {
  name: 'font:facts'
  handler: (payload: { ref: FontRef; facts: FontFileFacts }) => void
}

export interface FontSaveHandler extends EventHandler {
  name: 'font:save'
  /**
   * quiet — 묶음 저장(폴더 스캔)은 건마다 토스트를 띄우지 않는다. 요약은 보낸 쪽이 낸다.
   * reqId 가 있으면 저장 결과를 font:save:result 로 돌려준다 — "추가 완료" 는 그걸 받고 센다.
   */
  handler: (payload: {
    font: StoredFont
    bytes: Uint8Array
    quiet?: boolean
    reqId?: string
  }) => void
}

export interface FontSaveResultHandler extends EventHandler {
  name: 'font:save:result'
  handler: (payload: { reqId: string; ok: boolean; error?: string }) => void
}

export interface FontDeleteHandler extends EventHandler {
  name: 'font:delete'
  handler: (ref: FontRef) => void
}

/** 저장소 전체 비우기. 한도(5MB)가 빡빡해 한 종씩 지우는 것만으로는 답이 안 될 때가 있다 */
export interface FontClearHandler extends EventHandler {
  name: 'fonts:clear'
  handler: () => void
}

export interface NoticeHandler extends EventHandler {
  name: 'notice'
  handler: (payload: { message: string; error: boolean }) => void
}

/** 원본 안에서 잘라 낼 정수 사각형(px) */
export type CropRect = { x0: number; y0: number; w: number; h: number }

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

/** 한 원본에서 조각 여럿 — UI 가 한 번만 디코드하고 job 마다 자르고 줄이고 인코딩한다 */
export type ResizeManyRequestPayload = {
  reqId: string
  bytes: Uint8Array
  quality: number
  reencodeOpaquePng: boolean
  jobs: Array<{ targetLongEdge: number; crop: CropRect }>
}

export interface ImageResizeManyHandler extends EventHandler {
  name: 'image:resizeMany'
  handler: (payload: ResizeManyRequestPayload) => void
}

export type ResizeManyResultPayload =
  | {
      reqId: string
      ok: true
      results: Array<{ bytes: Uint8Array; mime: string; width: number; height: number }>
    }
  | { reqId: string; ok: false; reason: string }

export interface ImageResizeManyResultHandler extends EventHandler {
  name: 'image:resizeMany:result'
  handler: (payload: ResizeManyResultPayload) => void
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
/**
 * 목표 용량 예측 항목 — **쪽마다 하나**. PDF 에는 쪽마다 부분 PDF 를 따로 뽑아 합치므로 같은 원본도
 * 쪽마다 한 벌씩 실리고, 창·목표는 쪽마다 다를 수 있다. 같은 결과만 인코딩 캐시로 재사용한다.
 * 채택(W₀ 인가 조각인가)은 export 와 같은 규칙(lib/imageCrop chooseCrop)으로 tallyProbe 가 정한다.
 */
export type ImageProbeItem = {
  imageHash: string
  targetLongEdge: number
  /** 메인이 이 프로필에서 손대지 않을 이미지 — 인코딩 없이 원본 바이트로 센다 */
  skip: boolean
  /** 원본 바이트 수. skip 이거나 캐시에 없을 때 이 값으로 센다. */
  originalBytes: number
  /** 이 쪽에서 조각으로 바꿀 수 있는 계획. 없으면 W₀ 그대로 */
  pieces?: Array<{ targetLongEdge: number; crop: CropRect }>
  /** 조각들의 최소 밀도 이득(기존 대비 배) — chooseCrop 의 인자 */
  densityGain?: number
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
  handler: (payload: {
    reqId: string
    totalBytes: number
    /** totalBytes 중 우리가 만든 JPEG 몫 — 보정하지 않는다 */
    jpegBytes: number
    failed: number
  }) => void
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

export interface ErrorHandler extends EventHandler {
  name: 'error'
  handler: (payload: { message: string }) => void
}
