// 폰트 바이트를 구해 온다. 순서: 카탈로그(CDN) → 사용자가 넣은 파일(clientStorage).
//
// 받아온 폰트는 세션 동안 메모리에만 둔다. clientStorage 는 5MB 뿐이라 1.5~2.7MB 짜리
// 원본을 넣으면 두세 개만에 찬다. jsDelivr 가 1년 immutable 로 내보내므로 재방문은
// 브라우저 캐시가 받아 준다.

import { emit } from '@create-figma-plugin/utilities'

import { catalogEntry } from '../lib/fontCatalog'
import { matchFont } from '../lib/fontMatch'
import { FontBytesHandler, FontRef, Reason, StoredFont } from '../lib/types'
import { awaitResponse, nextRequestId } from './bridge'
import { createProbe, FontProbe } from './fontkitAdapter'

const FETCH_TIMEOUT_MS = 20_000

const bytesCache = new Map<string, Uint8Array>()
const probeCache = new Map<string, FontProbe>()
const failed = new Map<string, string>()

function keyOf(ref: FontRef): string {
  return `${ref.family} ${ref.style}`
}

async function fetchFromCatalog(ref: FontRef): Promise<Uint8Array | undefined> {
  const entry = catalogEntry(ref)
  if (entry === undefined) return undefined

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(entry.url, { signal: controller.signal })
    if (!response.ok) {
      failed.set(keyOf(ref), `HTTP ${response.status}`)
      return undefined
    }
    return new Uint8Array(await response.arrayBuffer())
  } catch (error) {
    failed.set(keyOf(ref), error instanceof Error ? error.message : String(error))
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

/** 넣어 둔 파일 그대로 — 카탈로그를 거치지 않는다 (같은 이름이 카탈로그에도 있을 수 있다) */
export function loadStoredFontBytes(ref: FontRef): Promise<Uint8Array | undefined> {
  return fetchFromStorage(ref)
}

async function fetchFromStorage(ref: FontRef): Promise<Uint8Array | undefined> {
  const reqId = nextRequestId('font')
  const promise = awaitResponse<{ bytes: Uint8Array | null }>(reqId)
  emit<FontBytesHandler>('font:bytes', { reqId, ref })
  const response = await promise
  return response === undefined || response.bytes === null ? undefined : response.bytes
}

export async function loadFontBytes(ref: FontRef): Promise<Uint8Array | undefined> {
  const key = keyOf(ref)
  const cached = bytesCache.get(key)
  if (cached !== undefined) return cached

  const bytes = (await fetchFromCatalog(ref)) ?? (await fetchFromStorage(ref))
  if (bytes === undefined) return undefined

  bytesCache.set(key, bytes)
  return bytes
}

export async function probeFont(ref: FontRef): Promise<FontProbe | undefined> {
  const key = keyOf(ref)
  const cached = probeCache.get(key)
  if (cached !== undefined) return cached

  const bytes = await loadFontBytes(ref)
  if (bytes === undefined) return undefined

  try {
    const probe = createProbe(bytes)
    probeCache.set(key, probe)
    return probe
  } catch (error) {
    failed.set(key, error instanceof Error ? error.message : String(error))
    return undefined
  }
}

export function missingCodePoints(probe: FontProbe, codePoints: readonly number[]): number[] {
  return codePoints.filter((point) => !probe.hasGlyphForCodePoint(point))
}

/**
 * 이 폰트로 이 글자들을 그릴 수 있는지. (FR-7 조건 4)
 * 카탈로그에 있으면 available 에 없어도 된다 — 받아 오면 되기 때문이다.
 */
export async function checkCoverage(
  ref: FontRef,
  codePoints: readonly number[],
  available: readonly StoredFont[]
): Promise<{ ok: true } | { ok: false; reason: Reason }> {
  const inCatalog = catalogEntry(ref) !== undefined
  if (!inCatalog && !matchFont(ref, available).ok) {
    return {
      ok: false,
      reason: { code: 'font.needUpload', params: { family: ref.family, style: ref.style } }
    }
  }

  const probe = await probeFont(ref)
  if (probe === undefined) {
    const why = failed.get(keyOf(ref))
    return {
      ok: false,
      reason: {
        code: 'font.loadFailed',
        params: { family: ref.family, style: ref.style, why: why ?? '' }
      }
    }
  }

  const missing = missingCodePoints(probe, codePoints)
  if (missing.length > 0) {
    const sample = missing
      .slice(0, 6)
      .map((point) => String.fromCodePoint(point))
      .join('')
    return {
      ok: false,
      reason: { code: 'font.missingGlyphs', params: { count: missing.length, sample } }
    }
  }

  return { ok: true }
}

/** 사용자가 폰트를 넣거나 지운 뒤 캐시를 비운다. */
export function resetFontCache(): void {
  bytesCache.clear()
  probeCache.clear()
  failed.clear()
}
