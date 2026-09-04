import { describe, expect, it } from 'vitest'

import { freezeLayout } from '../src/main/text'

type Fake = {
  type: string
  parent: Fake | null
  layoutMode?: string
  layoutSizingHorizontal?: string
  layoutSizingVertical?: string
}

const page: Fake = { type: 'PAGE', parent: null }
const autoFrame = (parent: Fake): Fake => ({
  type: 'FRAME',
  parent,
  layoutMode: 'VERTICAL',
  layoutSizingHorizontal: 'FIXED',
  layoutSizingVertical: 'HUG'
})

describe('freezeLayout', () => {
  it('직계 부모가 오토레이아웃이면 그것을 굳힌다', () => {
    const frame = autoFrame(page)
    freezeLayout(frame as unknown as BaseNode)
    expect(frame.layoutMode).toBe('NONE')
    expect(frame.layoutSizingVertical).toBe('FIXED')
  })

  it('그룹 안의 텍스트 — 그룹을 지나 위의 오토레이아웃을 굳힌다 (구분선이 올라오던 버그)', () => {
    const section = autoFrame(page)
    const group: Fake = { type: 'GROUP', parent: section }
    freezeLayout(group as unknown as BaseNode)
    expect(section.layoutMode).toBe('NONE')
  })

  it('오토레이아웃이 아닌 프레임을 만나면 거기서 멈춘다 — 그 안은 절대 좌표', () => {
    const outer = autoFrame(page)
    const plain: Fake = { type: 'FRAME', parent: outer, layoutMode: 'NONE' }
    const group: Fake = { type: 'GROUP', parent: plain }
    freezeLayout(group as unknown as BaseNode)
    expect(outer.layoutMode).toBe('VERTICAL')
  })

  it('페이지까지 올라가도 없으면 아무것도 안 한다', () => {
    const group: Fake = { type: 'GROUP', parent: page }
    expect(() => freezeLayout(group as unknown as BaseNode)).not.toThrow()
  })
})
