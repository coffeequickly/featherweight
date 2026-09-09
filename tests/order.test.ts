import { describe, expect, it } from 'vitest'

import {
  compareNatural,
  sortByLayer,
  sortByName,
  sortByPosition,
  sortItems
} from '../src/lib/order'

type Item = {
  id: string
  name: string
  x: number
  y: number
  height: number
  layerIndex: number
}

function item(id: string, name: string, x: number, y: number, height = 1000, layerIndex = 0): Item {
  return { id, name, x, y, height, layerIndex }
}

describe('sortByPosition', () => {
  it('행 안에서는 왼쪽 → 오른쪽', () => {
    const out = sortByPosition([item('b', 'B', 200, 0), item('a', 'A', 0, 0)])
    expect(out.map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('x 가 같은 세로 배치는 위 → 아래 — 행 후보를 뒤에서 뽑아도 순서가 뒤집히지 않는다', () => {
    const out = sortByPosition([
      item('a', 'A', 0, 0),
      item('b', 'B', 0, 300),
      item('c', 'C', 0, 450)
    ])
    expect(out.map((i) => i.id)).toEqual(['a', 'b', 'c'])
  })

  it('행 판정 허용오차는 프레임 높이의 50%', () => {
    // height 1000 → tolerance 500. y=400 은 같은 행, y=600 은 다음 행.
    const out = sortByPosition([
      item('c', 'C', 0, 600),
      item('b', 'B', 100, 400),
      item('a', 'A', 300, 0)
    ])
    expect(out.map((i) => i.id)).toEqual(['b', 'a', 'c'])
  })

  it('위 → 아래 순으로 행이 나온다', () => {
    const out = sortByPosition([
      item('r2l', 'x', 0, 2000, 100),
      item('r1r', 'x', 500, 0, 100),
      item('r1l', 'x', 0, 0, 100),
      item('r2r', 'x', 500, 2000, 100)
    ])
    expect(out.map((i) => i.id)).toEqual(['r1l', 'r1r', 'r2l', 'r2r'])
  })

  it('원본 배열을 바꾸지 않는다', () => {
    const input = [item('b', 'B', 200, 0), item('a', 'A', 0, 0)]
    sortByPosition(input)
    expect(input.map((i) => i.id)).toEqual(['b', 'a'])
  })
})

describe('sortByName', () => {
  it('natural sort — 01, 02, 10', () => {
    const out = sortByName([
      item('3', '10 Contact', 0, 0),
      item('1', '01 Cover', 0, 0),
      item('2', '02 About', 0, 0)
    ])
    expect(out.map((i) => i.name)).toEqual(['01 Cover', '02 About', '10 Contact'])
  })

  it('숫자 없는 이름은 사전순', () => {
    const out = sortByName([item('b', 'beta', 0, 0), item('a', 'alpha', 0, 0)])
    expect(out.map((i) => i.name)).toEqual(['alpha', 'beta'])
  })

  it('이름이 같으면 id 로 안정 정렬', () => {
    const out = sortByName([item('b', 'same', 0, 0), item('a', 'same', 0, 0)])
    expect(out.map((i) => i.id)).toEqual(['a', 'b'])
  })
})

describe('compareNatural', () => {
  it('대소문자를 구분하지 않는다', () => {
    expect(compareNatural('Cover', 'cover')).toBe(0)
  })

  it('접두사가 같으면 짧은 쪽이 먼저', () => {
    expect(compareNatural('Project', 'Project-A')).toBeLessThan(0)
  })

  it('숫자 구간은 수로 비교한다', () => {
    expect(compareNatural('p2', 'p10')).toBeLessThan(0)
  })
})

describe('sortByLayer', () => {
  it('레이어 패널에서 위에 있는 것부터', () => {
    const out = sortByLayer([
      item('c', 'C', 0, 0, 100, 2),
      item('a', 'A', 0, 0, 100, 0),
      item('b', 'B', 0, 0, 100, 1)
    ])
    expect(out.map((row) => row.id)).toEqual(['a', 'b', 'c'])
  })

  it('같은 자리면 캔버스 위치가 정한다 — 부모를 못 찾아 전부 0 인 경우', () => {
    const out = sortByLayer([item('b', 'B', 0, 300), item('a', 'A', 0, 0)])
    expect(out.map((row) => row.id)).toEqual(['a', 'b'])
  })
})

describe('sortItems', () => {
  const rows = [
    item('b', '02 B', 200, 0, 100, 1),
    item('a', '01 A', 0, 0, 100, 2),
    item('c', '03 C', 400, 0, 100, 0)
  ]

  it("'selection' 은 정렬하지 않는다 — 고른 차례가 곧 순서다", () => {
    expect(sortItems(rows, 'selection').map((row) => row.id)).toEqual(['b', 'a', 'c'])
  })

  it('뒤집기는 기준과 별개다', () => {
    expect(sortItems(rows, 'name').map((row) => row.id)).toEqual(['a', 'b', 'c'])
    expect(sortItems(rows, 'name', true).map((row) => row.id)).toEqual(['c', 'b', 'a'])
  })

  it('원본 배열을 건드리지 않는다', () => {
    sortItems(rows, 'position', true)
    expect(rows.map((row) => row.id)).toEqual(['b', 'a', 'c'])
  })
})
