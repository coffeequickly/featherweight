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

import { FontFacts } from '../lib/fontFile'
import { PDFDocument } from 'pdf-lib'

/** 단일 폰트만 다룬다. TTC(컬렉션)는 대상이 아니다. */
export type FontProbe = Font

type PdfLibFontkit = Parameters<PDFDocument['registerFontkit']>[0]

type Subset2 = { includeGlyph: (glyph: never) => number; encode: () => Uint8Array }

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

/**
 * 순수 판정(screenFontFile)에 넘길 사실만 뽑는다.
 * fontkit 타입을 lib 으로 새어 나가게 하지 않으려고 여기서 좁힌다.
 */
export function factsOf(font: FontProbe): FontFacts {
  const inner = font as unknown as {
    directory?: { tables?: Record<string, unknown> }
    variationAxes?: Record<string, unknown>
    'OS/2'?: { usWeightClass?: number; fsSelection?: { italic?: boolean } } | null
  }
  return {
    tables: Object.keys(inner.directory?.tables ?? {}),
    axes: Object.keys(inner.variationAxes ?? {}),
    weightClass: inner['OS/2']?.usWeightClass,
    italic: inner['OS/2']?.fsSelection?.italic
  }
}

/** `PDFDocument.registerFontkit()` 에 넘길 객체. */
export function pdfLibFontkit(): PdfLibFontkit {
  const adapter = {
    create(bytes: Uint8Array, postscriptName?: string): unknown {
      const font = asFont(fontkit.create(bytes as Buffer, postscriptName))
      const mutable = font as unknown as Record<string, unknown>
      const createSubset = (mutable.createSubset as () => Subset2).bind(font)

      mutable.createSubset = (): unknown => {
        const subset = createSubset()
        return {
          includeGlyph: (glyph: never) => subset.includeGlyph(glyph),
          // pdf-lib 이 기다리는 스트림 모양으로 감싼다
          encodeStream: () => {
            const handlers: Record<string, ((chunk: Uint8Array) => void) | undefined> = {}
            const stream = {
              on(event: string, callback: (chunk: Uint8Array) => void) {
                handlers[event] = callback
                return stream
              }
            }
            queueMicrotask(() => {
              handlers.data?.(subset.encode())
              handlers.end?.(new Uint8Array())
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
