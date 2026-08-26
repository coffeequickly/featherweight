// 사용자에게 보이는 모든 문장. Figma·DOM 의존 금지.
//
// UI iframe 은 navigator.language 로 언어를 알 수 있지만 메인 스레드는 아무것도 모른다.
// 그래서 UI 가 ui:ready 에 언어를 실어 보내고, 양쪽이 같은 사전을 쓴다.
// ui:ready 전에 나가는 문장(시작 시 정리 알림)만 기본값(en)으로 나간다.
//
// 값은 `{name}` 자리를 채우는 문자열이거나, 단복수처럼 문자열로 안 되는 경우의 함수다.

export type Locale = 'en' | 'ko'

type Params = Record<string, string | number>
type Message = string | ((params: Params) => string)
type Localized = { en: Message; ko: Message }

/** 영어에서만 필요한 단복수. 한국어는 수사가 굴절하지 않는다. */
const n = (count: number, one: string, other: string): string =>
  `${count} ${count === 1 ? one : other}`

const MESSAGES = {
  // ── UI 골격 ─────────────────────────────────────────────
  'app.sortPosition': { en: 'Position', ko: '위치순' },
  'app.sortName': { en: 'Name', ko: '이름순' },
  'app.excluded': { en: '{count} excluded', ko: '제외됨 {count}개' },
  'app.restore': { en: 'Restore', ko: '복원' },
  'app.embedText': { en: 'Embed text as real fonts', ko: '텍스트를 실제 폰트로 임베드' },
  'app.preparing': { en: 'Preparing…', ko: '준비 중…' },
  'app.cancel': { en: 'Cancel', ko: '취소' },
  'app.export': {
    en: (p) =>
      Number(p.count) > 0 ? `Export PDF (${n(Number(p.count), 'page', 'pages')})` : 'Export PDF',
    ko: (p) => (Number(p.count) > 0 ? `PDF 내보내기 (${p.count}쪽)` : 'PDF 내보내기')
  },
  'app.retry': { en: 'Try again', ko: '다시 시도' },
  'tab.export': { en: 'Export', ko: '내보내기' },
  'tab.images': { en: 'Images', ko: '이미지' },
  'tab.fonts': { en: 'Fonts', ko: '폰트' },
  'fonts.none': { en: 'No text in this document', ko: '문서에 쓰인 폰트가 없습니다' },
  'app.missingWarn': {
    en: '{names} — no font file, will stay as outlines. Add it in the Fonts tab',
    ko: '{names} — 파일이 없어 아웃라인으로 나갑니다 · 폰트 탭에서 넣기'
  },
  'fonts.pathHelpMac': {
    en: 'Installed fonts are in the folders below. Click a path to copy it, then press ⌘⇧G in the file dialog and paste.',
    ko: '설치된 폰트는 아래 폴더에 있습니다. 경로를 클릭해 복사한 뒤, 파일 선택 창에서 ⌘⇧G 를 누르고 붙여넣으세요.'
  },
  'fonts.pathHelpWin': {
    en: 'Installed fonts are in the folder below. Click the path to copy it, then paste it into the file name field.',
    ko: '설치된 폰트는 아래 폴더에 있습니다. 경로를 클릭해 복사한 뒤, 파일 이름 칸에 붙여넣으세요.'
  },
  'fonts.pathCopyFailed': {
    en: "Couldn't copy automatically — select the path text below and copy it manually",
    ko: '자동으로 복사하지 못했습니다 — 아래 경로를 직접 드래그해 복사해 주세요'
  },
  'fonts.pathCopiedMac': {
    en: 'Path copied — press ⌘⇧G in the file dialog and paste',
    ko: '경로 복사됨 — 파일 선택창에서 ⌘⇧G 누르고 붙여넣으세요'
  },
  'fonts.pathCopiedWin': {
    en: 'Path copied — paste it into the file name field',
    ko: '경로 복사됨 — 파일 이름 칸에 붙여넣으세요'
  },
  'app.errorGuide': {
    en: 'If it keeps failing, try exporting fewer frames at once.',
    ko: '계속 실패하면 프레임을 나눠서 내보내 보세요.'
  },
  'app.crashed': {
    en: 'Something went wrong. Close and reopen the plugin.',
    ko: '플러그인에 문제가 발생했습니다. 창을 닫았다가 다시 열어 주세요.'
  },
  'app.restoreAll': { en: 'Restore all', ko: '전부 복원' },

  // ── 프레임 목록 ─────────────────────────────────────────
  'frames.empty': {
    en: 'Select frames on the canvas to export',
    ko: '내보낼 프레임을 캔버스에서 선택하세요'
  },
  'frames.emptyHint': {
    en: 'Top-level frames · multi-select supported',
    ko: '최상위 프레임 선택 · 여러 개 선택 가능'
  },
  'frames.focus': {
    en: 'Click to show on canvas · drag to reorder',
    ko: '클릭하면 캔버스에서 보여줍니다 · 끌면 순서가 바뀝니다'
  },
  'frames.meta': {
    en: '{width}×{height} · images {images} · text {texts}',
    ko: '{width}×{height} · 이미지 {images} · 텍스트 {texts}'
  },

  // ── 이미지 설정 ─────────────────────────────────────────
  'images.preset': { en: 'Preset', ko: '프리셋' },
  'presets.sharp': { en: 'Sharp', ko: '선명하게' },
  'presets.balanced': { en: 'Balanced', ko: '균형' },
  'presets.small': { en: 'Smallest', ko: '최소 용량' },
  'presets.custom': { en: 'Custom', ko: '직접' },
  'images.help': {
    en: 'Only images larger than the frame budget are downscaled. Small images like logos pass through untouched.',
    ko: '프레임 기준을 넘는 큰 이미지만 줄입니다. 로고처럼 작은 이미지는 재인코딩 없이 그대로 둡니다.'
  },
  'images.multiplier': { en: 'Scale', ko: '배율' },
  'images.maxEdge': { en: 'Max edge', ko: '상한' },
  'images.quality': { en: 'Quality', ko: '품질' },
  'images.reencode': { en: 'Re-encode opaque PNGs as JPEG', ko: '투명 없는 PNG는 JPEG로' },

  // ── 폰트 패널 ───────────────────────────────────────────
  'fonts.title': { en: 'Fonts', ko: '폰트' },
  'fonts.summaryReady': {
    en: (p) => `${n(Number(p.count), 'font', 'fonts')} ready`,
    ko: '폰트 {count}종 준비됨'
  },
  'fonts.summaryMissing': {
    en: (p) => `${n(Number(p.missing), 'font', 'fonts')} missing`,
    ko: '폰트 {missing}종 없음'
  },
  'summary.imagesTip': {
    en: 'Image quality preset — click to open the Images tab',
    ko: '이미지 품질 프리셋 — 클릭하면 이미지 탭이 열립니다'
  },
  'summary.fontsTip': {
    en: 'Font readiness for this document — click to open the Fonts tab',
    ko: '문서 폰트 준비 상태 — 클릭하면 폰트 탭이 열립니다'
  },
  'fonts.help': {
    en: 'Open-license fonts are downloaded automatically at export. Add a file only for fonts that cannot be fetched; anything missing stays as outlines — same look, just less savings.',
    ko: '공개 폰트는 내보낼 때 자동으로 받아 옵니다. 구할 수 없는 서체만 파일을 넣으면 되고, 파일이 없는 자리는 아웃라인으로 남습니다 — 모양은 그대로 유지되고 용량만 줄지 않습니다.'
  },
  'fonts.missingNote': {
    en: (p) =>
      `${n(Number(p.missing), 'family has', 'families have')} no file and will stay as outlines`,
    ko: '{missing}종은 파일이 없어 아웃라인으로 나갑니다'
  },
  'fonts.detailCatalog': {
    en: (p) => `auto-downloaded · ${n(Number(p.count), 'text node', 'text nodes')}`,
    ko: '자동으로 받아옴 · 텍스트 {count}개'
  },
  'fonts.detailUploaded': {
    en: (p) => `${p.file} · ${p.size} · ${n(Number(p.count), 'text node', 'text nodes')}`,
    ko: '{file} · {size} · 텍스트 {count}개'
  },
  'fonts.detailMissing': {
    en: (p) => `no file · ${n(Number(p.count), 'text node', 'text nodes')} · ${p.chars} chars`,
    ko: '파일 없음 · 텍스트 {count}개 · {chars}자'
  },
  'fonts.replace': { en: 'Replace', ko: '교체' },
  'fonts.add': { en: 'Add', ko: '넣기' },
  'fonts.parseError': {
    en: 'Could not read {file} as a font. It must be a static TTF/OTF.',
    ko: '{file} 파일을 폰트로 읽지 못했습니다. static TTF/OTF 파일이어야 합니다.'
  },
  'fonts.storageFull': {
    en: 'Not enough storage ({size}). Delete fonts you no longer use.',
    ko: '저장 공간이 부족합니다 ({size}). 사용하지 않는 폰트를 지워 주세요.'
  },

  // ── 진행·결과 ───────────────────────────────────────────
  'progress.prepare': { en: 'Preparing…', ko: '준비 중…' },
  'progress.page': {
    en: 'Exporting page {page}/{pages}',
    ko: '{page}/{pages}쪽 내보내는 중'
  },
  // 한 장뿐이면 "1/1" 은 아무것도 알려주지 않는다 — 여럿일 때만 숫자를 붙인다
  'progress.pageImages': {
    en: (p) =>
      Number(p.total) > 1
        ? `Page ${p.page}/${p.pages} · optimizing images ${p.current}/${p.total}`
        : `Page ${p.page}/${p.pages} · optimizing image`,
    ko: (p) =>
      Number(p.total) > 1
        ? `${p.page}/${p.pages}쪽 · 이미지 최적화 ${p.current}/${p.total}`
        : `${p.page}/${p.pages}쪽 · 이미지 최적화`
  },
  'progress.pageSettle': {
    en: 'Page {page}/{pages} · finishing images',
    ko: '{page}/{pages}쪽 · 이미지 마무리'
  },
  'export.cancelled': { en: 'Cancelled.', ko: '취소했습니다.' },
  'export.nothing': {
    en: 'No pages could be exported. See the reasons below.',
    ko: '내보낼 수 있는 페이지가 없습니다. 아래 사유를 확인해 주세요.'
  },
  'report.cancelledPrefix': { en: 'Cancelled · ', ko: '취소됨 · ' },
  'report.summary': {
    en: (p) => `${p.file} · ${n(Number(p.pages), 'page', 'pages')} · ${p.size} · ${p.seconds}s`,
    ko: '{file} · {pages}쪽 · {size} · {seconds}초'
  },
  'report.saved': { en: '{file} · {size} saved', ko: '{file} · {size} 저장 완료' },
  'report.clickHint': {
    en: 'Click a reason to select those layers on the canvas',
    ko: '사유를 클릭하면 해당 레이어를 캔버스에서 선택합니다'
  },
  'report.textDrawn': {
    en: (p) => `${n(Number(p.count), 'text node', 'text nodes')} embedded`,
    ko: '텍스트 {count}개 임베드'
  },
  'report.noText': { en: 'No text embedded', ko: '텍스트 임베드 없음' },
  'report.images': {
    en: (p) => ` · ${n(Number(p.count), 'image', 'images')} ${p.before}→${p.after}`,
    ko: ' · 이미지 {count}장 {before}→{after}'
  },
  'report.outlines': {
    en: (p) => `${p.total} kept as outlines · ${n(Number(p.kinds), 'reason', 'reasons')}`,
    ko: '아웃라인으로 남은 텍스트 {total}개 · 사유 {kinds}가지'
  },
  'report.skipped': { en: 'Skipped — {name}: {reason}', ko: '건너뜀 — {name}: {reason}' },

  // ── 메인 스레드 알림 ────────────────────────────────────
  'main.cancelled': { en: 'Cancelled', ko: '취소했습니다' },
  'main.exportFinished': { en: 'Export finished', ko: '내보내기가 끝났습니다' },
  'main.selectFirst': { en: 'Select frames first', ko: '프레임을 먼저 선택해 주세요' },
  'main.orphanCleaned': {
    en: (p) => `Cleaned up ${n(Number(p.count), 'orphaned font blob', 'orphaned font blobs')}.`,
    ko: '저장소에 남아 있던 폰트 조각 {count}개를 정리했습니다.'
  },
  'main.leftoverCleaned': {
    en: (p) =>
      `Removed ${n(Number(p.count), 'temporary layer', 'temporary layers')} left by a previous run.`,
    ko: '이전 실행의 임시 레이어 {count}개를 정리했습니다.'
  },
  'main.fontSaved': { en: '{family} {style} saved', ko: '{family} {style} 저장 완료' },
  'main.fontSaveFailed': { en: 'Font save failed: {error}', ko: '폰트 저장 실패: {error}' },
  'main.fontDeleteFailed': { en: 'Font delete failed: {error}', ko: '폰트 삭제 실패: {error}' },

  // ── 텍스트 처리 제외 사유 ───────────────────────────────
  'reject.hidden': { en: 'hidden node', ko: '숨겨진 노드' },
  'reject.empty': { en: 'empty text', ko: '빈 텍스트' },
  'reject.rotated': { en: 'rotated or flipped text', ko: '회전·반전된 텍스트' },
  'reject.mixedFill': { en: 'mixed fills', ko: 'fill 이 섞여 있음' },
  'reject.noFill': { en: 'no fill', ko: 'fill 없음' },
  'reject.nonSolidFill': {
    en: 'non-solid fill (gradient/image)',
    ko: '단색이 아닌 fill (그라데이션·이미지)'
  },
  'reject.stroked': { en: 'has strokes', ko: '스트로크 있음' },
  'reject.effects': { en: 'has effects (shadow/blur)', ko: '이펙트 있음 (그림자·블러)' },
  'reject.decorated': {
    en: 'underline/strikethrough (not supported yet)',
    ko: '밑줄·취소선 텍스트 (미지원)'
  },
  'reject.noBounds': { en: 'cannot read bounding box', ko: '바운딩 박스를 읽을 수 없음' },
  'reject.svgEmpty': { en: 'no text found in SVG', ko: 'SVG 에서 텍스트를 찾지 못함' },

  // ── 폰트 구하기 실패 사유 ───────────────────────────────
  'font.needUpload': {
    en: '{family} {style} has no file (add it yourself)',
    ko: '{family} {style} 파일이 없습니다 (직접 넣어 주세요)'
  },
  'font.loadFailed': {
    en: (p) =>
      `could not load {family} {style}{why}`
        .replace('{family}', String(p.family))
        .replace('{style}', String(p.style))
        .replace('{why}', p.why === '' ? '' : ` (${p.why})`),
    ko: (p) =>
      `{family} {style} 을 불러오지 못했습니다{why}`
        .replace('{family}', String(p.family))
        .replace('{style}', String(p.style))
        .replace('{why}', p.why === '' ? '' : ` (${p.why})`)
  },
  'font.readFailed': {
    en: 'could not read the file for {family} {style}',
    ko: '{family} {style} 파일을 읽지 못했습니다'
  },
  'font.embedFailed': {
    en: '{family} {style} embed failed — {error}',
    ko: '{family} {style} 임베드 실패 — {error}'
  },
  'font.missingGlyphs': {
    en: (p) =>
      `${n(Number(p.count), 'character', 'characters')} missing from the font: ${p.sample}`,
    ko: '폰트에 없는 글자 {count}개: {sample}'
  },
  'font.styleMissing': {
    en: '{family} has no {style} file (available: {styles})',
    ko: '{family} 의 {style} 파일이 없습니다 (있는 것: {styles})'
  },
  'font.noFile': { en: 'no file for {family} {style}', ko: '{family} {style} 파일이 없습니다' },
  'font.ttc': {
    en: 'Font collections (TTC) are not supported. Add a single TTF/OTF.',
    ko: '폰트 컬렉션(TTC)은 지원하지 않습니다. 단일 TTF/OTF 파일을 넣어 주세요.'
  },

  // ── 내보내기 실패 사유 ──────────────────────────────────
  'exporter.nodeGone': {
    en: 'node not found (it may have been deleted)',
    ko: '노드를 찾을 수 없습니다 (삭제됐을 수 있습니다)'
  },
  'exporter.badType': {
    en: 'type cannot be exported ({type})',
    ko: '내보낼 수 없는 타입 ({type})'
  },
  'image.warn': { en: 'image {hash}: {detail}', ko: '이미지 {hash}: {detail}' },
  'image.missing': {
    en: 'image {hash}: original not found',
    ko: '이미지 {hash}: 원본을 찾을 수 없습니다'
  },
  'image.replaceFailed': {
    en: 'image {hash}: replacement failed — {error}',
    ko: '이미지 {hash}: 교체 실패 — {error}'
  },
  'resize.noContext': { en: 'cannot create a 2d context', ko: '2d 컨텍스트를 만들 수 없습니다' },
  'pdf.noParts': { en: 'no PDFs to merge', ko: '머지할 PDF 가 없습니다' },
  // 가공하지 않은 에러 메시지를 사유 구조에 실어 나를 때 쓴다
  'reason.raw': { en: '{message}', ko: '{message}' },
  'bridge.timeout': {
    en: 'no UI response within {seconds}s ({reqId})',
    ko: 'UI 응답이 {seconds}초 안에 오지 않았습니다 ({reqId})'
  },
  'timeout.notFinished': {
    en: '{label}: did not finish within {seconds}s',
    ko: '{label}: {seconds}초 안에 끝나지 않았습니다'
  }
} as const satisfies Record<string, Localized>

