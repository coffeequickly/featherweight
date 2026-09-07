import { describe, expect, it } from 'vitest'

import { expandContainers } from '../src/main/selection'
import { TMP_MARK_KEY, TMP_NODE_NAME } from '../src/lib/types'

/** 섹션·프레임 흉내 — expandContainers 는 type·name·id·children·임시 표식만 본다 */
type Fake = {
  id: string
  name: string
  type: string
  children?: Fake[]
  getPluginData: (key: string) => string
}
const node = (id: string, type: string, children?: Fake[], name = id, temporary = false): Fake => ({
  id,
  name,
  type,
  getPluginData: (key) => (temporary && key === TMP_MARK_KEY ? '1' : ''),
  ...(children === undefined ? {} : { children })
})
const expand = (nodes: Fake[]): string[] =>
  expandContainers(nodes as unknown as SceneNode[]).map((n) => n.id)

describe('expandContainers', () => {
  it('섹션을 고르면 안의 프레임이 페이지가 된다', () => {
    const section = node('s', 'SECTION', [
      node('a', 'FRAME'),
      node('b', 'FRAME'),
      node('r', 'RECTANGLE')
    ])
    expect(expand([section])).toEqual(['a', 'b'])
  })

  it('페이지가 될 게 없는 섹션은 섹션 자체가 한 쪽', () => {
    const section = node('s', 'SECTION', [node('r', 'RECTANGLE')])
    expect(expand([section])).toEqual(['s'])
  })

  it('섹션 속 섹션도 따라 들어간다', () => {
    const inner = node('inner', 'SECTION', [node('c', 'FRAME')])
    const outer = node('outer', 'SECTION', [node('a', 'FRAME'), inner])
    expect(expand([outer])).toEqual(['a', 'c'])
  })

  it('섹션과 그 안의 프레임을 같이 골라도 한 번만 센다', () => {
    const a = node('a', 'FRAME')
    const section = node('s', 'SECTION', [a, node('b', 'FRAME')])
    expect(expand([section, a])).toEqual(['a', 'b'])
  })

  it('Slides 의 행은 안의 슬라이드로 푼다', () => {
    const row = node('row', 'SLIDE_ROW', [node('s1', 'SLIDE'), node('s2', 'SLIDE')])
    expect(expand([row])).toEqual(['s1', 's2'])
  })

  it('임시 클론과 내보낼 수 없는 것은 뺀다', () => {
    expect(
      expand([node('tmp', 'FRAME', undefined, TMP_NODE_NAME, true), node('t', 'TEXT')])
    ).toEqual([])
    // 이름만 같은 사용자 프레임은 우리 것이 아니다 — 내보낼 수 있다
    expect(expand([node('u', 'FRAME', undefined, TMP_NODE_NAME)])).toEqual(['u'])
  })
})
