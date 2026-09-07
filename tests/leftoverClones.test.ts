import { beforeEach, describe, expect, it } from 'vitest'

import { TMP_MARK_KEY, TMP_NODE_NAME } from '../src/lib/types'
import { removeLeftoverClones } from '../src/main/exporter'
import { isTemporary, markTemporary } from '../src/main/temporary'

type Fake = {
  name: string
  x: number
  removed: boolean
  data: Record<string, string>
  getPluginData: (key: string) => string
  setPluginData: (key: string, value: string) => void
  remove: () => void
}

function fake(name: string, x = 0, marked = false, removeThrows = false): Fake {
  const node: Fake = {
    name,
    x,
    removed: false,
    data: marked ? { [TMP_MARK_KEY]: '1' } : {},
    getPluginData: (key) => node.data[key] ?? '',
    setPluginData: (key, value) => {
      node.data[key] = value
    },
    remove: () => {
      if (removeThrows) throw new Error('locked')
      node.removed = true
    }
  }
  return node
}

let children: Fake[] = []

beforeEach(() => {
  children = []
  Object.assign(globalThis, {
    figma: {
      currentPage: {
        get children() {
          return children
        },
        findAllWithCriteria: ({ pluginData }: { pluginData: { keys: string[] } }) =>
          children.filter((node) => pluginData.keys.some((key) => node.getPluginData(key) !== ''))
      }
    }
  })
})

describe('markTemporary / isTemporary', () => {
  it('표식을 붙이면 이름과 pluginData 가 함께 생긴다', () => {
    const node = fake('Frame 1')
    markTemporary(node as unknown as SceneNode)
    expect(node.name).toBe(TMP_NODE_NAME)
    expect(isTemporary(node as unknown as BaseNode)).toBe(true)
  })
})

describe('removeLeftoverClones', () => {
  it('표식이 있는 노드만 지우고, 이름만 같은 사용자 프레임은 남긴다', () => {
    const ours = fake(TMP_NODE_NAME, 100_000, true)
    const users = fake(TMP_NODE_NAME, 0)
    const other = fake('Cover', 0)
    children = [ours, users, other]

    expect(removeLeftoverClones()).toBe(1)
    expect(ours.removed).toBe(true)
    expect(users.removed).toBe(false)
    expect(other.removed).toBe(false)
  })

  it('표식 없는 옛 버전의 클론은 이름 + 화면 밖 자리로 알아본다', () => {
    const legacy = fake(TMP_NODE_NAME, 110_000)
    children = [legacy]

    expect(removeLeftoverClones()).toBe(1)
    expect(legacy.removed).toBe(true)
  })

  it('하나를 못 지워도 나머지는 지우고 던지지 않는다', () => {
    const locked = fake(TMP_NODE_NAME, 100_000, true, true)
    const ours = fake(TMP_NODE_NAME, 110_000, true)
    children = [locked, ours]

    let removed = -1
    expect(() => {
      removed = removeLeftoverClones()
    }).not.toThrow()
    expect(removed).toBe(1)
    expect(ours.removed).toBe(true)
    expect(locked.removed).toBe(false)
  })
})
