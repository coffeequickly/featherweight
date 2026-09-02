// 사용자가 고른 폰트 폴더에서 없는 폰트에 맞는 .ttf 를 찾는다. UI 스레드 전용(File API).
//
// 파일 선택창은 보안상 시작 폴더를 지정할 수 없지만, 폴더째 고르는 건 된다
// (input webkitdirectory). 폴더 안 파일은 전부 이 컴퓨터에서만 읽힌다.
//
// 폰트 폴더는 수백 개·수백 MB 일 수 있다. 파일명에 family 가 들어간 것부터 읽고,
// 그래도 못 찾은 폰트가 남았을 때만 나머지를 상한까지 읽는다.

import { FontFacts } from '../lib/fontFile'
import { FontFileNames, looksLikeFamily, pickFontFile } from '../lib/fontFolder'
import { fontKey } from '../lib/fontInventory'
import { FontUsage } from '../lib/types'
import { createProbe, factsOf, FontProbe, namesOf } from './fontkitAdapter'

export type ParsedFontFile = FontFileNames & {
  bytes: Uint8Array
  probe: FontProbe
  facts: FontFacts
}

/** 이름으로 못 거른 나머지를 읽을 상한 — 그 이상은 시간만 먹는다 */
const SCAN_CAP = 400

function isTtf(file: File): boolean {
  return /\.ttf$/i.test(file.name)
}

async function parseFile(file: File): Promise<ParsedFontFile | null> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const probe = createProbe(bytes)
    const facts = factsOf(probe)
    const names = namesOf(probe)
    return {
      fileName: file.name,
      family: names.family,
      subfamily: names.subfamily,
      weightClass: facts.weightClass,
      italic: facts.italic,
      bytes,
      probe,
      facts
    }
  } catch {
    return null // 폰트가 아니거나 깨진 파일 — 조용히 건너뛴다
  }
}

/**
 * 없는 폰트마다 맞는 파일을 찾아 fontKey → 파일로 돌려준다. 못 찾은 폰트는 빠진다.
 */
export async function findFontFiles(
  files: readonly File[],
  missing: readonly FontUsage[],
  onProgress: (done: number, total: number) => void
): Promise<Map<string, ParsedFontFile>> {
  const ttfs = files.filter(isTtf)
  const likely = ttfs.filter((file) =>
    missing.some((font) => looksLikeFamily(file.name, font.family))
  )
  const rest = ttfs.filter((file) => !likely.includes(file)).slice(0, SCAN_CAP)

  const parsed: ParsedFontFile[] = []
  const found = new Map<string, ParsedFontFile>()
  const total = likely.length + rest.length
  let done = 0

  const settle = (): void => {
    for (const font of missing) {
      const key = fontKey(font)
      if (found.has(key)) continue
      const pick = pickFontFile(font, parsed)
      if (pick !== undefined) found.set(key, pick as ParsedFontFile)
    }
  }

  for (const batch of [likely, rest]) {
    for (const file of batch) {
      const entry = await parseFile(file)
      if (entry !== null) parsed.push(entry)
      done += 1
      onProgress(done, total)
    }
    settle()
    if (found.size === missing.length) break // 다 찾았으면 나머지는 안 읽는다
  }

  return found
}
