// 사용자가 고른 폰트 폴더에서 없는 폰트에 맞는 파일을 찾는다. UI 스레드 전용(File API).
//
// 파일 선택창은 보안상 시작 폴더를 지정할 수 없지만, 폴더째 고르는 건 된다 (input webkitdirectory).
// 폴더 안 파일은 전부 이 컴퓨터에서만 읽힌다.
//
// 흐름: 파일 하나를 읽는다 → 그 안의 face 마다 쓸 수 있는지(가변·윤곽 없음) 본다 → 쓸 수 있는 것
// 중 이름이 맞는 것을 매칭 등급(정확 일치 → 이름표 전체 → 굵기만) → 문서의 글자를 얼마나 덮는지
// → 문서 글자 크기에 가까운 광학 크기 → 새 판 → 글리프 수 순으로 고른다 → 고른 face 만 단일 폰트
// 바이트로 뽑아 두고 파일은 놓아준다. 같은
// 자리에 더 나은 파일이 나중에 나오면 바꾸고, 점수가 같으면 먼저 읽은 파일을 둔다.
// 파일 하나 크기 이상은 들고 있지 않고, 고른 것들의 합에도 상한을 둔다 — 이 상한은 보관하는 양이지
// 읽는 순간의 최대치가 아니다(원본 파일 + 뽑은 face 가 잠깐 같이 있다).
//
// "못 찾음" 은 이유를 나눈다 — 서체 자체가 없는지, 있는데 굵기가 없는지, 가변 파일뿐인지,
// 쓸 수 없는 파일뿐인지. 읽지 못한 파일·깨진 face·상한에 걸려 안 읽은 파일이 하나라도 있으면
// 못 찾은 폰트는 전부 "검사 미완료" 다 — 거기 있었을 수 있으니 "없음" 이라고 단정하지 않는다.

import { extractFace } from '../lib/fontCollection'
import { FontFacts, screenFontFile } from '../lib/fontFile'
import {
  FontFileNames,
  looksLikeFamily,
  matchTier,
  MatchTier,
  opticalSize,
  sameFamily
} from '../lib/fontFolder'
import { fontKey } from '../lib/fontInventory'
import { FontUsage } from '../lib/types'
import { collectionFaces, createProbe, factsOf, FontProbe, namesOf } from './fontkitAdapter'

export type FoundFont = {
  fileName: string
  family: string
  subfamily: string
  /** face 하나짜리 바이트 — 컬렉션에서 뽑았어도 원본을 참조하지 않는다 */
  bytes: Uint8Array
  probe: FontProbe
  facts: FontFacts
  /** 매칭 등급 — 0 이 아니면 이름이 정확히 맞는 파일은 없었다는 뜻 */
  tier: MatchTier
  /** 이름·굵기가 맞고 쓸 수 있는 다른 파일 수 — 0 이 아니면 "여럿 중 하나를 골랐다" 고 알린다 */
  alternatives: number
  /** 문서가 이 폰트로 쓰는 글자 중 이 파일에 없는 수 */
  missingGlyphs: number
}

export type ScanReason =
  'family-missing' | 'style-missing' | 'variable-only' | 'restricted' | 'unusable' | 'unchecked'

export type ScanResult = {
  found: Map<string, FoundFont>
  /** 못 찾은 폰트(fontKey) → 이유 */
  reasons: Map<string, ScanReason>
  /** 읽지 못했거나 폰트로 파싱되지 않은 파일 수 */
  unreadable: number
  /** 컬렉션 안에서 읽지 못한 face 수 — 그 face 가 찾던 서체였을 수 있다 */
  brokenFaces: number
  /** 파일 수 상한에 걸려 안 읽은 파일 수 */
  unread: number
  /** 고른 폰트의 바이트 합이 상한을 넘어 멈췄는가 */
  memoryCapped: boolean
}

export type ScanOptions = {
  /** 이름으로 못 거른 나머지를 읽을 상한 — 그 이상은 시간만 먹는다 */
  fileCap?: number
  /** 이름이 안 맞는 파일 중 이보다 큰 것은 읽지 않는다(안 읽은 파일로 센다) — 이름이 맞는 파일은 크기와 무관하게 읽는다 */
  restFileBytesCap?: number
  /** 고른 face 바이트의 합 상한 — 저장 한도(5MB)보다 크지만 컬렉션 face 는 압축 전이라 몇 MB 씩이다 */
  retainedBytesCap?: number
}

const SCAN_CAP = 400
/**
 * 실측(macOS /System/Library/Fonts, 370개 778MB): 전부 읽으면 파일 버퍼가 GC 전까지 남아 RSS 가 1GB 까지
 * 오른다. 이름이 안 맞는 파일은 대부분 Apple Color Emoji(183MB)·Songti(64MB) 같은 것이라 읽을 이유가 없다.
 */
const REST_FILE_BYTES_CAP = 32 * 1024 * 1024
const RETAINED_BYTES_CAP = 64 * 1024 * 1024

export function isScanIncomplete(result: ScanResult): boolean {
  return result.unreadable > 0 || result.brokenFaces > 0 || result.unread > 0 || result.memoryCapped
}

