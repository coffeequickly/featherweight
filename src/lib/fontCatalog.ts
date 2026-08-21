// Figma 가 부르는 폰트 이름 → 받아올 수 있는 폰트 파일 주소.
// Figma·DOM 의존 금지.
//
// 플러그인 API 는 폰트 바이너리를 주지 않는다(설치된 폰트도 못 읽는다). 그래서 파일을
// 어딘가에서 구해야 하고, 방법은 셋뿐이다 — 네트워크, 사용자 업로드, 번들.
// 공개 폰트는 네트워크가 맞다. 번들에 굽면 플러그인이 몇 MB 씩 무거워지고,
// 사용자에게 매번 파일을 고르게 하는 건 플러그인이 할 짓이 아니다.
//
// 전부 SIL OFL 1.1 이고 jsDelivr 가 CORS 와 immutable 캐시로 내보낸다. npm 은 버전,
// GitHub 은 태그·커밋에 고정해서 같은 주소가 언제나 같은 바이트를 준다.
//
// TTF(glyf) 만 넣는 이유 둘:
//   - OTF(CFF) 를 넣으면 pdf-lib 이 CIDFontType2 로 선언해 뷰어가
//     "Mismatch between font type and embedded font file" 을 낸다.
//   - variable 은 fontkit 서브셋이 불안정하고 pdf-lib 이 축을 못 고른다. static 만.
//
// 여기 있는 모든 주소는 `npm run verify:catalog` 가 실제로 받아서 확인한다 —
// TTF(glyf)인지, static 인지, 한글이 있는지, weight 가 맞는지. 항목을 추가하면 돌려라.
//
// 넣고 싶어도 못 넣은 것 (배포처에 static TTF 가 없다):
//   - Noto Sans KR · Noto Serif KR — google/fonts 에 variable 만 남았다
//   - SUIT — 저장소가 woff2 만 배포한다
//   - NanumSquare 계열 — 공식 배포가 zip 뿐이라 파일 단위 주소가 없다

import { FontRef } from './types'

export type CatalogEntry = FontRef & {
  weight: number
  italic: boolean
  url: string
  /** 라이선스 표기 — 리포트·문서에 쓴다 */
  license: string
}

const OFL = 'SIL Open Font License 1.1'

// 고정 지점. 올릴 때는 verify:catalog 를 다시 돌린다.
const PRETENDARD_VERSION = '1.3.9'
const GOOGLE_FONTS =
  'https://cdn.jsdelivr.net/gh/google/fonts@3b1480ea4b6e15fed70a42f4cb29216476a044ed'
const SPOQA =
  'https://cdn.jsdelivr.net/gh/spoqa/spoqa-han-sans@6473330babd9f8e486114f1d9a7e7166e2028c51'

type Weighted = { style: string; weight: number }

const WEIGHTS_9: Weighted[] = [
  { style: 'Thin', weight: 100 },
  { style: 'ExtraLight', weight: 200 },
  { style: 'Light', weight: 300 },
  { style: 'Regular', weight: 400 },
  { style: 'Medium', weight: 500 },
  { style: 'SemiBold', weight: 600 },
  { style: 'Bold', weight: 700 },
  { style: 'ExtraBold', weight: 800 },
  { style: 'Black', weight: 900 }
]

const REGULAR_ONLY: Weighted[] = [{ style: 'Regular', weight: 400 }]

type FamilyGroup = {
  /**
   * Figma 가 이 서체를 부를 수 있는 이름 전부. variable 을 설치하면 "… Variable",
   * 파일 내부 이름표가 붙었으면 "NanumGothic", 한글 배포판이면 "나눔고딕" 이 온다.
   * 전부 같은 배포처의 같은 서체다 — 다른 서체를 별칭으로 잇지 않는다.
   */
  families: string[]
  styles: Weighted[]
  file: (style: string) => string
  license: string
}

