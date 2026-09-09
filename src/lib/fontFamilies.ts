// 폰트 목록을 패밀리 단위로 묶는다. Figma·DOM 의존 금지.
//
// 자리마다 한 줄을 그리면 Pretendard 한 서체가 여섯 줄을 차지하고, 그 여섯 줄이 전부
// "내보낼 때 받아옴" 을 반복한다. 서체 이름 한 줄에 스타일을 뱃지로 늘어놓으면 아홉 줄이
// 세 줄이 되고, 문제 있는 하나가 눈에 남는다.
//
// 패밀리는 **문서의 폰트 이름 그대로** 나눈다. `Pretendard` 와 `Pretendard Variable` 은
// 카탈로그가 둘 다 같은 static 인스턴스를 주더라도 별도 두 줄이다 — 사용자가 Figma 에서
// 고른 이름이 화면에 없으면 "내가 고른 게 왜 없지" 가 된다.

import { availabilityOf, FontAvailability, storedFileProblem } from './fontStatus'
import { FontUsage, StoredFont } from './types'

export type FamilyStyle = {
  usage: FontUsage
  availability: FontAvailability
  /**
   * 이 자리가 지금 아웃라인으로 나가거나 틀린 모양으로 나가는가.
   * 뱃지에 표시를 붙일지, 패밀리를 위로 올릴지가 여기서 갈린다.
   */
  problem: boolean
}

export type FontFamilyRow = {
  family: string
  /** 문제 있는 것이 앞 — 뱃지를 접을 때 뒤에서부터 접어도 문제는 남는다 */
  styles: FamilyStyle[]
  problems: number
  /** 이 패밀리로 저장해 둔 바이트 합. 저장본이 없으면 0 */
  storedBytes: number
  /** 자리 전부가 카탈로그 — 내보낼 때 받아온다 */
  allCatalog: boolean
}

export function fontFamilies(
  fonts: readonly FontUsage[],
  stored: readonly StoredFont[]
): FontFamilyRow[] {
  const byFamily = new Map<string, FamilyStyle[]>()

  for (const usage of fonts) {
    const availability = availabilityOf(usage, stored)
    const problem =
      availability.kind === 'missing' ||
      (availability.kind === 'uploaded' && storedFileProblem(availability.font) !== null)

    const found = byFamily.get(usage.family)
    if (found === undefined) byFamily.set(usage.family, [{ usage, availability, problem }])
    else found.push({ usage, availability, problem })
  }

  const rows: FontFamilyRow[] = []
  for (const [family, styles] of byFamily) {
    // 문제 있는 것이 앞. 그 안에서는 문서에 나온 순서를 지킨다
    const sorted = [...styles].sort((a, b) => Number(b.problem) - Number(a.problem))
    rows.push({
      family,
      styles: sorted,
      problems: styles.filter((style) => style.problem).length,
      storedBytes: styles.reduce(
        (sum, style) =>
          sum + (style.availability.kind === 'uploaded' ? style.availability.font.byteLength : 0),
        0
      ),
      allCatalog: styles.every((style) => style.availability.kind === 'catalog')
    })
  }

  // 손볼 것이 위로. 같으면 이름순 — 목록이 열 때마다 뒤바뀌면 못 찾는다
  return rows.sort((a, b) => b.problems - a.problems || a.family.localeCompare(b.family, undefined))
}

/**
 * 뱃지를 몇 개까지 늘어놓을지. 폭이 모자라면 **정상인 것부터** 접는다 —
 * 문제 있는 뱃지는 접지 않는다. 그게 이 줄을 보는 이유다.
 */
export function visibleStyles(
  row: FontFamilyRow,
  limit: number
): { shown: FamilyStyle[]; rest: number } {
  if (row.styles.length <= limit) return { shown: row.styles, rest: 0 }
  // styles 는 문제 있는 것이 앞이므로 앞에서부터 자르면 문제는 살아남는다
  const keep = Math.max(limit, row.problems)
  return { shown: row.styles.slice(0, keep), rest: row.styles.length - keep }
}
