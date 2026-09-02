// 사용자가 올린 폰트 파일이 임베드에 쓸 수 있는 물건인지 본다. Figma·DOM 의존 금지.
//
// 파싱만 되면 통과시키던 시절에 두 가지가 조용히 새어 나갔다. 둘 다 실측한 결과다.
//
//   OTF(CFF)   → pdf-lib 이 CIDFontType2(TrueType 용)로 선언한다. 뷰어가
//                "Mismatch between font type and embedded font file" 을 내고,
//                텍스트 추출이 **빈 문자열**로 나온다. ATS 문서에서는 전멸이다.
//   variable   → 굵기를 맞추거나 파일을 작게 하거나 둘 중 하나만 된다. Inter 가변으로
//                실측(2026-08):
//                  인스턴스 안 뽑고 서브셋   →   2KB · 굵기는 기본값(Regular) 고정
//                  인스턴스 뽑고 서브셋      →   깨짐 (fontkit 이 DataView 로 죽는다)
//                  인스턴스 뽑고 서브셋 없이 → 472KB · 굵기는 맞지만 236배
//                굵기 다섯 쓰는 문서면 2.4MB 가 붙는다. 가볍게 만드는 게 목적인
//                플러그인에서는 어느 쪽도 못 쓴다. 다시 시도하기 전에 이 숫자를 보라.
//
// 그래서 파일을 받기 전에 걸러내고, 무엇을 올려야 하는지 말해 준다.

import { FontFileFacts, Reason } from './types'

/** 검사에 필요한 만큼만 — fontkit Font 의 부분집합이라 순수 테스트가 된다. 저장 타입과 같다. */
export type FontFacts = FontFileFacts

export type FontVerdict = { ok: true } | { ok: false; reason: Reason }

/**
 * 이 파일을 임베드해도 되는가.
 *
 * 거절 사유는 "왜 안 되는지" 가 아니라 "그럼 뭘 올려야 하는지" 를 말하도록 문구를 짰다.
 * 사용자는 CFF 가 뭔지 알 필요가 없다.
 */
export function screenFontFile(facts: FontFacts): FontVerdict {
  // glyf 가 없고 CFF 가 있으면 PostScript 아웃라인이다
  const hasGlyf = facts.tables.includes('glyf')
  const hasCff = facts.tables.some((name) => name.trim() === 'CFF' || name.trim() === 'CFF2')
  if (!hasGlyf && hasCff) return { ok: false, reason: { code: 'fontFile.cff', params: {} } }

  if (facts.axes.length > 0) {
    return { ok: false, reason: { code: 'fontFile.variable', params: {} } }
  }

  if (!hasGlyf) return { ok: false, reason: { code: 'fontFile.noOutlines', params: {} } }

  return { ok: true }
}

/**
 * 올린 파일이 그 자리에 맞는 굵기·기울기인가.
 *
 * 우리는 파일 안의 이름표가 아니라 **Figma 가 쓰는 자리**로 저장한다. Regular 파일을
 * Bold 자리에 넣으면 Bold 라고 적힌 Regular 가 임베드된다 — 문서가 조용히 얇아진다.
 * 막지는 않는다(파일 이름표가 틀린 경우도 있다). 대신 알려 준다.
 */
export function weightMismatch(
  facts: FontFacts,
  expected: { weight: number; italic: boolean }
): { differs: false } | { differs: true; fileWeight: number; fileItalic: boolean } {
  const fileWeight = facts.weightClass
  const fileItalic = facts.italic
  if (fileWeight === undefined || fileItalic === undefined) return { differs: false }

  // 250/275 는 옛 GDI 가 250 미만을 못 다뤄 눌러 적던 관행이다 (fontCatalog 참고)
  const tolerated =
    expected.weight === 100
      ? [100, 250]
      : expected.weight === 200
        ? [200, 250, 275]
        : [expected.weight]

  if (tolerated.includes(fileWeight) && fileItalic === expected.italic) return { differs: false }
  return { differs: true, fileWeight, fileItalic }
}
