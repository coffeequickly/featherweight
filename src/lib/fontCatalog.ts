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

/**
 * 폰트를 어디서 받아오는가. URL 문자열 안에 녹아 있던 출처를 데이터로 끌어냈다.
 *
 * 왜 필요한가: 배포처마다 신뢰도와 수명이 다르다. 원저작자가 직접 내는 곳(first-party)과
 * 남이 다시 포장한 곳(repackaged)은 사라질 확률이 다르고, 하나가 죽으면 어느 폰트가
 * 같이 죽는지 알아야 한다. verify:catalog 가 출처별로 묶어 보고하는 근거이기도 하다.
 *
 * 사용자에게 켜고 끄는 스위치는 두지 않는다 — 출처가 넷뿐이고 전부 공개 OSS 이며,
 * 최악이 "못 받아서 아웃라인으로 나감" 이라 토글로 얻을 게 없다. 정책으로 처리한다:
 * 같은 서체가 양쪽에 있으면 first-party 를 쓴다.
 */
export type SourceId = 'pretendard' | 'pretendard-jp' | 'google-fonts' | 'spoqa' | 'expo'

export type FontSource = {
  id: SourceId
  /** 폰트 탭·리포트에 그대로 보이는 이름 */
  label: string
  /** 원본 프로젝트 */
  upstream: string
  /** 원저작자가 직접 내는가, 남이 다시 포장했는가 */
  kind: 'first-party' | 'repackaged'
}

export const SOURCES: Record<SourceId, FontSource> = {
  pretendard: {
    id: 'pretendard',
    label: 'Pretendard',
    upstream: 'github.com/orioncactus/pretendard',
    kind: 'first-party'
  },
  'pretendard-jp': {
    id: 'pretendard-jp',
    label: 'Pretendard JP',
    upstream: 'github.com/orioncactus/pretendard',
    kind: 'first-party'
  },
  'google-fonts': {
    id: 'google-fonts',
    label: 'Google Fonts',
    upstream: 'github.com/google/fonts',
    kind: 'first-party'
  },
  spoqa: {
    id: 'spoqa',
    label: 'Spoqa',
    upstream: 'github.com/spoqa/spoqa-han-sans',
    kind: 'first-party'
  },
  expo: {
    // google/fonts 가 인기 서체를 전부 variable 전용으로 옮겨서, static TTF 를 받을 곳이
    // 여기밖에 없다. 폰트 파일은 업스트림 원본 그대로고 OFL 고지도 파일 안에 들어 있다.
    id: 'expo',
    label: 'Expo Google Fonts',
    upstream: 'github.com/expo/google-fonts',
    kind: 'repackaged'
  }
}

