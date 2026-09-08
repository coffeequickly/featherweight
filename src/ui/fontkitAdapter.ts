// pdf-lib 과 fontkit 2.x 를 잇는 어댑터.
//
// 왜 PRD §7.1 에 없는 의존성을 쓰는가: 거기 적힌 `@pdf-lib/fontkit`(fontkit 1.x 포크)의
// 서브셋 결과가 Pretendard 에서 깨진다. ToUnicode 는 멀쩡해서 pdftotext 는 정확한데
// 글리프 대부분이 그려지지 않는다. 실측 (한글 34자, Pretendard-Regular):
//
//   @pdf-lib/fontkit  subset:true      5,438 bytes  →  글리프 대부분 누락
//   @pdf-lib/fontkit  subset:false   284,700 bytes  →  정상
//   fontkit 2.0.4     subset:true      6,082 bytes  →  정상
//
// 서브셋을 포기하면(subset:false) 폰트 4종이 PDF 에 2.4MB 로 실린다.
// fontkit 2.x 를 쓰면 정상이면서 작다.
//
// pdf-lib 은 fontkit 1.x 의 `subset.encodeStream()` 을 부르는데 2.x 는 `encode()` 를 준다.
// 그 한 군데만 이어 준다.

// 브라우저 빌드에는 default export 가 없다 — named 로 가져온다
import { t } from '../lib/i18n'
import * as fontkit from 'fontkit'
import { Font } from 'fontkit'

import { FontFacts, parseFontVersion } from '../lib/fontFile'
import { PDFDocument } from 'pdf-lib'

/** 단일 폰트만 다룬다. TTC(컬렉션)는 대상이 아니다. */
export type FontProbe = Font

type PdfLibFontkit = Parameters<PDFDocument['registerFontkit']>[0]

type Subset2 = { includeGlyph: (glyph: never) => number; encode: () => Uint8Array; cff?: unknown }

function asFont(value: unknown): Font {
  const font = value as Font & { fonts?: unknown }
  if (font.fonts !== undefined) {
    throw new Error(t('font.ttc'))
  }
  return font
}

/** 폰트 검사용 — 글리프 커버리지·글리프 수를 본다. */
export function createProbe(bytes: Uint8Array): FontProbe {
  return asFont(fontkit.create(bytes as Buffer))
}

/** 컬렉션(TTC/OTC)이면 안의 face 들을, 단일 폰트면 null. face 는 이름표·사실을 읽는 데 쓴다 */
export function collectionFaces(bytes: Uint8Array): FontProbe[] | null {
  const parsed = fontkit.create(bytes as Buffer) as unknown as { fonts?: Font[] }
  return parsed.fonts === undefined ? null : parsed.fonts
}

/**
 * 순수 판정(screenFontFile)에 넘길 사실만 뽑는다.
 * fontkit 타입을 lib 으로 새어 나가게 하지 않으려고 여기서 좁힌다.
 */
export function factsOf(font: FontProbe): FontFacts {
  const inner = font as unknown as {
    directory?: { tables?: Record<string, unknown> }
    variationAxes?: Record<string, unknown>
    fvar?: { axis?: Array<{ axisTag?: string; defaultValue?: number }> } | null
    'OS/2'?: { usWeightClass?: number; fsSelection?: { italic?: boolean } } | null
    head?: { macStyle?: { italic?: boolean } } | null
    post?: { italicAngle?: number } | null
    subfamilyName?: string | null
    postscriptName?: string | null
  }
  const wght = inner.fvar?.axis?.find((axis) => axis.axisTag === 'wght')
  return {
    tables: Object.keys(inner.directory?.tables ?? {}),
    axes: Object.keys(inner.variationAxes ?? {}),
    weightClass: inner['OS/2']?.usWeightClass,
    italic: italicOf(inner),
    defaultWeight: wght?.defaultValue,
    version: parseFontVersion((font as unknown as { version?: string }).version)
  }
}

/**
 * 기울임인가 — 비트 하나만 믿지 않는다. macOS Helvetica Neue 의 "Medium Italic" face 는 OS/2·head 의
 * italic 비트가 다 꺼져 있고 italicAngle 도 0 이라 이름만 기울임이다(실측 2026-09-08); "Thin Italic" 은
 * head 비트만 켜져 있다. 어느 하나라도 기울임이라 하면 기울임이다. 아무 정보도 없으면 모른다(undefined).
 */
