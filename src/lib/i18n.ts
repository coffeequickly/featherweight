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
  // 정렬 기준 넷. 방향은 따로 — 여덟 조합을 칸으로 늘어놓으면 고를 수 없다
  'app.sortPosition': { en: 'Canvas position', ko: '캔버스 위치' },
  'app.sortName': { en: 'Name', ko: '이름' },
  'app.sortLayer': { en: 'Layer order', ko: '레이어 순서' },
  'app.sortSelection': { en: 'Selection order', ko: '고른 순서' },
  'app.sortManual': { en: 'Custom', ko: '직접' },
  'app.sortLabel': { en: 'Sort by', ko: '기준' },
  'app.sortFlip': { en: 'Reverse the order', ko: '순서 뒤집기' },
  'app.sortReset': { en: 'Undo custom order', ko: '되돌리기' },
  'app.pageCount': {
    en: (p) => n(Number(p.count), 'page', 'pages'),
    ko: '{count}장'
  },
  'app.excludedTitle': {
    en: (p) => `${n(Number(p.count), 'page', 'pages')} left out`,
    ko: '뺀 페이지 {count}장'
  },
  'app.restore': { en: 'Restore', ko: '복원' },
  'app.preparing': { en: 'Preparing…', ko: '준비 중…' },
  'app.cancel': { en: 'Cancel', ko: '취소' },
  'app.export': {
    en: (p) =>
      Number(p.count) > 0 ? `Export PDF (${n(Number(p.count), 'page', 'pages')})` : 'Export PDF',
    ko: (p) => (Number(p.count) > 0 ? `PDF 내보내기 (${p.count}쪽)` : 'PDF 내보내기')
  },
  'app.retry': { en: 'Try again', ko: '다시 시도' },
  // ── 화면 이동 ─────────────────────────────────────────
  // 탭 여섯이 작업 순서다. 하위 페이지는 탭 아래 "‹ 제목" 헤더로 드나든다.
  //
  // 탭 라벨은 아이콘 없이 글자만 쓴다 — 문제가 있는 탭은 글자색과 점으로 알린다.
  // 라벨이 길어지면 고정폭 탭바가 영어에서 넘치므로 한 단어를 유지한다.
  'tab.start': { en: 'Start', ko: '시작' },
  'tab.order': { en: 'Order', ko: '정렬' },
  'tab.fonts': { en: 'Fonts', ko: '폰트' },
  'tab.images': { en: 'Images', ko: '이미지' },
  'tab.options': { en: 'Options', ko: '옵션' },
  'tab.result': { en: 'Result', ko: '결과' },
  /** 문제 있는 탭의 스크린리더 이름 — 색과 점만으로는 전달되지 않는다 */
  'tab.needsAttention': { en: '{label}, needs attention', ko: '{label}, 확인이 필요합니다' },

  // 결과 탭은 내보내기 전에도 열린다 — 빈 채로 두지 않고 무엇이 올지 말한다
  'result.notYet': { en: 'Nothing exported yet', ko: '아직 내보내지 않았습니다' },
  'result.notYetHint': {
    en: 'After exporting, this tab shows the file size, which fonts were embedded, and the text embedded in the PDF.',
    ko: '내보내고 나면 파일 크기, PDF에 포함한 폰트, 그리고 임베딩한 텍스트를 여기서 확인합니다.'
  },

  'screen.back': { en: 'Back', ko: '뒤로' },
  'screen.text': { en: 'Outlined text', ko: '아웃라인으로 내보낼 텍스트' },
  'screen.preview': {
    en: 'Embedded text',
    ko: '임베딩한 텍스트'
  },
  'settings.reset': { en: 'Reset all settings', ko: '설정 기본값으로 되돌리기' },
  'fonts.none': { en: 'No fonts used in this document', ko: '이 문서가 쓰는 폰트가 없습니다' },
  // 아무것도 선택하지 않았을 때만 보이는 약속 — 프레임을 고르면 체크리스트가 대신 말한다
  // 디자인 파일에서는 프레임, Slides 에서는 슬라이드 — 문장에 {unit}/{units} 로 끼운다
  'unit.frame': { en: 'frame', ko: '프레임' },
  'unit.frames': { en: 'frames', ko: '프레임' },
  'unit.slide': { en: 'slide', ko: '슬라이드' },
  'unit.slides': { en: 'slides', ko: '슬라이드' },
  'app.promise': {
    en: 'Optimizes images in the selected {units} and embeds fonts for supported text.',
    ko: '선택한 {unit}의 이미지를 최적화하고, 지원하는 텍스트의 폰트를 PDF에 포함합니다.'
  },

  // ── 시작 탭의 상태 ────────────────────────────────────
  // 문제만 카드로 세우고 나머지는 회색 한 줄로 누른다. 정상인 줄에 갈 곳을 달지 않는다 —
  // 각 항목으로 가는 문은 탭이 이미 맡고 있어 두 번 두면 체크리스트로 되돌아간다.
  /** 문제가 있을 때만 붙는다 — 아무 문제 없는 줄 위에 달면 거짓말이 된다 */
  'start.sectionStatus': { en: 'Needs attention', ko: '확인이 필요합니다' },
  'start.fontsIncluded': {
    en: (p) => `${n(Number(p.count), 'font', 'fonts')} embedded`,
    ko: '폰트 {count}종 포함'
  },

  'start.textOffHead': {
    en: 'All text is exported as outlines',
    ko: '모든 텍스트를 아웃라인으로 내보냅니다'
  },
  'start.textOffDetail': {
    en: 'The Fonts tab has no effect. Turn this off on the Options tab.',
    ko: '폰트 탭의 설정은 적용되지 않습니다. 옵션 탭에서 끌 수 있습니다.'
  },
  'start.fontsHead': {
    en: (p) =>
      `${n(Number(p.missing), 'font is', 'fonts are')} missing, so ${n(Number(p.texts), 'text layer', 'text layers')} will be outlined`,
    ko: '폰트 {missing}종이 없어 텍스트 {texts}개를 아웃라인으로 내보냅니다'
  },
  'start.fontsDetail': {
    en: (p) =>
      `${p.first}${Number(p.rest) > 0 ? ` and ${p.rest} more` : ''}${
        Number(p.auto) > 0 ? `. The other ${p.auto} are downloaded during export.` : ''
      }`,
    ko: (p) =>
      `${p.first}${Number(p.rest) > 0 ? ` 외 ${p.rest}종` : ''}${
        Number(p.auto) > 0 ? `. 나머지 ${p.auto}종은 내보낼 때 받아옵니다.` : ''
      }`
  },
  'start.fontFilesHead': {
    en: (p) =>
      Number(p.count) === 1
        ? 'A font file does not match its style'
        : `${p.count} font files do not match their style`,
    ko: '선택한 폰트 파일 {count}개의 스타일이 요청한 스타일과 다릅니다'
  },
  'start.fontFilesUnusableHead': {
    en: (p) =>
      Number(p.count) === 1 ? 'A font file cannot be used' : `${p.count} font files cannot be used`,
    ko: '선택한 폰트 파일 {count}개를 사용할 수 없습니다'
  },
  'start.structuralHead': {
    en: (p) =>
      `${n(Number(p.count), 'text layer', 'text layers')} stay outlined even with the font embedded`,
    ko: '텍스트 {count}개는 폰트 파일을 선택해도 아웃라인으로 내보냅니다'
  },
  // 갈 곳이 탭이면 탭 이름을 그대로 쓴다 — 탭 바에 같은 글자가 있어 대응이 바로 보인다.
  // 탭이 없는 하위 페이지만 동작으로 부른다.
  'start.goOutline': { en: 'See why', ko: '사유 보기' },

  'start.pagesTitle': { en: 'Pages to export', ko: '내보낼 페이지' },
  'start.pagesMore': {
    en: (p) => `and ${n(Number(p.count), 'more page', 'more pages')}`,
    ko: '외 {count}장'
  },
  'preflight.frames': {
    en: (p) => `${n(Number(p.count), String(p.unit), String(p.units))} · ${p.size}`,
    ko: '{unit} {count}장 · {size}'
  },
  'preflight.framesMixed': { en: 'mixed sizes', ko: '크기 여러 가지' },
  'preflight.imagesShrink': {
    en: (p) => `${p.shrink} of ${p.total} images downscaled`,
    ko: '이미지 {total}장 중 {shrink}장 축소'
  },
  'preflight.imagesAllKept': {
    en: (p) => `${n(Number(p.total), 'image', 'images')} unchanged`,
    ko: '이미지 {total}장 그대로'
  },
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
    en: 'Select one or more frames, or a section holding them.',
    ko: '프레임이나 프레임을 묶은 섹션을 여러 개 선택할 수 있습니다.'
  },
  'frames.move': { en: 'Drag to reorder', ko: '끌어서 순서 바꾸기' },
  'frames.moveFor': {
    en: 'Reorder {name}. Use arrow keys to move it.',
    ko: '{name} 순서 바꾸기. 위아래 화살표 키로 옮깁니다.'
  },
  'frames.exclude': { en: 'Leave out', ko: '빼기' },
  'frames.excludeFor': { en: 'Leave {name} out', ko: '{name} 빼기' },
  'frames.focus': {
    en: 'Click to show it on the canvas. Drag to reorder.',
    ko: '클릭하면 캔버스에서 보여 줍니다. 끌면 순서가 바뀝니다.'
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
  'presets.reset': { en: 'Back to Balanced', ko: '균형 프리셋으로' },
  /** 어느 타일도 안 켜진 이유 — 상태에 이름이 없으면 "왜 아무것도 안 켜졌지" 가 된다 */
  'presets.custom': { en: 'Custom', ko: '직접 설정' },
  'presets.fromPreset': {
    en: '{label} preset settings',
    ko: '{label} 프리셋 설정입니다'
  },
  'presets.resetTip': {
    en: 'You set the numbers yourself. This returns to the Balanced preset.',
    ko: '숫자를 직접 정한 상태입니다. 균형 프리셋으로 되돌립니다.'
  },
  'images.fitHelp': {
    en: 'Picks the best image quality that still fits the target. Quality never drops below a floor. If the target is out of reach, you get the smallest possible file and a note saying so. Takes about twice as long.',
    ko: '목표를 지키는 가장 좋은 화질을 골라 줍니다. 화질에는 하한이 있어서, 목표가 무리면 가능한 가장 작은 파일과 함께 그 사실을 알려 드립니다. 보통보다 두 배쯤 걸립니다.'
  },
  'fit.label': { en: 'File size', ko: '파일 크기' },
  'fit.under': { en: 'MB or less', ko: 'MB 이하' },
  'chip.auto': { en: 'auto', ko: '자동' },
  'chip.autoTip': {
    en: 'Chosen automatically to fit the target size',
    ko: '목표 용량에 맞춰 자동으로 정합니다'
  },
  'images.multiplier': { en: 'Scale', ko: '배율' },
  'images.sectionQuality': { en: 'Quality', ko: '품질' },
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
          : 'JPEG 압축 강도. 0.80은 화면·인쇄 양쪽에 무난합니다.'
  },
  // 프리셋 칸의 툴팁
  'presets.detailSharp': {
    en: 'keeps the most pixels, for print or zooming in',
    ko: '인쇄·확대를 생각해 픽셀을 가장 많이 남깁니다'
  },
  'presets.detailBalanced': {
    en: 'enough for a PDF read on screen',
    ko: '화면으로 볼 PDF에 충분합니다'
  },
  'presets.detailSmall': { en: 'for tight upload limits', ko: '업로드 한도가 빡빡할 때' },
  'presets.detailFit': {
    en: 'you name the size, it finds the quality',
    ko: '크기를 정하면 화질을 찾아 줍니다'
  },
  'images.quality': { en: 'Quality', ko: '품질' },
  'images.reencode': { en: 'Re-encode opaque PNGs as JPEG', ko: '투명 없는 PNG는 JPEG로' },
  /** 왜 켜 두는 게 좋은지 — 사진을 PNG 로 둔 문서에서 차이가 가장 크다 */
  'images.reencodeSays': {
    en: 'PNG keeps every pixel, so a photo saved as PNG can be several times larger than the same image as JPEG. Images with transparency are left as PNG.',
    ko: 'PNG는 픽셀을 그대로 담아, 사진을 PNG로 두면 같은 그림의 JPEG보다 몇 배 커집니다. 투명한 부분이 있는 이미지는 PNG로 둡니다.'
  },
  'settings.sectionText': { en: 'Text', ko: '텍스트' },
  // 폰트를 PDF 에 포함하는 것이 기본 동작이다 — 옵션은 그 반대(전부 아웃라인)를 켜는 쪽이다
  'settings.outlineAll': {
    en: 'Export all text as outlines',
    ko: '모든 텍스트를 아웃라인으로 내보내기'
  },
  'settings.keepLinks': { en: 'Keep hyperlinks', ko: '하이퍼링크 유지' },
  'settings.keepLinksSays': {
    en: 'Hyperlinks in text remain clickable in the PDF.',
    ko: '텍스트의 하이퍼링크를 PDF에서도 사용할 수 있습니다.'
  },
  'settings.glyphFallback': {
    en: 'Draw missing characters with a fallback font',
    ko: '폰트에 없는 글자는 대체 폰트로 그리기'
  },
  'settings.glyphFallbackSays': {
    en: 'Only those characters are replaced, from Inter first, then Pretendard. When off, the whole layer is outlined instead.',
    ko: '그 글자만 Inter, 그다음 Pretendard 순으로 대체합니다. 끄면 그 텍스트 전체를 아웃라인으로 내보냅니다.'
  },
  'settings.outlineAllSays': {
    en: 'Converts all text to outlines. Search and copy may be limited, and text may not be recognized by an ATS.',
    ko: '모든 텍스트를 아웃라인으로 변환합니다. 검색·복사가 제한되거나 채용 시스템(ATS)에서 텍스트를 인식하지 못할 수 있습니다.'
  },
  // 결과를 통째로 뒤집는 옵션은 나머지와 무게가 다르다 — 상자에 따로 두고 그렇게 부른다
  // ── 이미지 탭 ─────────────────────────────────────────
  // 배율은 Figma 내보내기의 @1x @2x 와 같은 어휘다. 뜻은 설명 줄이 준다 —
  // "1.5배" 만으로는 아무것도 안 읽히지만 "150%까지 확대해도 선명하다" 는 읽힌다.
  // PDF 는 1pt = 1/72인치라 배율 × 72 가 곧 DPI 다. 인쇄 요구는 그 숫자가 받는다.
  'images.sectionResolution': { en: 'Resolution', ko: '해상도' },
  // 셋(배율·확대율·DPI)은 한 값에서 나온다 — 따로 넘기면 서로 어긋날 수 있다
  'images.zoomSays': {
    en: (p) =>
      `Stays sharp when zoomed to ${Number(p.multiplier) * 100}%. That is ${Math.round(Number(p.multiplier) * 72)} DPI in print.`,
    ko: (p) =>
      `${Number(p.multiplier) * 100}%까지 확대해도 선명합니다. 인쇄 기준으로 ${Math.round(Number(p.multiplier) * 72)} DPI입니다.`
  },
  'images.largestSays': {
    en: 'The largest placed image becomes {target}px. Smaller ones keep only what they show.',
    ko: '가장 크게 놓인 이미지가 {target}px이 됩니다. 작게 놓인 것은 보이는 만큼만 남깁니다.'
  },
  /** 상한이 배율을 이길 때만 — 고른 배율이 그대로 적용되지 않는다는 사실 */
  'images.cappedSays': {
    en: (p) =>
      `${n(Number(p.count), 'image hits', 'images hit')} the ${p.maxEdge}px per-image limit and are exported smaller than the chosen scale.`,
    ko: '이미지 {count}장은 한 장 상한 {maxEdge}px에 걸려, 고른 배율보다 작게 내보냅니다.'
  },
  'images.sectionList': { en: 'Images in this document', ko: '이 문서의 이미지' },
  'images.listCount': {
    en: (p) => `${p.shrink} of ${n(Number(p.total), 'image', 'images')} will be downscaled`,
    ko: '{total}장 중 {shrink}장이 줄어듭니다'
  },
  'images.listKept': { en: 'unchanged', ko: '그대로' },
  'images.listUnsized': { en: 'reading size', ko: '크기 읽는 중' },
  'images.listMore': {
    en: (p) => `and ${n(Number(p.count), 'more image', 'more images')}`,
    ko: '외 {count}장'
  },
  'images.listNone': { en: 'No images in this document', ko: '이 문서에 이미지가 없습니다' },
  'images.fitLocked': {
    en: 'Target size mode chooses the resolution and quality. Pick a preset on the Start tab to set them yourself.',
    ko: '목표 용량 모드에서는 해상도와 화질을 자동으로 정합니다. 직접 정하려면 시작 탭에서 프리셋을 고르세요.'
  },

  'settings.sectionCareful': { en: 'Use with care', ko: '주의해서 쓸 것' },
  /** 켜져 있을 때만 — 다른 탭의 설정이 무의미해진다는 사실을 그 자리에서 말한다 */
  'settings.outlineAllEffect': {
    en: 'The Fonts tab has no effect while this is on. All text is exported as outlines.',
    ko: '이 옵션이 켜져 있는 동안 폰트 탭의 설정은 적용되지 않습니다. 모든 텍스트를 아웃라인으로 내보냅니다.'
  },

  // ── 폰트 화면 ───────────────────────────────────────────
  'fonts.help': {
    en: 'Figma does not provide installed font files to plugins. If automatic download is unavailable, select the font file here. Without a usable file, the text is exported as outlines. Selected files stay on this computer.',
    ko: 'Figma는 컴퓨터에 설치된 폰트 파일을 플러그인에 제공하지 않습니다. 자동 다운로드를 지원하지 않는 폰트는 여기에서 파일을 선택하세요. 사용할 파일이 없으면 텍스트를 아웃라인으로 내보냅니다. 선택한 파일은 외부로 전송되지 않습니다.'
  },
  'fonts.detailCatalog': {
    en: 'Downloaded at export',
    ko: '내보낼 때 받아옴'
  },
  'fonts.detailUploaded': {
    en: 'Saved · {size}',
    ko: '저장됨 · {size}'
  },
  'fonts.whyFile': {
    en: 'Why is a font file required?',
    ko: '폰트 파일이 필요한 이유'
  },
  // ── 행에 남는 폴더 스캔 결과 — "파일 없음" 대신 스캔이 알아낸 것 ────
  'fonts.rowNoFile': {
    en: 'Font file required',
    ko: '폰트 파일 필요'
  },
  'fonts.rowNoRoom': {
    en: 'Insufficient storage',
    ko: '저장 공간 부족'
  },
  'fonts.delete': { en: 'Delete', ko: '삭제' },
  'fonts.deleteFor': {
    en: 'Delete the saved copy of {font}',
    ko: '{font} 저장 사본 삭제'
  },
  'fonts.scanBoxClose': { en: 'Close the scan result', ko: '검사 결과 닫기' },
  // ── 결과 상자 — 닫거나 다음 스캔까지 남는다 ────────────────
  'fonts.scanBoxTitle': { en: 'Folder scan:', ko: '폴더 검사:' },
  'fonts.scanBoxSaved': {
    en: '{count} saved',
    ko: '{count}종 저장됨'
  },
  'fonts.scanBoxNoRoom': {
    en: (p) => `${n(Number(p.count), 'font needs', 'fonts need')} more storage`,
    ko: '{count}종 공간 부족'
  },
  'fonts.scanBoxUnsaved': {
    en: '{count} failed to save',
    ko: '{count}종 저장 실패'
  },
  'fonts.scanBoxNotFound': {
    en: (p) => `${n(Number(p.count), 'font needs', 'fonts need')} a file`,
    ko: '{count}종 파일 필요'
  },
  'fonts.scanBoxStorage': {
    en: 'Storage needed: {need}. Available: {free}. Delete saved font files to free up space, then retry saving.',
    ko: '필요한 공간: {need}. 남은 공간: {free}. 저장된 폰트 파일을 삭제해 공간을 확보한 뒤 다시 저장하세요.'
  },
  'fonts.scanBoxRetryAll': {
    en: 'Retry saving ({count})',
    ko: '{count}종 다시 저장'
  },
  'fonts.detailBuild': { en: ' · v{build}', ko: ' · v{build}' },
  'fonts.detailVersion': { en: ' · file v{version}', ko: ' · 파일 v{version}' },
  // ── 폰트 폴더에서 자동으로 찾기 ────────────────────────
  'fonts.scanFolder': { en: 'Choose font folder…', ko: '폰트 폴더 선택…' },
  'fonts.scanHint': {
    en: 'Select the folder, not the files inside it. Greyed-out files are normal.',
    ko: '개별 파일 대신 폴더를 선택하세요. 폴더 안의 파일이 회색으로 표시되는 것은 정상입니다.'
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
    en: (p) => `${p.count} not in this folder`,
    ko: '{count}종은 폴더에 없습니다'
  },
  'fonts.scanAlternatives': {
    en: (p) =>
      `${n(Number(p.count), 'font had', 'fonts had')} multiple matching files. Styles, supported characters and versions were compared to select a file.`,
    ko: '{count}종에서 여러 후보 파일을 찾았습니다. 스타일, 지원하는 글자, 버전을 비교해 파일을 선택했습니다.'
  },
  'fonts.scanSaveFailed': {
    en: (p) => `Could not save ${n(Number(p.count), 'font', 'fonts')}. Details: ${p.error}`,
    ko: '폰트 {count}종을 저장하지 못했습니다. 상세 오류: {error}'
  },
  'fonts.scanStyleMissing': {
    en: (p) => `The required style was not found for ${n(Number(p.count), 'font', 'fonts')}.`,
    ko: '폰트 {count}종의 필요한 스타일을 찾지 못했습니다.'
  },
  'fonts.scanVariableOnly': {
    en: (p) =>
      `Only variable files were found for ${n(Number(p.count), 'font', 'fonts')}. Select static font files.`,
    ko: '폰트 {count}종은 가변 파일만 찾았습니다. 정적(static) 폰트 파일을 선택하세요.'
  },
  'fonts.scanRestricted': {
    en: (p) => `The files found for ${n(Number(p.count), 'font', 'fonts')} restrict embedding.`,
    ko: '폰트 {count}종에서 찾은 파일은 임베딩이 제한되어 있습니다.'
  },
  'fonts.scanUnusable': {
    en: (p) => `No usable files were found for ${n(Number(p.count), 'font', 'fonts')}.`,
    ko: '폰트 {count}종의 사용 가능한 파일을 찾지 못했습니다.'
  },
  'fonts.scanUnchecked': {
    en: (p) => `The scan is incomplete for ${n(Number(p.count), 'font', 'fonts')}.`,
    ko: '폰트 {count}종의 검사를 완료하지 못했습니다.'
  },
  'fonts.scanIncomplete': {
    en: 'Scan incomplete: {detail}',
    ko: '검사 미완료: {detail}'
  },
  'fonts.scanUnreadable': {
    en: (p) => `Could not read ${n(Number(p.count), 'file', 'files')}.`,
    ko: '파일 {count}개를 읽지 못했습니다.'
  },
  'fonts.scanBrokenFaces': {
    en: (p) => `Could not read ${n(Number(p.count), 'font style', 'font styles')} in collections.`,
    ko: '폰트 컬렉션에 포함된 스타일 {count}개를 읽지 못했습니다.'
  },
  'fonts.scanCapFiles': {
    en: (p) =>
      `${n(Number(p.count), 'file was', 'files were')} not checked because the scan limit was reached.`,
    ko: '검사 한도에 도달해 파일 {count}개를 확인하지 못했습니다.'
  },
  'fonts.scanCapMemory': {
    en: 'The scan stopped at the memory limit. Select a smaller folder or add the remaining font files individually.',
    ko: '메모리 사용 한도에 도달해 검사를 중단했습니다. 더 작은 폴더를 선택하거나 나머지 폰트 파일을 개별적으로 추가하세요.'
  },
  'fonts.saveNoReply': {
    en: 'No response was received for the save request.',
    ko: '저장 요청에 대한 응답을 받지 못했습니다.'
  },
  'fonts.scanFailed': {
    en: 'The font scan stopped. Files already saved have been kept. Details: {error}',
    ko: '폰트 검사를 중단했습니다. 이미 저장된 파일은 유지됩니다. 상세 오류: {error}'
  },
  'fonts.parseError': {
    en: 'Could not read {file} as a font. Check the file or select another TTF, OTF, TTC or OTC font file.',
    ko: '{file} 파일을 폰트로 읽지 못했습니다. 파일을 확인하거나 다른 TTF, OTF, TTC, OTC 폰트 파일을 선택하세요.'
  },
  'fonts.storageFull': {
    en: 'There is not enough storage for this file ({size}). Review your saved fonts and delete files you no longer need.',
    ko: '이 파일({size})을 저장할 공간이 부족합니다. 저장된 폰트 목록을 확인하고 더 이상 필요하지 않은 파일을 삭제하세요.'
  },
  'fonts.sectionThisFile': { en: 'Fonts in this document', ko: '이 문서가 쓰는 폰트' },
  // ── 패밀리 목록 ────────────────────────────────────────
  // 자리마다 한 줄이면 Pretendard 한 서체가 여섯 줄을 차지하고 여섯 줄이 같은 말을 반복한다.
  // 서체 이름 한 줄에 스타일을 뱃지로 늘어놓고, 오른쪽에 그 서체의 상태를 한 마디로 적는다.
  'fonts.familyCount': {
    en: (p) => `${n(Number(p.count), 'style', 'styles')}`,
    ko: '{count}종'
  },
  'fonts.familyMissing': {
    en: (p) => `${p.count} missing`,
    ko: '{count}종 없음'
  },
  'fonts.familyStored': { en: 'Saved · {size}', ko: '저장됨 · {size}' },
  'fonts.familyCatalog': { en: 'Downloaded at export', ko: '내보낼 때 받아옴' },
  'fonts.familyMixed': { en: 'Mixed sources', ko: '출처 섞임' },
  'fonts.stylesMore': {
    en: (p) => `and ${n(Number(p.count), 'more style', 'more styles')}`,
    ko: '외 {count}개 스타일'
  },
  /** 목록 맨 위 — 스캔 전에는 무엇이 없는지, 스캔 뒤에는 무엇이 남았는지 */
  'fonts.bannerMissing': {
    en: (p) => `${n(Number(p.count), 'font', 'fonts')} could not be found`,
    ko: '폰트 {count}종을 찾지 못했습니다'
  },
  'fonts.bannerMissingDetail': {
    en: 'Text using these fonts is exported as outlines.',
    ko: '이 폰트를 쓰는 텍스트는 아웃라인으로 내보냅니다.'
  },
  'fonts.bannerFiles': {
    en: (p) => `${n(Number(p.count), 'font file does', 'font files do')} not match their style`,
    ko: '선택한 폰트 파일 {count}개의 스타일이 요청한 스타일과 다릅니다'
  },
  // ── 패밀리 상세 ────────────────────────────────────────
  // 좁은 행에는 못 넣던 것을 여기서 다 말한다: 얼마나 쓰는지, 왜 안 되는지,
  // 안 고치면 어떻게 되는지. 셋이 모여야 사용자가 판단할 수 있다.
  'family.usedBy': {
    en: (p) => `Used by ${n(Number(p.count), 'text layer', 'text layers')} in this document`,
    ko: '이 문서의 텍스트 {count}개가 씁니다'
  },
  'family.willOutline': {
    en: 'Without a font file this text is exported as outlines.',
    ko: '폰트 파일을 선택하지 않으면 이 텍스트를 아웃라인으로 내보냅니다.'
  },
  'family.catalogSource': {
    en: 'Downloaded from jsDelivr during export. An internet connection is required.',
    ko: 'jsDelivr에서 내보낼 때 받아옵니다. 인터넷 연결이 필요합니다.'
  },
  'family.pickFile': { en: 'Select font file…', ko: '폰트 파일 선택…' },
  'family.replaceFile': { en: 'Select a different file…', ko: '다른 파일 선택…' },
  'family.ownFile': { en: 'Use my own file…', ko: '내 폰트 파일 선택…' },
  'family.deleteStored': { en: 'Delete saved copy', ko: '저장 사본 삭제' },
  'family.header': {
    en: (p) => `${n(Number(p.count), 'style', 'styles')} in this document`,
    ko: '이 문서에서 {count}종'
  },

  // ── 저장 공간 관리 ─────────────────────────────────────
  // 저장소는 문서가 아니라 플러그인 단위 자산이다 — 다른 파일에서 넣은 것도 여기 다 있다.
  // 한도(5MB)가 빡빡해서, 무엇이 자리를 차지하는지 보고 지울 수 있어야 한다.
  'screen.storage': { en: 'Manage font storage', ko: '저장 공간 관리' },
  'fonts.storageManage': { en: 'Manage storage', ko: '저장 공간 관리' },
  'fonts.storageUnused': {
    en: (p) => `${n(Number(p.count), 'font', 'fonts')} not used here · ${p.size}`,
    ko: '이 문서에서 쓰지 않는 폰트 {count}종 · {size}'
  },

  'storage.inUse': { en: 'Used in this document', ko: '이 문서에서 사용 중' },
  'storage.unused': { en: 'Not used in this document', ko: '이 문서에서 쓰지 않음' },
  'storage.empty': {
    en: 'No font files are saved in the plugin yet.',
    ko: '플러그인에 저장한 폰트 파일이 아직 없습니다.'
  },
  /** 목록 제목. 설명을 붙이려다 번역투가 됐다 — 줄마다 "이 문서에서 사용 중" 이 이미 말한다 */
  'storage.listTitle': { en: 'Saved fonts', ko: '저장 중인 폰트' },

  'fonts.storageSection': { en: 'Font storage', ko: '폰트 저장소' },
  'fonts.storageUsage': { en: 'Storage {used} of {limit}', ko: '저장 공간 {used} / {limit}' },
  'fonts.storedAllInUse': {
    en: 'Every saved font is used by this document.',
    ko: '저장한 폰트를 모두 이 문서에서 쓰고 있습니다.'
  },
  'fonts.storedNone': {
    en: 'No saved fonts',
    ko: '저장된 폰트 없음'
  },
  // 한 장뿐이면 "1/1" 은 아무것도 알려주지 않는다 — 여럿일 때만 숫자를 붙인다
  'progress.prepare': { en: 'Preparing…', ko: '준비 중…' },
  'progress.page': {
    en: 'Exporting page {page}/{pages}',
    ko: '{page}/{pages}쪽 내보내는 중'
  },
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
  'export.textLost': {
    en: '{count} text layers passed the check but could not be drawn ({reason}). The PDF was not saved. Please try again.',
    ko: '검사를 통과한 텍스트 {count}개를 그리지 못했습니다({reason}). PDF를 저장하지 않았습니다. 다시 시도해 주세요.'
  },
  'export.nothing': {
    en: 'No pages could be exported. See the reasons below.',
    ko: '내보낼 수 있는 페이지가 없습니다. 아래 사유를 확인해 주세요.'
  },
  // ── 결과 탭 ───────────────────────────────────────────
  // 맨 위가 판정이다: 파일 이름과 크기, 그리고 목표 용량을 맞췄는지. 그 아래 세 그룹이
  // 같은 문법으로 선다 — 왼쪽에 이름, 오른쪽에 한 줄 요약, 아래에 상세.
  'result.meta': {
    en: (p) => `${p.size} · ${n(Number(p.pages), 'page', 'pages')} · ${p.seconds}s`,
    ko: '{size} · {pages}쪽 · {seconds}초'
  },
  'result.sectionText': { en: 'Text', ko: '텍스트' },
  'result.sectionImages': { en: 'Images', ko: '이미지' },
  'result.sectionExtracted': { en: 'Embedded text', ko: '임베딩한 텍스트' },
  'result.seeAll': { en: 'See all', ko: '전체 보기' },
  'result.textFoldOk': {
    en: (p) => `${n(Number(p.count), 'layer', 'layers')}, all embedded`,
    ko: '{count}개 모두 포함'
  },
  'result.textFoldWarn': {
    en: (p) => `${p.total} · ${p.count} outlined`,
    ko: '{total}개 중 {count}개 아웃라인'
  },
  /** 완성된 PDF 첫 장 — 초록 테두리가 "정상적으로 나갔다" 를 말한다 */
  'result.firstPage': { en: 'First page of the exported PDF', ko: '내보낸 PDF 첫 장' },
  'result.embedded': {
    en: (p) => `${p.count} embedded with fonts`,
    ko: '{count}개는 폰트와 함께 포함'
  },
  /**
   * 아웃라인은 "내보냈다" 가 아니다 — 파일을 내보낸 것과 헷갈린다.
   * 실제로 한 일은 글자를 글리프 모양대로 그린 것이다.
   */
  'result.outlined': {
    en: (p) => `${p.count} drawn as outlines`,
    ko: '{count}개는 아웃라인으로 그림'
  },
  'result.imagesAside': {
    en: (p) => `${p.count} of ${p.total} downscaled`,
    ko: '{total}장 중 {count}장 줄임'
  },
  'result.imagesNone': { en: 'No images', ko: '이미지 없음' },
  'result.imageBytes': {
    en: 'Images in the PDF: {size}',
    ko: 'PDF에 담긴 이미지 {size}'
  },
  /** 내보내기가 실패했을 때 — 토스트는 사라지므로 원문은 여기 남는다 */
  'result.failed': { en: 'The last export failed', ko: '마지막 내보내기가 실패했습니다' },
  'result.countUnit': { en: (p) => `${p.count}`, ko: '{count}개' },
  'result.copy': { en: 'Copy all', ko: '전체 복사' },
  'result.copied': { en: 'Copied', ko: '복사했습니다' },
  'report.saved': { en: '{file} · {size} saved', ko: '{file} · {size} 저장 완료' },
  'report.clickHint': {
    en: 'Click a reason to select those layers on the canvas',
    ko: '사유를 클릭하면 해당 레이어를 캔버스에서 선택합니다'
  },
  'report.substituted': {
    en: (p) =>
      `${n(Number(p.count), 'character', 'characters')} missing from the font (${p.chars}): drawn with ${p.family}`,
    ko: '폰트에 없는 글자 {count}개({chars}): 대체 폰트 {family}'
  },
  'char.thinSpace': { en: 'thin space', ko: '얇은 공백' },
  'char.narrowNbsp': { en: 'narrow no-break space', ko: '좁은 줄바꿈 없는 공백' },
  'char.nbsp': { en: 'no-break space', ko: '줄바꿈 없는 공백' },
  'report.skipped': { en: 'Skipped {name}: {reason}', ko: '{name} 건너뜀: {reason}' },
  'report.leak': {
    en: 'Some invisible leftovers stayed in the file. The text may be read twice. Please report this so it can be fixed.',
    ko: '보이지 않는 잔여 데이터가 파일에 남았습니다. 글자가 두 번 읽힐 수 있습니다. 제보해 주시면 고치겠습니다.'
  },
  'preview.empty': {
    en: 'There is no embedded text to display. Export a PDF with supported text to view it here.',
    ko: '표시할 임베딩 텍스트가 없습니다. 지원하는 텍스트를 포함해 PDF를 내보내면 여기에서 확인할 수 있습니다.'
  },
  'preview.help': {
    en: '{lines} lines were embedded with fonts. Outlined text is not listed. This is not text extracted from the saved PDF.',
    ko: 'PDF에 폰트와 함께 포함한 텍스트 {lines}줄입니다. 아웃라인 텍스트는 표시하지 않습니다. 저장한 PDF에서 다시 추출한 결과는 아닙니다.'
  },
  // ── 아웃라인 처리될 텍스트 화면 ─────────────────────────
  'text.help': {
    en: 'These text layers will remain outlined to preserve their appearance. Select a reason to locate the affected layers, then review the font files or layer settings.',
    ko: '원본 모양을 유지하기 위해 이 텍스트를 아웃라인으로 내보냅니다. 사유를 선택해 해당 레이어를 확인한 뒤, 폰트 파일이나 레이어 설정을 검토하세요.'
  },
  'text.none': { en: 'Nothing will be outlined.', ko: '아웃라인으로 내보낼 텍스트가 없습니다.' },
  'report.fitOk': {
    en: 'Fits {target}. This is the best quality that stays under it.',
    ko: '{target} 안에 맞췄습니다. 이 안에서 가장 좋은 화질입니다.'
  },
  'report.fitAlready': {
    en: 'Already under {target}. It was kept at the best quality that fits.',
    ko: '이미 {target} 이하입니다. 이 안에서 가장 좋은 화질로 두었습니다.'
  },
  'report.fitOver': {
    en: 'The exported file is {actual}, above the {target} target. Try a lower target or the Smallest preset.',
    ko: '내보낸 파일은 {actual}로, 목표 용량 {target}을 초과했습니다. 목표 용량을 낮추거나 최소 용량 프리셋을 선택해 다시 내보내세요.'
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
    ko: '저장소에 남아 있던 폰트 데이터 {count}개를 정리했습니다.'
  },
  'main.leftoverCleaned': {
    en: (p) =>
      `Removed ${n(Number(p.count), 'temporary layer', 'temporary layers')} left by a previous run.`,
    ko: '이전 실행의 임시 레이어 {count}개를 정리했습니다.'
  },
  'main.fontSaved': { en: '{family} {style} saved', ko: '{family} {style} 저장 완료' },
  'main.fontSaveFailed': {
    en: 'Could not save the font file. Details: {error}',
    ko: '폰트 파일을 저장하지 못했습니다. 상세 오류: {error}'
  },
  'main.fontDeleteFailed': {
    en: 'Could not delete the saved font file. Details: {error}',
    ko: '저장된 폰트 파일을 삭제하지 못했습니다. 상세 오류: {error}'
  },

  // ── 텍스트 처리 제외 사유 ───────────────────────────────
  'reject.hidden': {
    en: 'Hidden layer',
    ko: '숨겨진 레이어'
  },
  'reject.empty': {
    en: 'Empty text layer',
    ko: '내용이 없는 텍스트 레이어'
  },
  'reject.rotated': {
    en: 'Rotated or flipped text',
    ko: '회전 또는 반전된 텍스트'
  },
  'reject.mixedFill': {
    en: 'Mixed fill settings',
    ko: '서로 다른 채우기 설정'
  },
  'reject.noFill': {
    en: 'No fill',
    ko: '채우기 없음'
  },
  'reject.nonSolidFill': {
    en: 'Gradient or image fill',
    ko: '그라데이션 또는 이미지 채우기'
  },
  // node.strokes 다 — 밑줄·취소선(reject.decorated)과 다른 것이다.
  // Figma 속성 패널의 이름(Stroke)을 병기해야 어느 값을 지워야 할지 찾을 수 있다.
  'reject.stroked': {
    en: 'Stroke on the text',
    ko: '글자에 선(Stroke) 적용'
  },
  'reject.effects': {
    en: 'Shadow or blur effect',
    ko: '그림자 또는 흐림 효과 적용'
  },
  'reject.decorated': {
    en: 'Underline or strikethrough',
    ko: '밑줄 또는 취소선'
  },
  'font.metricsDiffer': {
    en: 'Text width for {family} {style} differs from Figma by {percent}%. The text will remain outlined to preserve its appearance.',
    ko: '{family} {style}: Figma와 텍스트 폭이 {percent}% 차이 납니다. 원본 모양을 유지하기 위해 아웃라인으로 내보냅니다.'
  },
  'reject.mask': {
    en: 'Mask applied to the text or its group',
    ko: '텍스트 또는 상위 그룹에 적용된 마스크'
  },
  'reject.blend': {
    en: 'Non-default blend mode',
    ko: '기본값이 아닌 혼합 모드'
  },
  'reject.translucent': {
    en: 'Parent layer opacity below 100%',
    ko: '상위 레이어의 불투명도가 100% 미만'
  },
  'reject.parentEffects': {
    en: 'Parent layer has a blur or a shadow without a fill',
    ko: '상위 레이어에 적용된 흐림 효과 또는 채우기 없는 그림자'
  },
  'reject.clipped': {
    en: 'Text extends beyond the clipping frame',
    ko: '클리핑 영역을 벗어난 텍스트'
  },
  'reject.superscript': {
    en: 'Superscript or subscript is not supported',
    ko: '지원하지 않는 위첨자 또는 아래첨자'
  },
  'reject.list': {
    en: 'Bulleted or numbered lists are not supported',
    ko: '지원하지 않는 글머리 기호 또는 번호 목록'
  },
  'reject.noBounds': {
    en: 'Text bounds could not be determined',
    ko: '텍스트 영역 확인 불가'
  },
  // 체크리스트·텍스트 화면용 — export 리포트의 font.* 사유와 달리 미리 아는 것
  'reject.missingFont': {
    en: 'Font file required: {family} {style}',
    ko: '폰트 파일 필요: {family} {style}'
  },
  'reject.svgEmpty': {
    en: 'No text data found in the exported SVG',
    ko: '내보낸 SVG에 텍스트 데이터 없음'
  },

  // ── 폰트 구하기 실패 사유 ───────────────────────────────
  'font.needUpload': {
    en: 'A font file is required for {family} {style}. Select it in Fonts.',
    ko: '{family} {style} 폰트 파일이 필요합니다. 폰트 화면에서 파일을 선택하세요.'
  },
  'font.loadFailed': {
    en: (p) =>
      `Could not load the font file for {family} {style}.{why}`
        .replace('{family}', String(p.family))
        .replace('{style}', String(p.style))
        .replace('{why}', p.why === '' ? '' : ` (${p.why})`),
    ko: (p) =>
      `{family} {style} 폰트 파일을 불러오지 못했습니다.{why}`
        .replace('{family}', String(p.family))
        .replace('{style}', String(p.style))
        .replace('{why}', p.why === '' ? '' : ` (${p.why})`)
  },
  'font.readFailed': {
    en: 'Could not read the font file for {family} {style}.',
    ko: '{family} {style} 폰트 파일을 읽지 못했습니다.'
  },
  'font.embedFailed': {
    en: 'Could not embed {family} {style} in the PDF. Details: {error}',
    ko: '{family} {style} 폰트를 PDF에 포함하지 못했습니다. 상세 오류: {error}'
  },
  'font.missingGlyphs': {
    en: (p) =>
      `${n(Number(p.count), 'character', 'characters')} missing from the font: ${p.sample}`,
    ko: '폰트에 없는 글자 {count}개: {sample}'
  },
  'font.styleMissing': {
    en: 'Could not find a font file for {family} {style}. Available styles: {styles}',
    ko: '{family} {style} 폰트 파일을 찾지 못했습니다. 사용 가능한 스타일: {styles}'
  },
  'font.noFile': {
    en: 'No font file for {family} {style}',
    ko: '{family} {style} 폰트 파일 없음'
  },
  // ── 올린 폰트 파일 거절 ────────────────────────────────
  // 무엇이 잘못됐는지가 아니라 무엇을 올려야 하는지를 말한다
  'fontFile.variable': {
    en: 'Variable font files are not supported. Select a static font file for the required style. These files are often in the font download’s static folder.',
    ko: '가변 폰트 파일은 지원하지 않습니다. 필요한 스타일의 정적(static) 폰트 파일을 선택하세요. 다운로드한 폰트의 static 폴더에서 찾을 수 있는 경우가 많습니다.'
  },
  'fontFile.noOutlines': {
    en: 'This file has no supported glyph outlines. Select another TTF or OTF font file.',
    ko: '이 파일에는 지원하는 글자 윤곽 데이터가 없습니다. 다른 TTF 또는 OTF 폰트 파일을 선택하세요.'
  },
  'fontFile.restricted': {
    en: 'This font file restricts document embedding. Select a font file that permits embedding.',
    ko: '이 폰트 파일은 문서 임베딩이 제한되어 있습니다. 임베딩을 허용하는 폰트 파일을 선택하세요.'
  },
  'fontFile.bitmapOnly': {
    en: 'This font file permits bitmap embedding only, which is not supported. Select another font file.',
    ko: '이 폰트 파일은 비트맵 임베딩만 허용합니다. 이 방식은 지원하지 않으므로 다른 폰트 파일을 선택하세요.'
  },
  'fonts.fileVariable': {
    en: 'Variable font files are not supported. Replace this file with a static font file for {slotStyle}.',
    ko: '가변 폰트 파일은 지원하지 않습니다. {slotStyle} 스타일의 정적(static) 폰트 파일로 교체하세요.'
  },
  'fonts.fileVariableAs': {
    en: 'This variable font defaults to {fileStyle}. Select a static font file for {slotStyle}.',
    ko: '이 가변 폰트의 기본 스타일은 {fileStyle}입니다. {slotStyle} 스타일의 정적(static) 폰트 파일을 선택하세요.'
  },
  'fonts.fileUnusable': {
    en: 'This file cannot be embedded. Select another font file for {slotStyle}.',
    ko: '이 파일은 PDF에 포함할 수 없습니다. {slotStyle} 스타일의 다른 폰트 파일을 선택하세요.'
  },
  'fonts.fileRestricted': {
    en: 'Embedding is restricted for this font file ({slotStyle}). The text will remain outlined. Select a file with supported embedding permissions.',
    ko: '이 폰트 파일({slotStyle})은 임베딩이 제한되어 텍스트를 아웃라인으로 유지합니다. 지원하는 임베딩 권한이 있는 파일을 선택하세요.'
  },
  'fonts.fileMismatch': {
    en: 'The selected file uses {fileStyle}, but the text requires {slotStyle}. Select a font file for {slotStyle}.',
    ko: '선택한 파일은 {fileStyle} 스타일이며, 텍스트에 필요한 스타일은 {slotStyle}입니다. {slotStyle} 스타일의 파일로 교체하세요.'
  },
  'fontFile.weightMismatch': {
    en: 'The selected file uses {fileStyle}, which differs from the requested style, {slotStyle}.',
    ko: '선택한 파일의 스타일은 {fileStyle}이며, 요청한 {slotStyle} 스타일과 다릅니다.'
  },
  'font.ttc': {
    en: 'This is a font collection (TTC). Select it in Fonts to find the required style.',
    ko: '여러 스타일이 포함된 폰트 컬렉션(TTC) 파일입니다. 폰트 화면에서 이 파일을 선택해 필요한 스타일을 찾으세요.'
  },
  'font.ttcNoFace': {
    en: 'This collection does not contain {family} {style}. Available styles: {faces}',
    ko: '이 컬렉션에서 {family} {style} 스타일을 찾지 못했습니다. 포함된 스타일: {faces}'
  },

  // ── 내보내기 실패 사유 ──────────────────────────────────
  'exporter.nodeGone': {
    en: 'The layer could not be found. It may have been deleted.',
    ko: '레이어를 찾을 수 없습니다. 삭제되었을 수 있습니다.'
  },
  'exporter.badType': {
    en: 'This layer type cannot be exported: {type}',
    ko: '내보내기를 지원하지 않는 레이어 유형입니다: {type}'
  },
  'image.warn': {
    en: 'Image {hash}: {detail}',
    ko: '이미지 {hash}: {detail}'
  },
  'image.missing': {
    en: 'Could not find the original image ({hash}).',
    ko: '원본 이미지를 찾을 수 없습니다. 이미지 ID: {hash}'
  },
  'image.replaceFailed': {
    en: 'Could not replace image {hash}. Details: {error}',
    ko: '이미지를 교체하지 못했습니다. 이미지 ID: {hash}. 상세 오류: {error}'
  },
  'resize.noContext': {
    en: 'Could not initialize image processing.',
    ko: '이미지 처리를 시작하지 못했습니다.'
  },
  'pdf.noParts': {
    en: 'No PDF pages are available to combine.',
    ko: '병합할 PDF 페이지가 없습니다.'
  },
  // 가공하지 않은 에러 메시지를 사유 구조에 실어 나를 때 쓴다
  'reason.raw': { en: '{message}', ko: '{message}' },
  'bridge.timeout': {
    en: 'The plugin interface did not respond within {seconds} seconds. Request ID: {reqId}',
    ko: '플러그인 화면이 {seconds}초 동안 응답하지 않았습니다. 요청 ID: {reqId}'
  },
  'timeout.notFinished': {
    en: '{label} did not finish within {seconds} seconds.',
    ko: '{label}: {seconds}초 내에 작업을 완료하지 못했습니다.'
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