export type CatalogEntry = FontRef & {
  weight: number
  italic: boolean
  url: string
  /** 라이선스 표기 — 리포트·문서에 쓴다 */
  license: string
  source: SourceId
  /** 한글을 덮는가. 검증에서 어떤 글리프를 요구할지 정한다. */
  hangul: boolean
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
  source: SourceId
  /** 생략하면 한글 서체로 본다 — 기존 항목이 전부 한글이라 그쪽을 기본으로 둔다 */
  latinOnly?: true
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
    source: 'pretendard',
    families: ['Pretendard', 'Pretendard Variable'],
    styles: WEIGHTS_9,
    file: (style) =>
      `https://cdn.jsdelivr.net/npm/pretendard@${PRETENDARD_VERSION}/dist/public/static/alternative/Pretendard-${style}.ttf`,
    license: `Pretendard · ${OFL}`
  },
  {
    // npm 패키지는 150MB 를 넘어 jsDelivr 가 거부한다 — GitHub 태그로 받는다
    source: 'pretendard-jp',
    families: ['Pretendard JP', 'Pretendard JP Variable'],
    styles: WEIGHTS_9,
    file: (style) =>
      `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v${PRETENDARD_VERSION}/packages/pretendard-jp/dist/public/static/alternative/PretendardJP-${style}.ttf`,
    license: `Pretendard JP · ${OFL}`
  },
  {
    source: 'google-fonts',
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
    source: 'google-fonts',
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
    source: 'google-fonts',
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
    source: 'google-fonts',
    families: ['Nanum Pen Script', 'Nanum Pen', '나눔손글씨 펜'],
    styles: REGULAR_ONLY,
    file: () => `${GOOGLE_FONTS}/ofl/nanumpenscript/NanumPenScript-Regular.ttf`,
    license: `Nanum Pen Script · ${OFL}`
  },
  {
    source: 'google-fonts',
    families: ['Nanum Brush Script', '나눔손글씨 붓'],
    styles: REGULAR_ONLY,
    file: () => `${GOOGLE_FONTS}/ofl/nanumbrushscript/NanumBrushScript-Regular.ttf`,
    license: `Nanum Brush Script · ${OFL}`
  },
  {
    source: 'google-fonts',
    families: ['Gothic A1'],
    styles: WEIGHTS_9,
    file: (style) => `${GOOGLE_FONTS}/ofl/gothica1/GothicA1-${style}.ttf`,
    license: `Gothic A1 · ${OFL}`
  },
  {
    source: 'google-fonts',
    families: ['Gowun Dodum'],
    styles: REGULAR_ONLY,
    file: () => `${GOOGLE_FONTS}/ofl/gowundodum/GowunDodum-Regular.ttf`,
    license: `Gowun Dodum · ${OFL}`
  },
  {
    source: 'google-fonts',
    families: ['Gowun Batang'],
    styles: [
      { style: 'Regular', weight: 400 },
      { style: 'Bold', weight: 700 }
    ],
    file: (style) => `${GOOGLE_FONTS}/ofl/gowunbatang/GowunBatang-${style}.ttf`,
    license: `Gowun Batang · ${OFL}`
  },
  {
    source: 'google-fonts',
    families: ['IBM Plex Sans KR'],
    styles: WEIGHTS_9.filter(({ weight }) => weight <= 700),
    file: (style) => `${GOOGLE_FONTS}/ofl/ibmplexsanskr/IBMPlexSansKR-${style}.ttf`,
    license: `IBM Plex Sans KR · ${OFL}`
  },
  {
    source: 'spoqa',
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
    source: 'google-fonts',
    families: ['Do Hyeon'],
    styles: REGULAR_ONLY,
    file: () => `${GOOGLE_FONTS}/ofl/dohyeon/DoHyeon-Regular.ttf`,
    license: `Do Hyeon · ${OFL}`
  },
  {
    source: 'google-fonts',
    families: ['Jua'],
    styles: REGULAR_ONLY,
    file: () => `${GOOGLE_FONTS}/ofl/jua/Jua-Regular.ttf`,
    license: `Jua · ${OFL}`
  },
  {
    source: 'google-fonts',
    families: ['Black Han Sans'],
    styles: REGULAR_ONLY,
    file: () => `${GOOGLE_FONTS}/ofl/blackhansans/BlackHanSans-Regular.ttf`,
    license: `Black Han Sans · ${OFL}`
  }
]

/**
 * @expo-google-fonts 로 받는 서체.
 *
 * google/fonts 는 인기 서체를 거의 다 variable 전용으로 옮겼다 — Inter·Roboto·
 * Open Sans·Montserrat·Noto Sans KR 전부 저장소에 static TTF 가 없다. variable 은
 * fontkit 서브셋이 불안정하고 pdf-lib 이 축을 못 고르므로 쓸 수 없다.
 * Expo 가 릴리즈마다 static 인스턴스를 뽑아 npm 에 올려 두는데, 지금으로선 개별
 * 파일 주소로 static TTF 를 받을 수 있는 유일한 곳이다.
 *
 * styles 는 패키지 안의 실제 디렉터리 이름이다 — 주소가 그대로 이 문자열로 조립되므로
 * 손으로 지어내면 안 된다. 늘릴 때는 패키지 파일 목록을 보고 그대로 옮긴다.
 */
type ExpoFamily = {
  slug: string
  family: string
  /** 파일 이름 앞머리 — IBM Plex Sans 는 IBMPlexSans 처럼 공백이 빠진다 */
  prefix: string
  version: string
  hangul?: true
  styles: string[]
}

