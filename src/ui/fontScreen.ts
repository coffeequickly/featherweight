// 파일 하나를 자리에 넣어도 되는지 거르는 판정.
//
// 한 번 올리기·폴더 스캔·상세 페이지가 전부 이 문을 지난다 — 경로마다 다르게 검사하면
// 한쪽에서 통과한 파일이 다른 쪽에서 거절된다.

import { FontFacts, screenFontFile, weightMismatch } from '../lib/fontFile'
import { weightName } from '../lib/fontInventory'
import { fitsWithin, formatBytes } from '../lib/fontStore'
import { formatReason, t } from '../lib/i18n'
import { FontUsage, StoredFont } from '../lib/types'
import { FontProbe } from './fontkitAdapter'
import { SaveRequest } from './fontScanSave'

/** 띄울 알림 하나. useMainState 의 Notice 는 "없음"(null)을 포함하는 쪽이라 따로 둔다 */
export type Notice = { message: string; error: boolean }

export type UploadVerdict =
  | { ok: true; save: SaveRequest; notice?: Notice }
  | {
      ok: false
      notice: Notice
      /** 공간 부족으로 막혔다 — 지우면 들어간다 */
      storage?: boolean
      /** 막혔어도 압축본은 있다 — 다시 넣기용 */
      save?: SaveRequest
    }

/**
 * 파일 하나를 이 자리에 넣어도 되는가. 한 번 올리기와 폴더 스캔이 같은 문을 지난다.
 *
 * 파싱만 되면 통과시키면 안 된다 — OTF(CFF)는 텍스트 추출이 통째로 깨지고, 가변 폰트는
 * 굵기가 조용히 틀린다 (src/lib/fontFile.ts). 굵기가 어긋나도 막지는 않는다 —
 * 파일 이름표가 틀린 경우가 있다. 대신 알려 준다.
 */
export function screenUpload(
  /** 실제로 저장되는 형태(압축) — 한도는 이걸로 센다 */
  packed: Uint8Array,
  fileName: string,
  probe: FontProbe,
  facts: FontFacts,
  font: FontUsage,
  all: readonly StoredFont[]
): UploadVerdict {
  const verdict = screenFontFile(facts)
  if (!verdict.ok)
    return { ok: false, notice: { message: formatReason(verdict.reason), error: true } }

  const save: SaveRequest = {
    font: {
      family: font.family,
      style: font.style,
      weight: font.weight,
      italic: font.italic,
      byteLength: packed.length,
      numGlyphs: probe.numGlyphs,
      codePoints: probe.characterSet.length,
      fileName,
      facts
    },
    bytes: packed
  }

  if (!fitsWithin(all, font, packed.length)) {
    return {
      ok: false,
      notice: {
        message: t('fonts.storageFull', { size: formatBytes(packed.length) }),
        error: true
      },
      storage: true,
      save
    }
  }

  const mismatch = weightMismatch(facts, { weight: font.weight, italic: font.italic })
  const notice: Notice | undefined = mismatch.differs
    ? {
        message: t('fontFile.weightMismatch', {
          fileStyle: weightName(mismatch.fileWeight, mismatch.fileItalic),
          slotStyle: `${font.family} ${font.style}`
        }),
        // 주의 문구는 패널 띠에 — 토스트로 흘려보내면 굵기가 다른 채로 넣은 걸 놓친다
        error: true
      }
    : undefined

  return { ok: true, notice, save }
}