function isFontFile(file: File): boolean {
  return /\.(ttf|otf|ttc|otc)$/i.test(file.name)
}

/** 파일 안의 face 하나 — 컬렉션이면 여럿, 단일 폰트면 하나 */
type Candidate = FontFileNames & {
  index: number
  face: FontProbe
  facts: FontFacts
  usable: boolean
  variable: boolean
  /** 파일 자신이 임베드를 금지한다(라이선스 플래그) */
  restricted: boolean
}

/** face 마다 이름표·사실을 읽는다. 읽지 못한 face 는 세어 둔다 — 조용히 빼면 "없음" 으로 보인다 */
function candidatesOf(
  fileName: string,
  faces: readonly FontProbe[]
): { candidates: Candidate[]; broken: number } {
  const candidates: Candidate[] = []
  let broken = 0
  faces.forEach((face, index) => {
    try {
      const names = namesOf(face)
      const facts = factsOf(face)
      const verdict = screenFontFile(facts)
      candidates.push({
        fileName,
        family: names.family,
        subfamily: names.subfamily,
        weightClass: facts.weightClass,
        italic: facts.italic,
        index,
        face,
        facts,
        usable: verdict.ok,
        variable: !verdict.ok && verdict.reason.code === 'fontFile.variable',
        restricted:
          !verdict.ok &&
          (verdict.reason.code === 'fontFile.restricted' ||
            verdict.reason.code === 'fontFile.bitmapOnly')
      })
    } catch {
      broken += 1
    }
  })
  return { candidates, broken }
}

function missingGlyphCount(face: FontProbe, codePoints: readonly number[] | undefined): number {
  if (codePoints === undefined) return 0
  let missing = 0
  for (const point of codePoints) if (!face.hasGlyphForCodePoint(point)) missing += 1
  return missing
}