const EXPO_FAMILIES: ExpoFamily[] = [
  {
    slug: 'inter',
    family: 'Inter',
    prefix: 'Inter',
    version: '0.4.2',
    styles: [
      '100Thin',
      '100Thin_Italic',
      '200ExtraLight',
      '200ExtraLight_Italic',
      '300Light',
      '300Light_Italic',
      '400Regular',
      '400Regular_Italic',
      '500Medium',
      '500Medium_Italic',
      '600SemiBold',
      '600SemiBold_Italic',
      '700Bold',
      '700Bold_Italic',
      '800ExtraBold',
      '800ExtraBold_Italic',
      '900Black',
      '900Black_Italic'
    ]
  },
  {
    slug: 'roboto',
    family: 'Roboto',
    prefix: 'Roboto',
    version: '0.4.3',
    styles: [
      '100Thin',
      '100Thin_Italic',
      '200ExtraLight',
      '200ExtraLight_Italic',
      '300Light',
      '300Light_Italic',
      '400Regular',
      '400Regular_Italic',
      '500Medium',
      '500Medium_Italic',
      '600SemiBold',
      '600SemiBold_Italic',
      '700Bold',
      '700Bold_Italic',
      '800ExtraBold',
      '800ExtraBold_Italic',
      '900Black',
      '900Black_Italic'
    ]
  },
  {
    slug: 'open-sans',
    family: 'Open Sans',
    prefix: 'OpenSans',
    version: '0.4.2',
    styles: [
      '300Light',
      '300Light_Italic',
      '400Regular',
      '400Regular_Italic',
      '500Medium',
      '500Medium_Italic',
      '600SemiBold',
      '600SemiBold_Italic',
      '700Bold',
      '700Bold_Italic',
      '800ExtraBold',
      '800ExtraBold_Italic'
    ]
  },
  {
    slug: 'montserrat',
    family: 'Montserrat',
    prefix: 'Montserrat',
    version: '0.4.2',
    styles: [
      '100Thin',
      '100Thin_Italic',
      '200ExtraLight',
      '200ExtraLight_Italic',
      '300Light',
      '300Light_Italic',
      '400Regular',
      '400Regular_Italic',
      '500Medium',
      '500Medium_Italic',
      '600SemiBold',
      '600SemiBold_Italic',
      '700Bold',
      '700Bold_Italic',
      '800ExtraBold',
      '800ExtraBold_Italic',
      '900Black',
      '900Black_Italic'
    ]
  },
  {
    slug: 'raleway',
    family: 'Raleway',
    prefix: 'Raleway',
    version: '0.4.2',
    styles: [
      '100Thin',
      '100Thin_Italic',
      '200ExtraLight',
      '200ExtraLight_Italic',
      '300Light',
      '300Light_Italic',
      '400Regular',
      '400Regular_Italic',
      '500Medium',
      '500Medium_Italic',
      '600SemiBold',
      '600SemiBold_Italic',
      '700Bold',
      '700Bold_Italic',
      '800ExtraBold',
      '800ExtraBold_Italic',
      '900Black',
      '900Black_Italic'
    ]
  },
  {
    slug: 'nunito',
    family: 'Nunito',
    prefix: 'Nunito',
    version: '0.4.2',
    styles: [
      '200ExtraLight',
      '200ExtraLight_Italic',
      '300Light',
      '300Light_Italic',
      '400Regular',
      '400Regular_Italic',
      '500Medium',
      '500Medium_Italic',
      '600SemiBold',
      '600SemiBold_Italic',
      '700Bold',
      '700Bold_Italic',
      '800ExtraBold',
      '800ExtraBold_Italic',
      '900Black',
      '900Black_Italic'
    ]
  },
  {
    slug: 'nunito-sans',
    family: 'Nunito Sans',
    prefix: 'NunitoSans',
    version: '0.4.2',
    styles: [
      '200ExtraLight',
      '200ExtraLight_Italic',
      '300Light',
      '300Light_Italic',
      '400Regular',
      '400Regular_Italic',
      '500Medium',
      '500Medium_Italic',
      '600SemiBold',
      '600SemiBold_Italic',
      '700Bold',
      '700Bold_Italic',
      '800ExtraBold',
      '800ExtraBold_Italic',
      '900Black',
      '900Black_Italic'
    ]
  },
  {
    slug: 'work-sans',
    family: 'Work Sans',
    prefix: 'WorkSans',
    version: '0.4.2',
    styles: [
      '100Thin',
      '100Thin_Italic',
      '200ExtraLight',
      '200ExtraLight_Italic',
      '300Light',
      '300Light_Italic',
      '400Regular',
      '400Regular_Italic',
      '500Medium',
      '500Medium_Italic',
      '600SemiBold',
      '600SemiBold_Italic',
      '700Bold',
      '700Bold_Italic',
      '800ExtraBold',
      '800ExtraBold_Italic',
      '900Black',
      '900Black_Italic'
    ]
  },
  {
    slug: 'source-sans-3',
    family: 'Source Sans 3',
    prefix: 'SourceSans3',
    version: '0.4.1',
    styles: [
      '200ExtraLight',
      '200ExtraLight_Italic',
      '300Light',
      '300Light_Italic',
      '400Regular',
      '400Regular_Italic',
      '500Medium',
      '500Medium_Italic',
      '600SemiBold',
      '600SemiBold_Italic',
      '700Bold',
      '700Bold_Italic',
      '800ExtraBold',
      '800ExtraBold_Italic',
      '900Black',
      '900Black_Italic'
    ]
  },
  {
    slug: 'noto-sans',
    family: 'Noto Sans',
    prefix: 'NotoSans',
    version: '0.4.2',
    styles: [
      '100Thin',
      '100Thin_Italic',
      '200ExtraLight',
      '200ExtraLight_Italic',
      '300Light',
      '300Light_Italic',
      '400Regular',
      '400Regular_Italic',
      '500Medium',
      '500Medium_Italic',
      '600SemiBold',
      '600SemiBold_Italic',
      '700Bold',
      '700Bold_Italic',
      '800ExtraBold',
      '800ExtraBold_Italic',
      '900Black',
      '900Black_Italic'
    ]
  },
  {
    slug: 'noto-serif',
    family: 'Noto Serif',
    prefix: 'NotoSerif',
    version: '0.4.2',
    styles: [
      '100Thin',
      '100Thin_Italic',
      '200ExtraLight',
      '200ExtraLight_Italic',
      '300Light',
      '300Light_Italic',
      '400Regular',
      '400Regular_Italic',
      '500Medium',
      '500Medium_Italic',
      '600SemiBold',
      '600SemiBold_Italic',
      '700Bold',
      '700Bold_Italic',
      '800ExtraBold',
      '800ExtraBold_Italic',
      '900Black',
      '900Black_Italic'
    ]
  },
  {
    slug: 'oswald',
    family: 'Oswald',
    prefix: 'Oswald',
    version: '0.4.2',
    styles: ['200ExtraLight', '300Light', '400Regular', '500Medium', '600SemiBold', '700Bold']
  },
  {
    slug: 'merriweather',
    family: 'Merriweather',
    prefix: 'Merriweather',
    version: '0.4.2',
    styles: [
      '300Light',
      '300Light_Italic',
      '400Regular',
      '400Regular_Italic',
      '500Medium',
      '500Medium_Italic',
      '600SemiBold',
      '600SemiBold_Italic',
      '700Bold',
      '700Bold_Italic',
      '800ExtraBold',
      '800ExtraBold_Italic',
      '900Black',
      '900Black_Italic'
    ]
  },
  {
    slug: 'playfair-display',
    family: 'Playfair Display',
    prefix: 'PlayfairDisplay',
    version: '0.4.2',
    styles: [
      '400Regular',
      '400Regular_Italic',
      '500Medium',
      '500Medium_Italic',
      '600SemiBold',
      '600SemiBold_Italic',
      '700Bold',
      '700Bold_Italic',
      '800ExtraBold',
      '800ExtraBold_Italic',
      '900Black',
      '900Black_Italic'
    ]
  },
  {
    slug: 'dm-sans',
    family: 'DM Sans',
    prefix: 'DMSans',
    version: '0.4.2',
    styles: [
      '100Thin',
      '100Thin_Italic',
      '200ExtraLight',
      '200ExtraLight_Italic',
      '300Light',
      '300Light_Italic',
      '400Regular',
      '400Regular_Italic',
      '500Medium',
      '500Medium_Italic',
      '600SemiBold',
      '600SemiBold_Italic',
      '700Bold',
      '700Bold_Italic',
      '800ExtraBold',
      '800ExtraBold_Italic',
      '900Black',
      '900Black_Italic'
    ]
  },
  {
    slug: 'manrope',
    family: 'Manrope',
    prefix: 'Manrope',
    version: '0.4.2',
    styles: [
      '200ExtraLight',
      '300Light',
      '400Regular',
      '500Medium',
      '600SemiBold',
      '700Bold',
      '800ExtraBold'
    ]
  },
  {
    slug: 'rubik',
    family: 'Rubik',
    prefix: 'Rubik',
    version: '0.4.2',
    styles: [
      '300Light',
      '300Light_Italic',
      '400Regular',
      '400Regular_Italic',
      '500Medium',
      '500Medium_Italic',
      '600SemiBold',
      '600SemiBold_Italic',
      '700Bold',
      '700Bold_Italic',
      '800ExtraBold',
      '800ExtraBold_Italic',
      '900Black',
      '900Black_Italic'
    ]
  },
  {
    slug: 'karla',
    family: 'Karla',
    prefix: 'Karla',
    version: '0.4.2',
    styles: [
      '200ExtraLight',
      '200ExtraLight_Italic',
      '300Light',
      '300Light_Italic',
      '400Regular',
      '400Regular_Italic',
      '500Medium',
      '500Medium_Italic',
      '600SemiBold',
      '600SemiBold_Italic',
      '700Bold',
      '700Bold_Italic',
      '800ExtraBold',
      '800ExtraBold_Italic'
    ]
  },
  {
    slug: 'space-grotesk',
    family: 'Space Grotesk',
    prefix: 'SpaceGrotesk',
    version: '0.4.1',
    styles: ['300Light', '400Regular', '500Medium', '600SemiBold', '700Bold']
  },
  {
    slug: 'figtree',
    family: 'Figtree',
    prefix: 'Figtree',
    version: '0.4.1',
    styles: [
      '300Light',
      '300Light_Italic',
      '400Regular',
      '400Regular_Italic',
      '500Medium',
      '500Medium_Italic',
      '600SemiBold',
      '600SemiBold_Italic',
      '700Bold',
      '700Bold_Italic',
      '800ExtraBold',
      '800ExtraBold_Italic',
      '900Black',
      '900Black_Italic'
    ]
  },
  {
    slug: 'outfit',
    family: 'Outfit',
    prefix: 'Outfit',
    version: '0.4.3',
    styles: [
      '100Thin',
      '200ExtraLight',
      '300Light',
      '400Regular',
      '500Medium',
      '600SemiBold',
      '700Bold',
      '800ExtraBold',
      '900Black'
    ]
  },
  {
    slug: 'ibm-plex-sans',
    family: 'IBM Plex Sans',
    prefix: 'IBMPlexSans',
    version: '0.4.1',
    styles: [
      '100Thin',
      '100Thin_Italic',
      '200ExtraLight',
      '200ExtraLight_Italic',
      '300Light',
      '300Light_Italic',
      '400Regular',
      '400Regular_Italic',
      '500Medium',
      '500Medium_Italic',
      '600SemiBold',
      '600SemiBold_Italic',
      '700Bold',
      '700Bold_Italic'
    ]
  },
  {
    slug: 'ibm-plex-serif',
    family: 'IBM Plex Serif',
    prefix: 'IBMPlexSerif',
    version: '0.4.1',
    styles: [
      '100Thin',
      '100Thin_Italic',
      '200ExtraLight',
      '200ExtraLight_Italic',
      '300Light',
      '300Light_Italic',
      '400Regular',
      '400Regular_Italic',
      '500Medium',
      '500Medium_Italic',
      '600SemiBold',
      '600SemiBold_Italic',
      '700Bold',
      '700Bold_Italic'
    ]
  },
  {
    slug: 'ibm-plex-mono',
    family: 'IBM Plex Mono',
    prefix: 'IBMPlexMono',
    version: '0.4.1',
    styles: [
      '100Thin',
      '100Thin_Italic',
      '200ExtraLight',
      '200ExtraLight_Italic',
      '300Light',
      '300Light_Italic',
      '400Regular',
      '400Regular_Italic',
      '500Medium',
      '500Medium_Italic',
      '600SemiBold',
      '600SemiBold_Italic',
      '700Bold',
      '700Bold_Italic'
    ]
  },
  {
    slug: 'jetbrains-mono',
    family: 'JetBrains Mono',
    prefix: 'JetBrainsMono',
    version: '0.4.1',
    styles: [
      '100Thin',
      '100Thin_Italic',
      '200ExtraLight',
      '200ExtraLight_Italic',
      '300Light',
      '300Light_Italic',
      '400Regular',
      '400Regular_Italic',
      '500Medium',
      '500Medium_Italic',
      '600SemiBold',
      '600SemiBold_Italic',
      '700Bold',
      '700Bold_Italic',
      '800ExtraBold',
      '800ExtraBold_Italic'
    ]
  },
  {
    slug: 'roboto-mono',
    family: 'Roboto Mono',
    prefix: 'RobotoMono',
    version: '0.4.2',
    styles: [
      '100Thin',
      '100Thin_Italic',
      '200ExtraLight',
      '200ExtraLight_Italic',
      '300Light',
      '300Light_Italic',
      '400Regular',
      '400Regular_Italic',
      '500Medium',
      '500Medium_Italic',
      '600SemiBold',
      '600SemiBold_Italic',
      '700Bold',
      '700Bold_Italic'
    ]
  },
  {
    slug: 'libre-baskerville',
    family: 'Libre Baskerville',
    prefix: 'LibreBaskerville',
    version: '0.4.3',
    styles: [
      '400Regular',
      '400Regular_Italic',
      '500Medium',
      '500Medium_Italic',
      '600SemiBold',
      '600SemiBold_Italic',
      '700Bold',
      '700Bold_Italic'
    ]
  },
  {
    slug: 'eb-garamond',
    family: 'EB Garamond',
    prefix: 'EBGaramond',
    version: '0.4.3',
    styles: [
      '400Regular',
      '400Regular_Italic',
      '500Medium',
      '500Medium_Italic',
      '600SemiBold',
      '600SemiBold_Italic',
      '700Bold',
      '700Bold_Italic',
      '800ExtraBold',
      '800ExtraBold_Italic'
    ]
  },
  {
    slug: 'josefin-sans',
    family: 'Josefin Sans',
    prefix: 'JosefinSans',
    version: '0.4.2',
    styles: [
      '100Thin',
      '100Thin_Italic',
      '200ExtraLight',
      '200ExtraLight_Italic',
      '300Light',
      '300Light_Italic',
      '400Regular',
      '400Regular_Italic',
      '500Medium',
      '500Medium_Italic',
      '600SemiBold',
      '600SemiBold_Italic',
      '700Bold',
      '700Bold_Italic'
    ]
  },
  {
    slug: 'quicksand',
    family: 'Quicksand',
    prefix: 'Quicksand',
    version: '0.4.1',
    styles: ['300Light', '400Regular', '500Medium', '600SemiBold', '700Bold']
  },
  {
    slug: 'mulish',
    family: 'Mulish',
    prefix: 'Mulish',
    version: '0.4.2',
    styles: [
      '200ExtraLight',
      '200ExtraLight_Italic',
      '300Light',
      '300Light_Italic',
      '400Regular',
      '400Regular_Italic',
      '500Medium',
      '500Medium_Italic',
      '600SemiBold',
      '600SemiBold_Italic',
      '700Bold',
      '700Bold_Italic',
      '800ExtraBold',
      '800ExtraBold_Italic',
      '900Black',
      '900Black_Italic'
    ]
  },
  {
    slug: 'archivo',
    family: 'Archivo',
    prefix: 'Archivo',
    version: '0.4.2',
    styles: [
      '100Thin',
      '100Thin_Italic',
      '200ExtraLight',
      '200ExtraLight_Italic',
      '300Light',
      '300Light_Italic',
      '400Regular',
      '400Regular_Italic',
      '500Medium',
      '500Medium_Italic',
      '600SemiBold',
      '600SemiBold_Italic',
      '700Bold',
      '700Bold_Italic',
      '800ExtraBold',
      '800ExtraBold_Italic',
      '900Black',
      '900Black_Italic'
    ]
  },
  {
    slug: 'bitter',
    family: 'Bitter',
    prefix: 'Bitter',
    version: '0.4.2',
    styles: [
      '100Thin',
      '100Thin_Italic',
      '200ExtraLight',
      '200ExtraLight_Italic',
      '300Light',
      '300Light_Italic',
      '400Regular',
      '400Regular_Italic',
      '500Medium',
      '500Medium_Italic',
      '600SemiBold',
      '600SemiBold_Italic',
      '700Bold',
      '700Bold_Italic',
      '800ExtraBold',
      '800ExtraBold_Italic',
      '900Black',
      '900Black_Italic'
    ]
  },
  {
    slug: 'cabin',
    family: 'Cabin',
    prefix: 'Cabin',
    version: '0.4.2',
    styles: [
      '400Regular',
      '400Regular_Italic',
      '500Medium',
      '500Medium_Italic',
      '600SemiBold',
      '600SemiBold_Italic',
      '700Bold',
      '700Bold_Italic'
    ]
  },
  {
    slug: 'heebo',
    family: 'Heebo',
    prefix: 'Heebo',
    version: '0.4.2',
    styles: [
      '100Thin',
      '200ExtraLight',
      '300Light',
      '400Regular',
      '500Medium',
      '600SemiBold',
      '700Bold',
      '800ExtraBold',
      '900Black'
    ]
  },
  {
    slug: 'noto-sans-kr',
    family: 'Noto Sans KR',
    prefix: 'NotoSansKR',
    version: '0.4.3',
    hangul: true,
    styles: [
      '100Thin',
      '200ExtraLight',
      '300Light',
      '400Regular',
      '500Medium',
      '600SemiBold',
      '700Bold',
      '800ExtraBold',
      '900Black'
    ]
  },
  {
    slug: 'noto-serif-kr',
    family: 'Noto Serif KR',
    prefix: 'NotoSerifKR',
    version: '0.4.3',
    hangul: true,
    styles: [
      '200ExtraLight',
      '300Light',
      '400Regular',
      '500Medium',
      '600SemiBold',
      '700Bold',
      '800ExtraBold',
      '900Black'
    ]
  }
]

