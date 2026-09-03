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
  'app.preparing': { en: 'Preparing…', ko: '준비 중…' },
  'app.closeReport': { en: 'Close', ko: '닫기' },
  'app.cancel': { en: 'Cancel', ko: '취소' },
  'app.export': {
    en: (p) =>
      Number(p.count) > 0 ? `Export PDF (${n(Number(p.count), 'page', 'pages')})` : 'Export PDF',
    ko: (p) => (Number(p.count) > 0 ? `PDF 내보내기 (${p.count}쪽)` : 'PDF 내보내기')
  },
  'app.retry': { en: 'Try again', ko: '다시 시도' },
  // ── 화면 이동 ─────────────────────────────────────────
  // 메인 한 화면 + 하위 화면. 하위 화면 헤더에 "‹ 제목" 으로 뜬다.
  'screen.back': { en: 'Back', ko: '뒤로' },
  'screen.settings': { en: 'Advanced settings', ko: '고급 설정' },
  'screen.frames': { en: 'Arrange', ko: '정렬하기' },
  'screen.fonts': { en: 'Fonts', ko: '폰트' },
  'screen.text': { en: 'Outlined text', ko: '아웃라인 처리될 텍스트' },
  'screen.preview': { en: 'Text check', ko: '텍스트 확인' },
  'settings.reset': { en: 'Reset', ko: '기본값으로' },
  'fonts.none': { en: 'No text in this document', ko: '문서에 쓰인 폰트가 없습니다' },
  // 아무것도 선택하지 않았을 때만 보이는 약속 — 프레임을 고르면 체크리스트가 대신 말한다
  // 디자인 파일에서는 프레임, Slides 에서는 슬라이드 — 문장에 {unit}/{units} 로 끼운다
  'unit.frame': { en: 'frame', ko: '프레임' },
  'unit.frames': { en: 'frames', ko: '프레임' },
  'unit.slide': { en: 'slide', ko: '슬라이드' },
  'unit.slides': { en: 'slides', ko: '슬라이드' },
  'app.promise': {
    en: 'Images in the selected {units} are downscaled to the size they are shown at, and text is embedded with real fonts.',
    ko: '선택한 {unit}의 이미지는 보이는 크기에 맞춰 줄이고, 텍스트는 진짜 폰트로 넣습니다.'
  },

  // ── 내보내기 전 체크리스트 ───────────────────────────────
  // 네 줄: 프레임 · 이미지 · 폰트 · 텍스트. 문제가 있으면 그 줄이 경고가 되고 갈 곳을 단다.
  'preflight.title': { en: 'Before you export', ko: '내보내기 전에' },
  'preflight.checking': { en: 'Checking…', ko: '확인 중…' },
  'preflight.scanning': { en: 'Reading the selection', ko: '선택한 프레임을 읽는 중' },
  'preflight.frames': {
    en: (p) => `${n(Number(p.count), String(p.unit), String(p.units))} · ${p.size}`,
    ko: '{unit} {count}장 · {size}'
  },
  'preflight.framesMixed': { en: 'mixed sizes', ko: '크기 여러 가지' },
  'preflight.framesAsIs': { en: 'As selected on the canvas', ko: '캔버스에서 선택한 그대로' },
  'preflight.slidesAsIs': { en: 'In deck order', ko: '덱 순서 그대로' },
  'preflight.framesReordered': { en: 'Custom order', ko: '순서 직접 정함' },
  'preflight.framesExcluded': {
    en: (p) => `${p.count} excluded`,
    ko: '{count}장 제외'
  },
  // 줄마다 제목 + 한 줄 설명 — 설명이 없는 줄이 섞이면 줄 높이가 달라져 정렬이 깨진다
  'preflight.imagesNone': { en: 'No images', ko: '이미지 없음' },
  'preflight.imagesNoneDetail': { en: 'Nothing to downscale', ko: '줄일 것이 없습니다' },
  'preflight.imagesRule': {
    en: 'up to {multiplier}× shown size · max {maxEdge}px',
    ko: '보이는 크기의 {multiplier}배까지 · 최대 {maxEdge}px'
  },
  'preflight.imagesFitDetail': {
    en: 'quality chosen to fit {target}',
    ko: '화질은 {target}에 맞춰 정합니다'
  },
  'preflight.noTextDetail': {
    en: 'No text layers in the selected {units}',
    ko: '선택한 {unit}에 텍스트가 없습니다'
  },
  'preflight.textOffDetail': {
    en: 'No search, copy or ATS parsing',
    ko: '검색·복사·ATS 파싱이 안 됩니다'
  },
  'preflight.images': {
    en: (p) => n(Number(p.count), 'image', 'images'),
    ko: '이미지 {count}장'
  },
  'preflight.imagesSizing': {
    en: 'Reading sizes · {done}/{total}',
    ko: '원본 크기 읽는 중 · {done}/{total}'
  },
  'preflight.imagesShrink': {
    en: (p) => `${p.shrink} of ${p.total} images will be downscaled`,
    ko: '이미지 {total}장 중 {shrink}장 줄임 예정'
  },
  'preflight.imagesAllKept': {
    en: (p) => `${n(Number(p.total), 'image', 'images')} · nothing to downscale`,
    ko: '이미지 {total}장 · 줄일 것 없음'
  },
  'preflight.imagesKeptTiny': {
    en: (p) => `${p.count} at or under ${p.minEdge}px stay untouched`,
    ko: '{minEdge}px 이하 {count}장은 그대로 둡니다'
  },
  'preflight.imagesWithinBudget': {
    en: 'All within the frame budget — kept as they are',
    ko: '전부 프레임 크기 안이라 그대로 둡니다'
  },
  'preflight.fontsNone': { en: 'No text', ko: '텍스트 없음' },
  'preflight.fontsReady': {
    en: (p) => `All ${n(Number(p.count), 'font', 'fonts')} ready`,
    ko: '폰트 {count}종 전부 준비됨'
  },
  'preflight.fontsAuto': {
    en: '{names} · downloaded automatically',
    ko: '{names} · 자동으로 받아옵니다'
  },
  'preflight.fontsMixed': {
    en: '{names} · some from your files',
    ko: '{names} · 일부는 직접 넣은 파일'
  },
  // 폰트 줄은 원인만 말한다 — "아웃라인" 이라는 결말은 텍스트 줄 하나가 맡는다
  'preflight.fontsFileMismatch': {
    en: (p) =>
      Number(p.count) === 1
        ? 'An added font file has a different weight'
        : `${p.count} added font files have a different weight`,
    ko: '직접 넣은 폰트 파일 {count}개의 굵기가 다릅니다'
  },
  'preflight.fontsFileUnusable': {
    en: (p) =>
      Number(p.count) === 1
        ? "An added font file can't be used"
        : `${p.count} added font files can't be used`,
    ko: '직접 넣은 폰트 파일 {count}개를 쓸 수 없습니다'
  },
  'preflight.fontsFileProblemMore': {
    en: (p) => ` and ${p.count} more`,
    ko: ' 외 {count}종'
  },
  'preflight.fontsMissing': {
    en: (p) =>
      `${n(Number(p.missing), 'font', 'fonts')} missing · used in ${n(Number(p.texts), 'text', 'texts')}`,
    ko: '폰트 {missing}종 없음 · 텍스트 {texts}개에 쓰임'
  },
  // first = 없는 폰트 첫 이름, more = 없는 폰트 나머지 수, auto = 자동으로 받아올 수
  'preflight.fontsMissingDetail': {
    en: (p) =>
      `${p.first}${Number(p.more) > 0 ? ` and ${p.more} more` : ''}${
        Number(p.auto) > 0 ? ` · the other ${p.auto} download automatically` : ''
      }`,
    ko: (p) =>
      `${p.first}${Number(p.more) > 0 ? ` 외 ${p.more}종` : ''}${
        Number(p.auto) > 0 ? ` · 나머지 ${p.auto}종은 자동으로 받아옵니다` : ''
      }`
  },
  'preflight.fontsAction': { en: 'Add fonts', ko: '폰트 지정' },
  'preflight.textNone': { en: 'No text', ko: '텍스트 없음' },
  'preflight.textAll': {
    en: (p) => `All ${n(Number(p.count), 'text', 'texts')} in real fonts`,
    ko: '텍스트 {count}개 전부 진짜 폰트로'
  },
  'preflight.textAllDetail': {
    en: 'Nothing will be outlined',
    ko: '아웃라인 처리될 것이 없습니다'
  },
  'preflight.textSome': {
    en: (p) => `${n(Number(p.count), 'text', 'texts')} will be outlined`,
    ko: '텍스트 {count}개가 아웃라인 처리됩니다'
  },
  'preflight.textAction': { en: 'Show layers', ko: '레이어 보기' },
  'preflight.textOff': {
    en: 'All text goes out as outlines — the option is on',
    ko: '아웃라인 내보내기가 켜져 있어 텍스트 전부 아웃라인 처리됩니다'
  },
  'preflight.textOffAction': { en: 'Turn off', ko: '끄기' },
  'preflight.moreReasons': {
    en: (p) => ` · ${p.count} more`,
    ko: ' 외 {count}가지'
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
  // Slides 는 아무것도 안 고르면 덱 전체라, 빈 화면은 덱에 슬라이드가 없을 때뿐이다
  'frames.emptySlides': { en: 'This deck has no slides yet', ko: '이 덱에 슬라이드가 없습니다' },
  'frames.emptyHint': {
    en: 'Frames, or a section holding them · multi-select supported',
    ko: '프레임이나 프레임을 묶은 섹션 · 여러 개 선택 가능'
  },
  'frames.focus': {
    en: 'Click to show on canvas · drag to reorder',
    ko: '클릭하면 캔버스에서 보여줍니다 · 끌면 순서가 바뀝니다'
  },
  'frames.meta': {
    en: (p) =>
      `${p.width}×${p.height} · ${n(Number(p.images), 'image', 'images')} · ${n(Number(p.texts), 'text', 'texts')}`,
    ko: '{width}×{height} · 이미지 {images} · 텍스트 {texts}'
  },

  // ── 이미지 설정 ─────────────────────────────────────────
  // 메인 화면 맨 위의 네 칸. 4칸짜리 세그먼트라 가로가 빠듯하다 — 영문은 짧게.
  'presets.sharp': { en: 'Sharp', ko: '선명하게' },
  'presets.balanced': { en: 'Balanced', ko: '균형' },
  'presets.small': { en: 'Smallest', ko: '최소 용량' },
  'presets.fit': { en: 'Target', ko: '목표 용량' },
  // "직접" 은 고를 수 있는 칸이 아니라 상태다 — 고급 설정에서 숫자를 만지면 아무 칸도
  // 켜지지 않고 이 줄이 대신 뜬다
  // 타일 아래 한 줄. 짧아야 한다 — 86px 폭에 한 줄
  'presets.tagSharp': { en: 'Print & zoom', ko: '인쇄·확대' },
  'presets.tagBalanced': { en: 'Default', ko: '기본값' },
  'presets.tagSmall': { en: 'Upload limits', ko: '업로드 한도' },
  'presets.tagFit': { en: 'Name a size', ko: 'MB 지정' },
  'presets.reset': { en: 'Reset', ko: '되돌리기' },
  'presets.resetTip': {
    en: 'Custom numbers — back to the Balanced preset',
    ko: '숫자를 직접 정한 상태입니다 — 균형 프리셋으로 되돌립니다'
  },
  'images.fitHelp': {
    en: 'Picks the best image quality that still fits the target. Quality never drops below a floor — if the target is out of reach, you get the smallest possible file and a note saying so. Takes about twice as long.',
    ko: '목표를 지키는 가장 좋은 화질을 골라 줍니다. 화질에는 하한이 있어서, 목표가 무리면 가능한 가장 작은 파일과 함께 그 사실을 알려 드립니다. 보통보다 두 배쯤 걸립니다.'
  },
  'fit.label': { en: 'File size', ko: '파일 크기' },
  'fit.under': { en: 'MB or less', ko: 'MB 이하' },
  // 프리셋 아래 칩 세 개 — 눌렀을 때 실제로 바뀌는 숫자. 뜻은 툴팁이 받는다.
  'chip.scaleTip': {
    en: (p) => `Keeps pixels up to ${p.multiplier}× the size the image is shown at`,
    ko: '보이는 크기의 {multiplier}배까지 픽셀을 남깁니다'
  },
  'chip.edgeTip': {
    en: (p) => `Long edge never above ${p.maxEdge}px · ${p.fhd}`,
    ko: '긴 변이 {maxEdge}px 를 넘지 않게 줄입니다 · {fhd}'
  },
  'chip.auto': { en: 'auto', ko: '자동' },
  'chip.autoTip': {
    en: 'Chosen automatically to fit the target size',
    ko: '목표 용량에 맞춰 자동으로 정합니다'
  },
  'images.multiplier': { en: 'Scale', ko: '배율' },
  'images.maxEdge': { en: 'Max edge', ko: '상한' },
  // ── 크기 그림 (SizeDiagram) ─────────────────────────────
  'diagram.frame': { en: '{Unit} long edge {frame}pt', ko: '{unit} 긴 변 {frame}pt' },
  'diagram.frameSample': { en: 'e.g. a {frame}pt {unit}', ko: '예: {frame}pt {unit}' },
  'diagram.wanted': {
    en: '× scale {multiplier} = {wanted}px',
    ko: '× 배율 {multiplier} = {wanted}px'
  },
  'diagram.result': {
    en: 'Full-bleed images keep up to {effective}px',
    ko: '전면 이미지는 {effective}px까지 남깁니다'
  },
  'diagram.resultCapped': {
    en: ' — the cap decides, not the scale',
    ko: ' — 배율이 아니라 상한이 정합니다'
  },
  // ── 이미지 탭 섹션 ────────────────────────────────────
  // 설명은 고정 문구가 아니라 지금 값을 되읽어 준다 — "내 설정이 뭘 하는지" 가
  // "이 항목이 무엇인지" 보다 쓸모 있다.
  'images.sectionSize': { en: 'Size', ko: '크기' },
  'images.sectionKeep': { en: 'Leave alone', ko: '손대지 않을 것' },
  'images.sectionQuality': { en: 'Compression', ko: '압축' },
  'images.keepSays': {
    en: (p) => `Images ${p.minEdge}px or smaller are never touched, in any document.`,
    ko: '{minEdge}px 이하 이미지는 어떤 문서에서도 손대지 않습니다.'
  },
  'images.qualitySays': {
    en: (p) =>
      Number(p.quality) >= 0.9
        ? 'JPEG quality. Above 0.90 the difference is hard to see, and the file grows fast.'
        : Number(p.quality) <= 0.7
          ? 'JPEG quality. Below 0.70 flat areas start to band.'
          : 'JPEG quality. 0.80 is a safe middle for screen and print.',
    ko: (p) =>
      Number(p.quality) >= 0.9
        ? 'JPEG 압축 강도. 0.90 위로는 눈으로 차이를 알기 어렵고 용량만 빠르게 늡니다.'
        : Number(p.quality) <= 0.7
          ? 'JPEG 압축 강도. 0.70 아래로는 넓은 색면에 띠가 보이기 시작합니다.'
          : 'JPEG 압축 강도. 0.80 은 화면·인쇄 양쪽에 무난합니다.'
  },
  // 프리셋 칸의 툴팁
  'presets.detailSharp': {
    en: 'keeps the most pixels, for print or zooming in',
    ko: '인쇄·확대를 생각해 픽셀을 가장 많이 남깁니다'
  },
  'presets.detailBalanced': {
    en: 'enough for a PDF read on screen',
    ko: '화면으로 볼 PDF 에 충분합니다'
  },
  'presets.detailSmall': { en: 'for tight upload limits', ko: '업로드 한도가 빡빡할 때' },
  'presets.detailFit': {
    en: 'you name the size, it finds the quality',
    ko: '크기를 정하면 화질을 찾아 줍니다'
  },
  // "건너뛰기" 는 뭘 건너뛰는지 안 읽혔다 — 작은 그림은 손대지 않고 통과한다는 뜻이다
  'images.minEdge': { en: 'Keep under', ko: '그대로 두기' },
  'images.quality': { en: 'Quality', ko: '품질' },
  'images.reencode': { en: 'Re-encode opaque PNGs as JPEG', ko: '투명 없는 PNG는 JPEG로' },
  'settings.sectionText': { en: 'Text', ko: '텍스트' },
  'settings.sectionFonts': { en: 'Fonts', ko: '폰트' },
  'settings.manageFonts': { en: 'Manage stored fonts…', ko: '저장된 폰트 관리…' },
  'settings.manageFontsSays': {
    en: 'Fonts you added, from every file — {used} of {limit} used.',
    ko: '모든 파일에서 직접 넣은 폰트 — {used} / {limit} 사용 중.'
  },
  // 진짜 폰트로 넣는 건 기본 기능이다 — 옵션은 그 반대(전부 아웃라인)를 켜는 쪽이다
  'settings.outlineAll': {
    en: 'Export all text as outlines',
    ko: '모든 텍스트를 아웃라인으로 내보내기'
  },
  'settings.keepLinks': { en: 'Keep hyperlinks', ko: '하이퍼링크 유지' },
  'settings.keepLinksSays': {
    en: 'URL links on text stay clickable in the PDF.',
    ko: '텍스트에 건 URL 링크가 PDF 에서도 눌립니다.'
  },
  'settings.outlineAllSays': {
    en: 'Only when the fonts cannot be had. Outlined text cannot be searched, copied or read by an ATS.',
    ko: '폰트를 구할 수 없을 때만 쓰세요. 아웃라인 텍스트는 검색·복사·ATS 파싱이 안 됩니다.'
  },
  'settings.fitNote': {
    en: 'Target size mode picks size and compression automatically. Only the settings below still apply.',
    ko: '목표 용량 모드에서는 크기·압축을 자동으로 정합니다. 아래 항목만 적용됩니다.'
  },

  // ── 폰트 화면 ───────────────────────────────────────────
  'fonts.help': {
    en: 'Open-license fonts are downloaded automatically at export. Add a file only for fonts that cannot be fetched. Text without a font is outlined — it looks identical, but it cannot be selected or searched, and the file stays big.',
    ko: '공개 폰트는 내보낼 때 자동으로 받아 옵니다. 구할 수 없는 폰트만 파일을 넣으면 됩니다. 폰트가 없는 텍스트는 아웃라인 처리됩니다 — 보기에는 똑같지만 선택도 검색도 안 되고 용량도 줄지 않습니다.'
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
  // ── 폰트 폴더에서 자동으로 찾기 ────────────────────────
  'fonts.scanFolder': { en: 'Find in a font folder…', ko: '폰트 폴더에서 찾기…' },
  'fonts.scanHint': {
    en: "Pick your font folder. In the dialog the files inside look greyed out — that's normal: select the folder itself and click Upload (Open on Windows). The matching .ttf/.otf files are added for you. Nothing leaves this computer.",
    ko: '폰트 폴더를 고르세요. 선택창에서 안의 파일들이 회색으로 보이는 게 정상입니다 — 폴더 자체를 고르고 업로드(윈도우는 열기)를 누르면 맞는 .ttf/.otf 를 찾아 넣습니다. 파일은 이 컴퓨터 밖으로 나가지 않습니다.'
  },
  'fonts.scanning': {
    en: 'Reading fonts… {current}/{total}',
    ko: '폰트 읽는 중… {current}/{total}'
  },
  'fonts.scanResult': {
    en: (p) => `Added ${n(Number(p.found), 'font', 'fonts')}`,
    ko: '폰트 {found}종을 추가했습니다'
  },
  'fonts.scanRest': {
    en: (p) => ` · ${p.count} not in this folder`,
    ko: ' · {count}종은 폴더에 없습니다'
  },
  'fonts.scanNone': {
    en: 'No matching .ttf/.otf in that folder',
    ko: '그 폴더에서 맞는 .ttf/.otf 를 찾지 못했습니다'
  },
  'fonts.scanSkipped': {
    en: (p) => ` · ${p.count} skipped (variable font, or no storage left)`,
    ko: ' · {count}종은 넣지 못함 (가변 폰트이거나 저장 공간 부족)'
  },
  'fonts.add': { en: 'Add', ko: '넣기' },
  'fonts.parseError': {
    en: 'Could not read {file} as a font. It must be a static TTF/OTF.',
    ko: '{file} 파일을 폰트로 읽지 못했습니다. static TTF/OTF 파일이어야 합니다.'
  },
  'fonts.storageFull': {
    en: 'Not enough storage for this file ({size}). Delete fonts you no longer use under "Stored fonts" below.',
    ko: '이 파일을 넣을 공간이 없습니다 ({size}). 아래 "저장된 폰트" 에서 안 쓰는 것을 지워 주세요.'
  },
  'fonts.sectionThisFile': { en: 'Fonts in this file', ko: '이 파일의 폰트' },
  'fonts.sectionAdd': { en: 'Add missing fonts', ko: '없는 폰트 넣기' },
  'fonts.storedTitle': { en: 'Stored fonts', ko: '저장된 폰트' },
  'fonts.storageUsage': { en: '{used} of {limit}', ko: '{used} / {limit}' },
  'fonts.storedHint': {
    en: 'Kept by the plugin, not by the file — fonts added in other files show here too. Delete what you no longer use to free space (Figma allows 5 MB).',
    ko: '파일이 아니라 플러그인에 저장됩니다 — 다른 파일에서 넣은 것도 여기 보입니다. 안 쓰는 것을 지우면 공간이 빕니다 (Figma 가 주는 한도는 5MB).'
  },
  'fonts.storedInUse': { en: ' · used in this file', ko: ' · 이 파일에서 사용 중' },
  'fonts.storedNone': { en: 'Nothing stored yet', ko: '넣어 둔 폰트가 없습니다' },

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
  // ── 목표 용량 맞추기 ──────────────────────────────────
  'progress.measure': {
    en: 'Measuring the baseline file…',
    ko: '기준 파일 크기 재는 중…'
  },
  'progress.probe': {
    en: 'Looking for the best quality that fits ({current}/{total})',
    ko: '목표에 맞는 최선의 화질 찾는 중 ({current}/{total})'
  },
  'progress.refine': {
    en: 'Re-exporting at the chosen quality',
    ko: '고른 화질로 다시 내보내는 중'
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
    en: (p) => `${n(Number(p.count), 'text node', 'text nodes')} in real fonts`,
    ko: '텍스트 {count}개 진짜 폰트로'
  },
  'report.noText': { en: 'No text embedded', ko: '진짜 폰트로 들어간 텍스트 없음' },
  // 파일에 실제로 든 것을 말한다. 우리가 Figma 에 건넨 바이트는 중간 단계일 뿐이다 —
  // Figma 가 PDF 로 내보내며 다시 인코딩해서, 23.4MB 로 넘긴 것이 1.7MB 로 들어간다.
  'report.images': {
    en: (p) => ` · ${n(Number(p.count), 'image', 'images')} ${p.size}`,
    ko: ' · 이미지 {count}장 {size}'
  },
  'report.imagesShrunk': {
    en: (p) => ` · ${p.count} shrunk`,
    ko: ' · {count}장 줄임'
  },
  'report.outlines': {
    en: (p) =>
      Number(p.kinds) > 1
        ? `${p.total} text nodes outlined · ${n(Number(p.kinds), 'reason', 'reasons')}`
        : `${p.total} text nodes outlined`,
    ko: (p) =>
      Number(p.kinds) > 1
        ? `아웃라인 처리된 텍스트 ${p.total}개 · 사유 ${p.kinds}가지`
        : `아웃라인 처리된 텍스트 ${p.total}개`
  },
  'report.skipped': { en: 'Skipped — {name}: {reason}', ko: '건너뜀 — {name}: {reason}' },
  // ── 그림이 된 글자의 무게 · 추출 미리보기 ─────────────
  'report.outlineCost': {
    en: (p) => ` · ${p.size}`,
    ko: ' · {size}'
  },
  'report.leak': {
    en: 'Some invisible leftovers stayed in the file. The text may be read twice — please report this.',
    ko: '보이지 않는 찌꺼기가 파일에 남았습니다. 글자가 두 번 읽힐 수 있습니다 — 제보해 주시면 고치겠습니다.'
  },
  'preview.empty': {
    en: 'Export first — the text a parser reads will show up here.',
    ko: '먼저 내보내 주세요. 파서가 읽어 갈 텍스트가 여기 나옵니다.'
  },
  'report.preview': { en: 'Check what a parser reads', ko: '파서가 읽을 내용 확인' },
  'preview.help': {
    en: (p) =>
      `${p.lines} lines embedded as real fonts. Outlined text is not listed — parsers drop or garble it.`,
    ko: '진짜 폰트로 들어간 {lines}줄입니다. 아웃라인 처리된 텍스트는 빠져 있습니다 — 파서가 흘리거나 깨뜨리는 쪽입니다.'
  },
  // ── 아웃라인 처리될 텍스트 화면 ─────────────────────────
  'text.help': {
    en: 'These keep their exact look but go out as outlines. Remove the stroke or effect and they embed as real fonts. Click a reason to select those layers on the canvas.',
    ko: '이 텍스트는 모양은 그대로지만 아웃라인으로 나갑니다. 선·효과를 빼면 진짜 폰트로 들어갑니다. 사유를 클릭하면 해당 레이어를 캔버스에서 선택합니다.'
  },
  'text.none': { en: 'Nothing will be outlined.', ko: '아웃라인 처리될 텍스트가 없습니다.' },
  'report.fitOk': {
    en: 'Fits {target} — the best quality that stays under it',
    ko: '{target} 안에 맞췄습니다 — 이 안에서 가장 좋은 화질입니다'
  },
  'report.fitAlready': {
    en: 'Already under {target} — kept at the best quality that fits',
    ko: '이미 {target} 이하입니다 — 이 안에서 가장 좋은 화질로 두었습니다'
  },
  'report.fitUnreachable': {
    en: "Couldn't reach {target}. This document can't go below about {floor} without dropping past the quality floor.",
    ko: '{target}까지는 줄이지 못했습니다. 이 문서는 화질 하한을 지키는 한 약 {floor} 아래로 내려가지 않습니다.'
  },

  // ── 메인 스레드 알림 ────────────────────────────────────
  'main.cancelled': { en: 'Cancelled', ko: '취소했습니다' },
  'main.exportFinished': { en: 'Export finished', ko: '내보내기가 끝났습니다' },
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
  'reject.mixedFill': { en: 'mixed fills', ko: '채우기가 섞여 있음' },
  'reject.noFill': { en: 'no fill', ko: '채우기 없음' },
  'reject.nonSolidFill': {
    en: 'non-solid fill (gradient/image)',
    ko: '단색이 아닌 채우기 (그라데이션·이미지)'
  },
  'reject.stroked': { en: 'has strokes', ko: '선이 있음' },
  'reject.effects': { en: 'has effects (shadow/blur)', ko: '효과가 있음 (그림자·흐림)' },
  'reject.decorated': {
    en: 'underline/strikethrough (not supported yet)',
    ko: '밑줄·취소선 텍스트 (미지원)'
  },
  'reject.noBounds': { en: 'cannot read bounding box', ko: '바운딩 박스를 읽을 수 없음' },
  // 체크리스트·텍스트 화면용 — export 리포트의 font.* 사유와 달리 미리 아는 것
  'reject.missingFont': {
    en: 'no font file ({family} {style})',
    ko: '폰트 없음 ({family} {style})'
  },
  // 체크리스트 요약용 — 서체마다 한 줄씩 늘어놓으면 "폰트 없음" 이 세 번 반복된다
  'reject.missingFontAny': { en: 'no font file', ko: '폰트 없음' },
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
  // ── 올린 폰트 파일 거절 ────────────────────────────────
  // 무엇이 잘못됐는지가 아니라 무엇을 올려야 하는지를 말한다
  'fontFile.variable': {
    en: 'This is a variable font — one file holding every weight. The weight cannot be picked, so it would embed the wrong one. Upload the single-weight (static) file for this style.',
    ko: '이 파일은 굵기를 한 파일에 다 담은 가변(Variable) 폰트입니다. 굵기를 고를 수 없어 엉뚱한 굵기가 들어갑니다. 이 스타일 하나짜리(static) 파일을 올려 주세요.'
  },
  'fontFile.noOutlines': {
    en: 'No usable glyphs in this file. Upload a .ttf or .otf.',
    ko: '이 파일에서 쓸 수 있는 글자 모양을 찾지 못했습니다. .ttf 나 .otf 파일을 올려 주세요.'
  },
  'fonts.fileVariable': {
    en: 'Variable font file · {slotStyle} text will export in a different weight · replace with the {slotStyle} .ttf/.otf',
    ko: '가변 폰트 파일 · {slotStyle} 텍스트가 다른 굵기로 나갑니다 · {slotStyle} .ttf/.otf 로 교체하세요'
  },
  'fonts.fileVariableAs': {
    en: 'Variable font file · {slotStyle} text will export as {fileStyle} · replace with the {slotStyle} .ttf/.otf',
    ko: '가변 폰트 파일 · {slotStyle} 텍스트가 {fileStyle} 굵기로 나갑니다 · {slotStyle} .ttf/.otf 로 교체하세요'
  },
  'fonts.fileUnusable': {
    en: 'This file cannot be embedded · replace with the {slotStyle} .ttf/.otf',
    ko: '넣을 수 없는 파일 · {slotStyle} .ttf/.otf 로 교체하세요'
  },
  'fonts.fileMismatch': {
    en: '{fileStyle} file · {slotStyle} text will export as {fileStyle} · replace with the {slotStyle} file',
    ko: '{fileStyle} 파일 · {slotStyle} 텍스트가 {fileStyle} 굵기로 나갑니다 · {slotStyle} 파일로 교체하세요'
  },
  'fontFile.weightMismatch': {
    en: 'Saved — but this file is {fileStyle}, so {slotStyle} text will export as {fileStyle}.',
    ko: '저장했습니다. 다만 이 파일은 {fileStyle} 굵기라, {slotStyle} 텍스트가 {fileStyle} 굵기로 나갑니다.'
  },
  'fonts.uploadHint': {
    en: 'Upload a .ttf or .otf — one file per weight. Variable fonts may not apply correctly.',
    ko: '.ttf 나 .otf 파일을 굵기마다 하나씩 올려 주세요. 가변(Variable) 폰트는 정상적으로 적용되지 않을 수 있습니다.'
  },
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
