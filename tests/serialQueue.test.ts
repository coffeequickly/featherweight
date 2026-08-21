import { describe, expect, it } from 'vitest'

import { createSerialQueue } from '../src/lib/serialQueue'

function defer(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('createSerialQueue', () => {
  it('작업이 겹치지 않는다', async () => {
    const queue = createSerialQueue()
    let running = 0
    let maxConcurrent = 0

    const task = async (): Promise<void> => {
      running += 1
      maxConcurrent = Math.max(maxConcurrent, running)
      await defer(5)
      running -= 1
    }

    await Promise.all([queue(task), queue(task), queue(task), queue(task)])
    expect(maxConcurrent).toBe(1)
  })

  it('넘긴 순서대로 실행한다 — 나중 것이 앞의 결과를 본다', async () => {
    const queue = createSerialQueue()
    const log: string[] = []

    // 실제 버그 재현: 읽고→기다리고→쓰는 작업 4개
    let store: string[] = []
    const save = (name: string, delay: number) =>
      queue(async () => {
        const current = store
        await defer(delay)
        store = [...current, name]
        log.push(name)
      })

    await Promise.all([save('R', 12), save('S', 8), save('B', 4), save('EB', 1)])

    expect(log).toEqual(['R', 'S', 'B', 'EB'])
    expect(store).toEqual(['R', 'S', 'B', 'EB']) // 큐가 없으면 첫 항목이 사라진다
  })

  it('앞 작업이 실패해도 뒤 작업은 돈다', async () => {
    const queue = createSerialQueue()
    const done: string[] = []

    const failing = queue(async () => {
      throw new Error('boom')
    })
    const following = queue(async () => {
      done.push('ok')
    })

    await expect(failing).rejects.toThrow('boom')
    await following
    expect(done).toEqual(['ok'])
  })

  it('각 호출자는 자기 결과를 받는다', async () => {
    const queue = createSerialQueue()
    const results = await Promise.all([
      queue(async () => 1),
      queue(async () => 2),
      queue(async () => 3)
    ])
    expect(results).toEqual([1, 2, 3])
  })
})