/** '700Bold_Italic' → Figma 가 부르는 스타일 이름과 weight */
function parseExpoStyle(dir: string): { style: string; weight: number; italic: boolean } {
  const match = /^(\d+)([A-Za-z]+?)(_Italic)?$/.exec(dir)
  if (match === null) throw new Error(`알 수 없는 스타일 디렉터리: ${dir}`)

  const weight = Number(match[1])
  const italic = match[3] !== undefined
  const name = match[2]
  // Regular 의 이탤릭은 Figma 에서 "Regular Italic" 이 아니라 그냥 "Italic" 이다
  const style = italic ? (name === 'Regular' ? 'Italic' : `${name} Italic`) : name
  return { style, weight, italic }
}

const EXPO_GROUPS: FamilyGroup[] = EXPO_FAMILIES.map((entry) => ({
  source: 'expo' as const,
  latinOnly: entry.hangul === true ? undefined : (true as const),
  families: [entry.family],
  styles: entry.styles.map((dir) => {
    const { style, weight } = parseExpoStyle(dir)
    return { style, weight }
  }),
  file: (style: string) => {
    const dir = entry.styles.find((candidate) => parseExpoStyle(candidate).style === style)
    return `https://cdn.jsdelivr.net/npm/@expo-google-fonts/${entry.slug}@${entry.version}/${dir}/${entry.prefix}_${dir}.ttf`
  },
  license: `${entry.family} · ${OFL}`
}))