function italicOf(inner: {
  'OS/2'?: { fsSelection?: { italic?: boolean } } | null
  head?: { macStyle?: { italic?: boolean } } | null
  post?: { italicAngle?: number } | null
  subfamilyName?: string | null
  postscriptName?: string | null
}): boolean | undefined {
  const bit = inner['OS/2']?.fsSelection?.italic
  const macBit = inner.head?.macStyle?.italic
  const angle = inner.post?.italicAngle
  const named = /italic|oblique/i.test(`${inner.subfamilyName ?? ''} ${inner.postscriptName ?? ''}`)
  if (bit === undefined && macBit === undefined && angle === undefined && !named) return undefined
  return bit === true || macBit === true || (angle !== undefined && angle !== 0) || named
}

/**
 * 이름 테이블의 family/subfamily. typographic 이름(16/17)이 있으면 그것, 없으면 기본(1/2).
 * 옛 파일은 기본 이름에 굵기를 넣어 "SUIT Heavy"/"Regular" 로 적는다 — 그건 lib/fontFolder 가 다룬다.
 */
export function namesOf(font: FontProbe): { family: string; subfamily: string } {
  const records =
    (font as unknown as { name?: { records?: Record<string, Record<string, string>> } }).name
      ?.records ?? {}
  const pick = (key: string): string | undefined => {
    const entry = records[key]
    if (entry === undefined) return undefined
    return entry.en ?? Object.values(entry)[0]
  }
  return {
    family: pick('preferredFamily') ?? pick('fontFamily') ?? font.familyName ?? '',
    subfamily: pick('preferredSubfamily') ?? pick('fontSubfamily') ?? font.subfamilyName ?? ''
  }
}

/** `PDFDocument.registerFontkit()` 에 넘길 객체. */
export function pdfLibFontkit(): PdfLibFontkit {
  const adapter = {
    create(bytes: Uint8Array, postscriptName?: string): unknown {
      const font = asFont(fontkit.create(bytes as Buffer, postscriptName))
      const mutable = font as unknown as Record<string, unknown>
      const createSubset = (mutable.createSubset as () => Subset2).bind(font)

      // pdf-lib 은 `font.cff` 로 CFF(OTF) 인지 본다. fontkit 1.x 에는 있었고 2.x 에는 없다 —
      // 없으면 CFF 데이터를 TrueType 라벨(FontFile2·CIDFontType2)로 써서 뷰어가
      // "Mismatch between font type and embedded font file" 을 낸다. 실측: 채워 주면
      // CIDFontType0 + FontFile3/CIDFontType0C 로 쓰고 추출·렌더 다 된다.
      const tables = (font as unknown as { directory?: { tables?: Record<string, unknown> } })
        .directory?.tables
      mutable.cff = tables !== undefined && ('CFF ' in tables || 'CFF2' in tables)

      mutable.createSubset = (): unknown => {
        const subset = createSubset()
        return {
          // 서브셋 임베더는 `subset.cff` 로 CFF(OTF) 인지 본다 — 감싸면서 빠뜨리면 CFF 데이터를
          // TrueType 라벨(FontFile2·CIDFontType2)로 써서 뷰어가 형식 불일치를 낸다.
          // 실측(STIXGeneralBol.otf): 넘겨 주면 CIDFontType0 + FontFile3/CIDFontType0C 로
          // 쓰고 pdftotext 경고 없이 추출·렌더 된다.
          cff: subset.cff,
          includeGlyph: (glyph: never) => subset.includeGlyph(glyph),
          // pdf-lib 이 기다리는 스트림 모양으로 감싼다
          encodeStream: () => {
            const handlers: Record<string, ((payload: never) => void) | undefined> = {}
            const stream = {
              on(event: string, callback: (payload: never) => void) {
                handlers[event] = callback
                return stream
              }
            }
            // pdf-lib 의 serializeFont 는 data/end/error 이벤트로만 끝난다. encode() 가 던진 것을
            // microtask 밖으로 흘리면 어느 핸들러도 안 불려 save() 가 영원히 기다린다 — error 로 넘긴다.
            queueMicrotask(() => {
              let bytes: Uint8Array
              try {
                bytes = subset.encode()
              } catch (error) {
                handlers.error?.(
                  (error instanceof Error ? error : new Error(String(error))) as never
                )
                return
              }
              handlers.data?.(bytes as never)
              handlers.end?.(new Uint8Array() as never)
            })
            return stream
          }
        }
      }

      return font
    }
  }

  // pdf-lib 의 Fontkit 타입은 자체 Font 정의를 쓴다. 실제로 호출되는 부분은 위에서 다 맞췄다.
  return adapter as unknown as PdfLibFontkit
}
