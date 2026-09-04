import { describe, expect, it } from 'vitest'

import { detachInstances } from '../src/main/text'

/** 인스턴스 흉내 — detachInstance 는 자신을 FRAME 으로 바꾸고, 안쪽 인스턴스는 바깥이 떼어진 뒤에만 떼어진다 */
type Fake = {
  type: string
  removed: boolean
  parent: Fake | null
  children: Fake[]
  findAll: (fn: (n: Fake) => boolean) => Fake[]
  detachInstance: () => Fake
}

function make(type: string, children: Fake[] = []): Fake {
  const node: Fake = {
    type,
    removed: false,
    parent: null,
    children,
    findAll(fn) {
      const out: Fake[] = []
      const walk = (n: Fake): void => {
        for (const child of n.children) {
          if (fn(child)) out.push(child)
          walk(child)
        }
      }
      walk(node)
      return out
    },
    detachInstance() {
      let up = node.parent
      while (up !== null) {
        if (up.type === 'INSTANCE') throw new Error('nested instance')
        up = up.parent
      }
      node.type = 'FRAME'
      return node
    }
  }
  for (const child of children) child.parent = node
  return node
}

describe('detachInstances', () => {
  it('안의 인스턴스를 전부 프레임으로 — 안쪽은 바깥이 떼어진 다음 바퀴에', () => {
    const inner = make('INSTANCE', [make('TEXT')])
    const outer = make('INSTANCE', [inner])
    const root = make('FRAME', [outer, make('INSTANCE')])
    detachInstances(root as unknown as SceneNode)
    expect(root.findAll((n) => n.type === 'INSTANCE')).toEqual([])
    expect(inner.type).toBe('FRAME')
  })

  it('루트가 인스턴스면 떼어 낸 프레임을 돌려준다', () => {
    const root = make('INSTANCE', [make('TEXT')])
    const result = detachInstances(root as unknown as SceneNode) as unknown as Fake
    expect(result.type).toBe('FRAME')
  })

  it('인스턴스가 없으면 그대로', () => {
    const root = make('FRAME', [make('TEXT')])
    expect(detachInstances(root as unknown as SceneNode)).toBe(root as unknown as SceneNode)
  })
})