/**
 * google/fonts 저장소에 static TTF 가 남아 있는 라틴 서체.
 *
 * 원저작자 배포 라인에 붙어 있는 편이 오래 간다 — 같은 서체를 Expo 에서도 받을 수
 * 있지만, 재포장을 거치지 않아도 되면 거치지 않는다 (SOURCES 의 first-party 원칙).
 * Lato 는 여기가 굵기도 더 많다 (18종 vs Expo 10종).
 *
 * suffixes 는 저장소의 실제 파일 꼬리표다. 주소가 그대로 조립되므로 지어내면 안 된다.
 */
type GoogleFamily = {
  dir: string
  family: string
  /** 파일 이름 앞머리 — PT Sans 는 PT_Sans-Web 처럼 규칙에서 벗어난다 */
  prefix: string
  suffixes: string[]
}

const ROMAN_9 = [
  'Thin',
  'ExtraLight',
  'Light',
  'Regular',
  'Medium',
  'SemiBold',
  'Bold',
  'ExtraBold',
  'Black'
]
const ROMAN_AND_ITALIC = ROMAN_9.flatMap((name) => [
  name,
  name === 'Regular' ? 'Italic' : `${name}Italic`
])

const GOOGLE_LATIN: GoogleFamily[] = [
  { dir: 'ofl/lato', family: 'Lato', prefix: 'Lato', suffixes: ROMAN_AND_ITALIC },
  { dir: 'ofl/poppins', family: 'Poppins', prefix: 'Poppins', suffixes: ROMAN_AND_ITALIC },
  { dir: 'ofl/firasans', family: 'Fira Sans', prefix: 'FiraSans', suffixes: ROMAN_AND_ITALIC },
  { dir: 'ofl/barlow', family: 'Barlow', prefix: 'Barlow', suffixes: ROMAN_AND_ITALIC },
  // 이름에 Web 이 들어간다. 굵기는 Regular·Bold 와 각 이탤릭뿐이다.
  {
    dir: 'ofl/ptsans',
    family: 'PT Sans',
    prefix: 'PT_Sans-Web',
    suffixes: ['Regular', 'Italic', 'Bold', 'BoldItalic']
  },
  {
    dir: 'ofl/ptserif',
    family: 'PT Serif',
    prefix: 'PT_Serif-Web',
    suffixes: ['Regular', 'Italic', 'Bold', 'BoldItalic']
  },
  {
    dir: 'ofl/spacemono',
    family: 'Space Mono',
    prefix: 'SpaceMono',
    suffixes: ['Regular', 'Italic', 'Bold', 'BoldItalic']
  },
  // 폭 변형(Condensed 등)은 Figma 가 별개 서체로 부르므로 로만만 가져온다. 이탤릭은 없다.
  {
    dir: 'ofl/inconsolata/static',
    family: 'Inconsolata',
    prefix: 'Inconsolata',
    suffixes: ['ExtraLight', 'Light', 'Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold', 'Black']
  }
]

