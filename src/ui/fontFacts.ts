// 옛 버전이 저장한 폰트에는 파일 사실(굵기·가변 여부)이 없다 — 열 때 한 번 읽어 채운다.
//
// 넣는 순간에만 검사하고 그 뒤로 믿으면, 검사가 생기기 전에 들어온 가변 폰트가 "준비됨"
// 으로 남아 굵기가 틀린 채 나간다. 사실이 인덱스에 적히면 그 뒤로는 읽지 않는다.

import { emit } from '@create-figma-plugin/utilities'

import { fontKey } from '../lib/fontInventory'
import { FontFactsHandler, StoredFont } from '../lib/types'
import { createProbe, factsOf } from './fontkitAdapter'
import { loadStoredFontBytes } from './fontSource'

const inFlight = new Set<string>()
/** 못 읽은 파일은 이 세션에서 다시 건드리지 않는다 — 내보낼 때 어차피 드러난다 */
const failed = new Set<string>()

export async function backfillFontFacts(stored: readonly StoredFont[]): Promise<void> {
  for (const font of stored) {
    if (font.facts !== undefined) continue
    const key = fontKey(font)
    if (inFlight.has(key) || failed.has(key)) continue
    inFlight.add(key)
    try {
      const bytes = await loadStoredFontBytes(font)
      if (bytes === undefined) {
        failed.add(key)
        continue
      }
      const facts = factsOf(createProbe(bytes))
      emit<FontFactsHandler>('font:facts', {
        ref: { family: font.family, style: font.style },
        facts
      })
    } catch {
      failed.add(key)
    } finally {
      inFlight.delete(key)
    }
  }
}
