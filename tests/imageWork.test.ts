import { describe, expect, it, vi } from 'vitest'
import { ByteCache, ImageWorkQueue } from '../src/lib/imageWork'

const bytes = (length: number) => ({ bytes: new Uint8Array(length) })
describe('byte bounded encoded cache', () => {
  it('evicts least recently used data and rejects oversized or backing-buffer views', () => {
    const cache = new ByteCache(10)
    cache.set('a', bytes(4))
    cache.set('b', bytes(4))
    cache.get('a')
    cache.set('c', bytes(4))
    expect(cache.get('b')).toBeUndefined()
    expect(cache.bytes).toBe(8)
    cache.set('large', bytes(11))
    cache.set('view', { bytes: new Uint8Array(100).subarray(0, 1) })
    expect(cache.bytes).toBe(8)
    cache.resize(4)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.bytes).toBe(4)
    cache.clear()
    expect(cache.bytes).toBe(0)
  })
  it('replacing keys accounts for both growth and shrinkage', () => {
    const cache = new ByteCache(10)
    cache.set('a', bytes(8))
    cache.set('a', bytes(3))
    expect(cache.bytes).toBe(3)
    cache.set('a', bytes(11))
    expect(cache.bytes).toBe(0)
  })
})

describe('image work admission', () => {
  function blocked() {
    let release!: () => void
    const promise = new Promise<void>((resolve) => {
      release = resolve
    })
    return { promise, release }
  }
  it('overlaps small images within both byte budget and concurrency limit', async () => {
    const queue = new ImageWorkQueue(100, 4)
    const gate = blocked()
    const started: number[] = []
    const jobs = Array.from({ length: 6 }, (_, i) =>
      queue.run(20, async () => {
        started.push(i)
        await gate.promise
      })
    )
    await vi.waitFor(() => expect(started).toHaveLength(4))
    gate.release()
    await Promise.all(jobs)
    expect(started).toEqual([0, 1, 2, 3, 4, 5])
  })
  it.each([60, Infinity, 1000])(
    'serializes jobs costing %s and releases capacity on failure',
    async (cost) => {
      const queue = new ImageWorkQueue(100, 4)
      const gate = blocked()
      const first = queue.run(cost, async () => {
        await gate.promise
        throw new Error('encoder')
      })
      const checked = expect(first).rejects.toThrow('encoder')
      const next = vi.fn(async () => 42)
      const second = queue.run(cost, next)
      await Promise.resolve()
      expect(next).not.toHaveBeenCalled()
      gate.release()
      await checked
      expect(await second).toBe(42)
    }
  )
  it('cancels waiting work while retaining admission accounting for in-flight work', async () => {
    const queue = new ImageWorkQueue(100, 4)
    const gate = blocked()
    const active = queue.run(100, async () => {
      await gate.promise
    })
    const never = vi.fn(async () => {})
    const pending = queue.run(100, never)
    const checked = expect(pending).rejects.toThrow('cancelled')
    queue.cancelPending()
    await checked
    const next = vi.fn(async () => {})
    const nextRun = queue.run(100, next)
    await Promise.resolve()
    expect(next).not.toHaveBeenCalled()
    gate.release()
    await Promise.all([active, nextRun])
    expect(never).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledOnce()
  })
})