/** "3.019" vs "4.001" — 자리마다 숫자로. 양수면 a 가 새 판 */
function compareVersion(a: FontFacts, b: FontFacts): number {
  const pa = (a.version ?? '0').split('.').map(Number)
  const pb = (b.version ?? '0').split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

type Scored = {
  tier: MatchTier
  missingGlyphs: number
  /** 파일의 광학 크기와 문서 글자 크기의 차 — 광학 크기가 없는 파일은 0 */
  opszDistance: number
  facts: FontFacts
  numGlyphs: number
}

/** 문서가 크기를 안 알려 줄 때 — 본문에 흔한 값 */
const DEFAULT_TEXT_SIZE = 14

/** "Inter 18pt" 처럼 광학 크기가 붙은 인스턴스는 문서 글자 크기에 가까운 것을 고른다 */
function opszDistance(family: string, size: number | undefined): number {
  const { opsz } = opticalSize(family)
  return opsz === undefined ? 0 : Math.abs(opsz - (size ?? DEFAULT_TEXT_SIZE))
}

/**
 * 같은 자리의 두 후보 — 매칭 등급 → 글자 커버 → 가까운 광학 크기 → 새 판 → 글리프 수.
 * 양수면 a 가 낫다, 0 이면 같다.
 * 정확한 이름이 먼저다: 이름은 굵기만 같은 "Book" 의 새 판이 "Regular" 의 옛 판을 이기면 안 된다.
 */
export function compareCandidates(a: Scored, b: Scored): number {
  return (
    b.tier - a.tier ||
    b.missingGlyphs - a.missingGlyphs ||
    b.opszDistance - a.opszDistance ||
    compareVersion(a.facts, b.facts) ||
    a.numGlyphs - b.numGlyphs
  )
}

type Evidence = {
  family: boolean
  variable: boolean
  restricted: boolean
  unusable: boolean
  /** 등급별로 본 쓸 수 있는 후보 수 */
  usableByTier: [number, number, number]
}

/**
 * 없는 폰트마다 맞는 파일을 찾는다. 파일은 하나씩 읽고 바로 대조하며, 고른 face 의 바이트만 남긴다.
 */
export async function findFontFiles(
  files: readonly File[],
  missing: readonly FontUsage[],
  onProgress: (done: number, total: number) => void,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const fileCap = options.fileCap ?? SCAN_CAP
  const restBytesCap = options.restFileBytesCap ?? REST_FILE_BYTES_CAP
  const retainedCap = options.retainedBytesCap ?? RETAINED_BYTES_CAP

  const fontFiles = files.filter(isFontFile)
  const likely = fontFiles.filter((file) =>
    missing.some((font) => looksLikeFamily(file.name, font.family))
  )
  const restAll = fontFiles.filter((file) => !likely.includes(file))
  const restSmall = restAll.filter(
    (file) => !(typeof file.size === 'number' && file.size > restBytesCap)
  )
  const rest = restSmall.slice(0, fileCap)

  const result: ScanResult = {
    found: new Map(),
    reasons: new Map(),
    unreadable: 0,
    brokenFaces: 0,
    unread: restAll.length - rest.length,
    memoryCapped: false
  }
  const evidence = new Map<string, Evidence>()
  const evidenceOf = (key: string): Evidence => {
    let found = evidence.get(key)
    if (found === undefined) {
      found = {
        family: false,
        variable: false,
        restricted: false,
        unusable: false,
        usableByTier: [0, 0, 0]
      }
      evidence.set(key, found)
    }
    return found
  }
  /** 고른 등급까지의 쓸 수 있는 후보 수 − 1 — 굵기만 같은 다른 스타일은 정확한 이름의 "대안" 이 아니다 */
  const alternativesFor = (evidenceFor: Evidence, tier: MatchTier): number =>
    evidenceFor.usableByTier.slice(0, tier + 1).reduce((sum, n) => sum + n, 0) - 1

  const queue = [...likely, ...rest]
  const total = queue.length
  let done = 0
  let retained = 0

  scan: for (let at = 0; at < queue.length; at += 1) {
    // 이름이 맞는 파일은 다 본다(더 나은 판이 있을 수 있다). 나머지는 다 찾았으면 그만 읽는다
    if (at >= likely.length && result.found.size === missing.length) break

    const file = queue[at]
    let bytes: Uint8Array
    let candidates: Candidate[]
    let isCollection = false
    try {
      bytes = new Uint8Array(await file.arrayBuffer())
      const faces = collectionFaces(bytes)
      isCollection = faces !== null
      const read = candidatesOf(file.name, faces ?? [createProbe(bytes)])
      candidates = read.candidates
      result.brokenFaces += read.broken
      if (candidates.length === 0 && read.broken === 0) result.unreadable += 1
    } catch {
      result.unreadable += 1
      done += 1
      onProgress(done, total)
      continue
    }

    for (const font of missing) {
      const key = fontKey(font)
      const evidenceFor = evidenceOf(key)
      if (candidates.some((candidate) => sameFamily(candidate.family, font.family))) {
        evidenceFor.family = true
      }
      const matched = candidates
        .map((candidate) => ({ candidate, tier: matchTier(font, candidate) }))
        .filter((entry): entry is { candidate: Candidate; tier: MatchTier } => entry.tier !== null)
      const usable = matched.filter((entry) => entry.candidate.usable)
      if (matched.length > 0 && usable.length === 0) {
        if (matched.some((entry) => entry.candidate.variable)) evidenceFor.variable = true
        else if (matched.some((entry) => entry.candidate.restricted)) evidenceFor.restricted = true
        else evidenceFor.unusable = true
      }
      if (usable.length === 0) continue
      for (const entry of usable) evidenceFor.usableByTier[entry.tier] += 1

      // 쓸 수 있는 후보 중 최선. 정렬은 안정적이라 점수가 같으면 파일 안의 순서를 지킨다
      const scored = usable
        .map(({ candidate, tier }) => ({
          candidate,
          tier,
          missingGlyphs: missingGlyphCount(candidate.face, font.codePoints),
          opszDistance: opszDistance(candidate.family, font.size),
          facts: candidate.facts,
          numGlyphs: candidate.face.numGlyphs
        }))
        .sort((a, b) => compareCandidates(b, a))
      const best = scored[0]
      const current = result.found.get(key)
      if (
        current !== undefined &&
        compareCandidates(
          {
            tier: current.tier,
            missingGlyphs: current.missingGlyphs,
            opszDistance: opszDistance(current.family, font.size),
            facts: current.facts,
            numGlyphs: current.probe.numGlyphs
          },
          best
        ) >= 0
      ) {
        current.alternatives = alternativesFor(evidenceFor, current.tier)
        continue // 먼저 고른 것이 같거나 낫다
      }

      let standalone: Uint8Array
      let probe: FontProbe
      try {
        standalone = isCollection ? extractFace(bytes, best.candidate.index) : bytes
        probe = isCollection ? createProbe(standalone) : best.candidate.face
      } catch {
        result.brokenFaces += 1
        continue
      }

      retained += standalone.length - (current?.bytes.length ?? 0)
      if (retained > retainedCap) {
        result.memoryCapped = true
        break scan
      }
      result.found.set(key, {
        fileName: isCollection ? `${file.name} (${best.candidate.subfamily})` : file.name,
        family: best.candidate.family,
        subfamily: best.candidate.subfamily,
        bytes: standalone,
        probe,
        facts: best.candidate.facts,
        tier: best.tier,
        alternatives: alternativesFor(evidenceFor, best.tier),
        missingGlyphs: best.missingGlyphs
      })
    }

    done += 1
    onProgress(done, total)
  }

  const incomplete = isScanIncomplete(result)
  for (const font of missing) {
    const key = fontKey(font)
    if (result.found.has(key)) continue
    const evidenceFor = evidence.get(key)
    // 읽지 못한 파일·face·안 읽은 파일이 있으면 어떤 "없음" 도 단정하지 않는다 — 거기 있을 수 있다
    result.reasons.set(
      key,
      incomplete
        ? 'unchecked'
        : evidenceFor?.variable
          ? 'variable-only'
          : evidenceFor?.restricted
            ? 'restricted'
            : evidenceFor?.unusable
              ? 'unusable'
              : evidenceFor?.family
                ? 'style-missing'
                : 'family-missing'
    )
  }
  return result
}
