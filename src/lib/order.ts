// 선택 목록 정렬. Figma·DOM 의존 금지. (PRD FR-1)

export type Positioned = {
  id: string
  name: string
  x: number
  y: number
  height: number
}

/**
 * 캔버스 위치순: 위 → 아래 행, 행 안에서 왼 → 오른.
 * 행 판정 허용오차 = 해당 프레임 높이의 50%.
 */
export function sortByPosition<T extends Positioned>(items: readonly T[]): T[] {
  const rest = [...items].sort((a, b) => a.y - b.y || a.x - b.x)
  const out: T[] = []

  while (rest.length > 0) {
    const head = rest.shift() as T
    const tolerance = Math.abs(head.height) * 0.5
    const row: T[] = [head]

    for (let i = rest.length - 1; i >= 0; i -= 1) {
      const candidate = rest[i]
      if (Math.abs(candidate.y - head.y) <= tolerance) {
        row.push(candidate)
        rest.splice(i, 1)
      }
    }

    row.sort((a, b) => a.x - b.x)
    out.push(...row)
  }

  return out
}

/** 이름순: natural sort (01, 02, 10 순서가 지켜지도록 숫자 구간은 수로 비교). */
export function sortByName<T extends Positioned>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => compareNatural(a.name, b.name) || a.id.localeCompare(b.id))
}

export function compareNatural(a: string, b: string): number {
  const ta = tokenize(a)
  const tb = tokenize(b)
  const len = Math.min(ta.length, tb.length)

  for (let i = 0; i < len; i += 1) {
    const x = ta[i]
    const y = tb[i]
    if (typeof x === 'number' && typeof y === 'number') {
      if (x !== y) return x - y
    } else {
      const sx = String(x)
      const sy = String(y)
      const cmp = sx.localeCompare(sy, 'ko')
      if (cmp !== 0) return cmp
    }
  }

  return ta.length - tb.length
}

function tokenize(value: string): Array<string | number> {
  const parts = value.match(/\d+|\D+/g)
  if (parts === null) return []
  return parts.map((part) => (/^\d+$/.test(part) ? Number(part) : part.toLowerCase()))
}

export function sortItems<T extends Positioned>(
  items: readonly T[],
  mode: 'position' | 'name'
): T[] {
  return mode === 'name' ? sortByName(items) : sortByPosition(items)
}