export type MessageKey = keyof typeof MESSAGES

let current: Locale = 'en'

export function setLocale(locale: Locale): void {
  current = locale
}

export function currentLocale(): Locale {
  return current
}

/** BCP 47 태그 → 지원 언어. 모르는 언어는 영어. */
export function detectLocale(languageTag: string): Locale {
  return languageTag.toLowerCase().startsWith('ko') ? 'ko' : 'en'
}

export function t(key: MessageKey, params: Params = {}): string {
  const message: Message = MESSAGES[key][current]
  if (typeof message === 'function') return message(params)
  return message.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name]
    return value === undefined ? whole : String(value)
  })
}

/** 테스트용 — 모든 키를 양 언어로 순회할 수 있게 한다. */
export const MESSAGE_KEYS = Object.keys(MESSAGES) as MessageKey[]

/** Reason({code, params}) → 현재 언어의 문장. (구조는 lib/types 의 Reason) */
export function formatReason(reason: { code: MessageKey; params?: Params }): string {
  return t(reason.code, reason.params ?? {})
}

/**
 * 숫자 구분자를 현재 사전 언어에 맞춘다.
 * toLocaleString() 을 인자 없이 부르면 OS 로캘을 따라가서, 영어 UI 인데
 * 숫자만 다른 로캘 서식으로 나오는 어긋남이 생긴다.
 */
export function formatNumber(value: number): string {
  return value.toLocaleString(current === 'ko' ? 'ko-KR' : 'en-US')
}