const GROUPS: FamilyGroup[] = [
  {
    families: ['Pretendard', 'Pretendard Variable'],
    styles: WEIGHTS_9,
    file: (style) =>
      `https://cdn.jsdelivr.net/npm/pretendard@${PRETENDARD_VERSION}/dist/public/static/alternative/Pretendard-${style}.ttf`,
    license: `Pretendard · ${OFL}`
  },
  {
    // npm 패키지는 150MB 를 넘어 jsDelivr 가 거부한다 — GitHub 태그로 받는다
    families: ['Pretendard JP', 'Pretendard JP Variable'],
    styles: WEIGHTS_9,
    file: (style) =>
      `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v${PRETENDARD_VERSION}/packages/pretendard-jp/dist/public/static/alternative/PretendardJP-${style}.ttf`,
    license: `Pretendard JP · ${OFL}`
  },
  {
    families: ['Nanum Gothic', 'NanumGothic', '나눔고딕'],
    styles: [
      { style: 'Regular', weight: 400 },
      { style: 'Bold', weight: 700 },
      { style: 'ExtraBold', weight: 800 }
    ],
    file: (style) => `${GOOGLE_FONTS}/ofl/nanumgothic/NanumGothic-${style}.ttf`,
    license: `Nanum Gothic · ${OFL}`
  },
  {
    families: ['Nanum Myeongjo', 'NanumMyeongjo', '나눔명조'],
    styles: [
      { style: 'Regular', weight: 400 },
      { style: 'Bold', weight: 700 },
      { style: 'ExtraBold', weight: 800 }
    ],
    file: (style) => `${GOOGLE_FONTS}/ofl/nanummyeongjo/NanumMyeongjo-${style}.ttf`,
    license: `Nanum Myeongjo · ${OFL}`
  },
  {
    families: ['Nanum Gothic Coding', 'NanumGothicCoding'],
    styles: [
      { style: 'Regular', weight: 400 },
      { style: 'Bold', weight: 700 }
    ],
    file: (style) => `${GOOGLE_FONTS}/ofl/nanumgothiccoding/NanumGothicCoding-${style}.ttf`,
    license: `Nanum Gothic Coding · ${OFL}`
  },
  {
    // 파일 내부 이름표는 "Nanum Pen" 이다
    families: ['Nanum Pen Script', 'Nanum Pen', '나눔손글씨 펜'],
    styles: REGULAR_ONLY,
    file: () => `${GOOGLE_FONTS}/ofl/nanumpenscript/NanumPenScript-Regular.ttf`,
    license: `Nanum Pen Script · ${OFL}`
  },
  {
    families: ['Nanum Brush Script', '나눔손글씨 붓'],
    styles: REGULAR_ONLY,
    file: () => `${GOOGLE_FONTS}/ofl/nanumbrushscript/NanumBrushScript-Regular.ttf`,
    license: `Nanum Brush Script · ${OFL}`
  },
  {
    families: ['Gothic A1'],
    styles: WEIGHTS_9,
    file: (style) => `${GOOGLE_FONTS}/ofl/gothica1/GothicA1-${style}.ttf`,
    license: `Gothic A1 · ${OFL}`
  },
  {
    families: ['Gowun Dodum'],
    styles: REGULAR_ONLY,
    file: () => `${GOOGLE_FONTS}/ofl/gowundodum/GowunDodum-Regular.ttf`,
    license: `Gowun Dodum · ${OFL}`
  },
  {
    families: ['Gowun Batang'],
    styles: [
      { style: 'Regular', weight: 400 },
      { style: 'Bold', weight: 700 }
    ],
    file: (style) => `${GOOGLE_FONTS}/ofl/gowunbatang/GowunBatang-${style}.ttf`,
    license: `Gowun Batang · ${OFL}`
  },
  {
    families: ['IBM Plex Sans KR'],
    styles: WEIGHTS_9.filter(({ weight }) => weight <= 700),
    file: (style) => `${GOOGLE_FONTS}/ofl/ibmplexsanskr/IBMPlexSansKR-${style}.ttf`,
    license: `IBM Plex Sans KR · ${OFL}`
  },
  {
    families: ['Spoqa Han Sans Neo'],
    styles: [
      { style: 'Thin', weight: 100 },
      { style: 'Light', weight: 300 },
      { style: 'Regular', weight: 400 },
      { style: 'Medium', weight: 500 },
      { style: 'Bold', weight: 700 }
    ],
    file: (style) => `${SPOQA}/Original/SpoqaHanSansNeo/SpoqaHanSansNeo-${style}.ttf`,
    license: `Spoqa Han Sans Neo · ${OFL}`
  },
  {
    // 도현·주아는 KS X 1001 완성형 서브셋이라 희귀 음절이 없다 —
    // 그런 글자는 커버리지 검사가 노드 단위로 걸러서 아웃라인으로 남긴다
    families: ['Do Hyeon'],
    styles: REGULAR_ONLY,
    file: () => `${GOOGLE_FONTS}/ofl/dohyeon/DoHyeon-Regular.ttf`,
    license: `Do Hyeon · ${OFL}`
  },
  {
    families: ['Jua'],
    styles: REGULAR_ONLY,
    file: () => `${GOOGLE_FONTS}/ofl/jua/Jua-Regular.ttf`,
    license: `Jua · ${OFL}`
  },
  {
    families: ['Black Han Sans'],
    styles: REGULAR_ONLY,
    file: () => `${GOOGLE_FONTS}/ofl/blackhansans/BlackHanSans-Regular.ttf`,
    license: `Black Han Sans · ${OFL}`
  }
]

export const CATALOG: CatalogEntry[] = GROUPS.flatMap((group) =>
  group.families.flatMap((family) =>
    group.styles.map(({ style, weight }) => ({
      family,
      style,
      weight,
      italic: false,
      url: group.file(style),
      license: group.license
    }))
  )
)

/** 이 폰트를 받아올 수 있나. 없으면 사용자가 파일을 넣어야 한다. */
export function catalogEntry(ref: FontRef): CatalogEntry | undefined {
  return CATALOG.find((entry) => entry.family === ref.family && entry.style === ref.style)
}

/** 네트워크로 못 구하는 폰트만 남긴다 — UI 가 "직접 넣어라" 로 표시할 목록. */
export function outsideCatalog(refs: readonly FontRef[]): FontRef[] {
  const seen = new Set<string>()
  const out: FontRef[] = []
  for (const ref of refs) {
    const key = `${ref.family} ${ref.style}`
    if (seen.has(key)) continue
    seen.add(key)
    if (catalogEntry(ref) === undefined) out.push(ref)
  }
  return out
}

/** manifest 의 allowedDomains 에 들어가야 하는 호스트. 목록과 어긋나면 안 된다. */
export const CATALOG_HOSTS = ['https://cdn.jsdelivr.net']
