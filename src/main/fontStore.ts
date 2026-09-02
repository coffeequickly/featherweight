// clientStorage 접근은 메인 스레드에서만 된다. UI 는 메시지로 요청한다. (PRD C3)

import {
  FONT_INDEX_KEY,
  FONT_KEY_PREFIX,
  fontStorageKey,
  removeFont,
  upsertFont
} from '../lib/fontStore'
import { createSerialQueue } from '../lib/serialQueue'
import { FontFileFacts, FontRef, StoredFont } from '../lib/types'

/**
 * 인덱스는 읽고→고치고→쓰기라 동시에 실행되면 먼저 쓴 항목이 사라진다.
 * 폰트를 한꺼번에 여러 개 넣을 때(자동 불러오기) 실제로 첫 번째가 없어졌다. 한 줄로 세운다.
 */
const queue = createSerialQueue()

export async function listFonts(): Promise<StoredFont[]> {
  const index = (await figma.clientStorage.getAsync(FONT_INDEX_KEY)) as StoredFont[] | undefined
  if (!Array.isArray(index)) return []
  return index
}

/**
 * 바이트를 먼저 쓰고 인덱스를 갱신한다. 바이트 쓰기가 한도 초과로 실패하면
 * 인덱스는 그대로라서 "인덱스에는 있는데 바이트가 없는" 상태가 생기지 않는다.
 */
export function saveFont(font: StoredFont, bytes: Uint8Array): Promise<StoredFont[]> {
  return queue(async () => {
    await figma.clientStorage.setAsync(fontStorageKey(font), bytes)
    const next = upsertFont(await listFonts(), font)
    await figma.clientStorage.setAsync(FONT_INDEX_KEY, next)
    return next
  })
}

/** 옛 항목에 파일 사실을 적는다. 자리가 사라졌으면 그냥 지금 인덱스 */
export function setFontFacts(ref: FontRef, facts: FontFileFacts): Promise<StoredFont[]> {
  return queue(async () => {
    const next = (await listFonts()).map((font) =>
      font.family === ref.family && font.style === ref.style ? { ...font, facts } : font
    )
    await figma.clientStorage.setAsync(FONT_INDEX_KEY, next)
    return next
  })
}

export function deleteFont(ref: FontRef): Promise<StoredFont[]> {
  return queue(async () => {
    await figma.clientStorage.deleteAsync(fontStorageKey(ref))
    const next = removeFont(await listFonts(), ref)
    await figma.clientStorage.setAsync(FONT_INDEX_KEY, next)
    return next
  })
}

/**
 * 인덱스가 가리키지 않는 폰트 바이트를 지운다.
 * 인덱스 쓰기가 밀려서 항목이 빠지면 바이트만 남아 5MB 한도를 조용히 갉아먹는다.
 * 인덱스가 진실이므로 참조 없는 키는 버린다 — 자동 불러오기가 다시 채운다.
 */
export function pruneOrphanFonts(): Promise<number> {
  return queue(async () => {
    const referenced = new Set((await listFonts()).map((font) => fontStorageKey(font)))
    const keys = await figma.clientStorage.keysAsync()
    const orphans = keys.filter((key) => key.startsWith(FONT_KEY_PREFIX) && !referenced.has(key))
    for (const key of orphans) await figma.clientStorage.deleteAsync(key)
    return orphans.length
  })
}

/** Phase 2 에서 텍스트를 그릴 때 UI 로 넘길 폰트 바이트. */
export async function readFontBytes(ref: FontRef): Promise<Uint8Array | undefined> {
  const bytes = (await figma.clientStorage.getAsync(fontStorageKey(ref))) as Uint8Array | undefined
  return bytes instanceof Uint8Array ? bytes : undefined
}