const WEIGHT_OF: Record<string, number> = {
  Thin: 100,
  ExtraLight: 200,
  Light: 300,
  Regular: 400,
  Medium: 500,
  SemiBold: 600,
  Bold: 700,
  ExtraBold: 800,
  Black: 900
}

/** 'BoldItalic' → Figma 스타일 이름과 weight */
function parseRomanSuffix(suffix: string): { style: string; weight: number } {
  if (suffix === 'Italic') return { style: 'Italic', weight: 400 }
  const italic = suffix.endsWith('Italic')
  const name = italic ? suffix.slice(0, -'Italic'.length) : suffix
  const weight = WEIGHT_OF[name]
  if (weight === undefined) throw new Error(`알 수 없는 스타일 꼬리표: ${suffix}`)
  return { style: italic ? `${name} Italic` : name, weight }
}

const GOOGLE_LATIN_GROUPS: FamilyGroup[] = GOOGLE_LATIN.map((entry) => ({
  source: 'google-fonts' as const,
  latinOnly: true as const,
  families: [entry.family],
  styles: entry.suffixes.map(parseRomanSuffix),
  file: (style: string) => {
    const suffix = entry.suffixes.find((candidate) => parseRomanSuffix(candidate).style === style)
    return `${GOOGLE_FONTS}/${entry.dir}/${entry.prefix}-${suffix}.ttf`
  },
  license: `${entry.family} · ${OFL}`
}))

export const CATALOG: CatalogEntry[] = [...GROUPS, ...GOOGLE_LATIN_GROUPS, ...EXPO_GROUPS].flatMap(
  (group) =>
    group.families.flatMap((family) =>
      group.styles.map(({ style, weight }) => ({
        family,
        style,
        weight,
        italic: style.endsWith('Italic'),
        url: group.file(style),
        license: group.license,
        source: group.source,
        hangul: group.latinOnly !== true
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
