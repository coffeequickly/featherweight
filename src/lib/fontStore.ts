// clientStorage 폰트 보관 계산. Figma·DOM 의존 금지.
// 폰트 바이트를 번들에 굽지 않고 clientStorage 에 두면 UI 번들이 3.3MB 안 늘어난다.
// 대신 플러그인당 5MB 한도 안에서 관리해야 한다. (S8)

import { CLIENT_STORAGE_LIMIT, FontRef, StoredFont } from './types'

export const FONT_INDEX_KEY = 'sheaf.fonts.v1'
export const FONT_KEY_PREFIX = 'sheaf.font.'

/** 폰트 바이트가 들어가는 clientStorage 키. family 안의 공백·점은 키에서 제거한다. */
export function fontStorageKey(ref: FontRef): string {
  const slug = (value: string): string => value.replace(/[^A-Za-z0-9가-힣]+/g, '')
  return `${FONT_KEY_PREFIX}${slug(ref.family)}.${slug(ref.style)}`
}

export function isSameFont(a: FontRef, b: FontRef): boolean {
  return a.family === b.family && a.style === b.style
}

export function findStored(fonts: readonly StoredFont[], ref: FontRef): StoredFont | undefined {
  return fonts.find((font) => isSameFont(font, ref))
}

/** 인덱스에 넣거나 갈아끼운다. 같은 family+style 은 덮어쓴다. */
export function upsertFont(fonts: readonly StoredFont[], next: StoredFont): StoredFont[] {
  const rest = fonts.filter((font) => !isSameFont(font, next))
  return [...rest, next].sort(
    (a, b) =>
      a.family.localeCompare(b.family) ||
      a.weight - b.weight ||
      (a.italic ? 1 : 0) - (b.italic ? 1 : 0)
  )
}

export function removeFont(fonts: readonly StoredFont[], ref: FontRef): StoredFont[] {
  return fonts.filter((font) => !isSameFont(font, ref))
}

/** 인덱스 자체(메타데이터 JSON)도 한도에 포함되지만 무시할 만해서 바이트 합계만 센다. */
export function usedBytes(fonts: readonly StoredFont[]): number {
  return fonts.reduce((sum, font) => sum + font.byteLength, 0)
}

export function remainingBytes(fonts: readonly StoredFont[]): number {
  return Math.max(0, CLIENT_STORAGE_LIMIT - usedBytes(fonts))
}

/**
 * ref 자리에 byteLength 짜리 폰트를 넣을 수 있는지. 같은 자리를 덮어쓰는 경우
 * 기존 바이트는 해제되므로 빼고 계산한다.
 */
export function fitsWithin(
  fonts: readonly StoredFont[],
  ref: FontRef,
  byteLength: number
): boolean {
  const others = removeFont(fonts, ref)
  return usedBytes(others) + byteLength <= CLIENT_STORAGE_LIMIT
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
