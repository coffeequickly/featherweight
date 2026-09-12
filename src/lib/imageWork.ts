// Byte-accounted retention and admission control; browser/GPU allocations are estimates.
export class ByteCache<T extends { bytes: Uint8Array }> {
  private entries = new Map<string, T>()
  private size = 0
  constructor(private capacity: number) {}
  get bytes(): number {
    return this.size
  }
  get(key: string): T | undefined {
    const value = this.entries.get(key)
    if (value !== undefined) {
      this.entries.delete(key)
      this.entries.set(key, value)
    }
    return value
  }
  set(key: string, value: T): void {
    const previous = this.entries.get(key)
    if (previous !== undefined) this.size -= previous.bytes.byteLength
    this.entries.delete(key)
    // A view may retain a much larger backing buffer. Do not retain those.
    if (
      value.bytes.byteLength > this.capacity ||
      value.bytes.buffer.byteLength !== value.bytes.byteLength
    )
      return
    this.entries.set(key, value)
    this.size += value.bytes.byteLength
    this.trim()
  }
  resize(capacity: number): void {
    this.capacity = Math.max(0, capacity)
    this.trim()
  }
  clear(): void {
    this.entries.clear()
    this.size = 0
  }
  private trim(): void {
    while (this.size > this.capacity || this.entries.size > 1024) {
      const first = this.entries.entries().next().value
      if (first === undefined) break
      this.entries.delete(first[0])
      this.size -= first[1].bytes.byteLength
    }
  }
}

export class ImageWorkQueue {
  private active = 0
  private used = 0
  private pending: Array<{ cost: number; start: () => void; cancel: () => void }> = []
  constructor(
    private budget: number,
    private width: number
  ) {}
  run<T>(estimatedBytes: number, work: () => Promise<T>): Promise<T> {
    // Unknown and over-budget images run alone, rather than starving forever.
    const cost =
      Number.isFinite(estimatedBytes) && estimatedBytes > 0
        ? Math.min(estimatedBytes, this.budget)
        : this.budget
    return new Promise<T>((resolve, reject) => {
      this.pending.push({
        cost,
        cancel: () => reject(new Error('Image work cancelled')),
        start: () => {
          this.active += 1
          this.used += cost
          void Promise.resolve()
            .then(work)
            .then(resolve, reject)
            .finally(() => {
              this.active -= 1
              this.used -= cost
              this.drain()
            })
        }
      })
      this.drain()
    })
  }
  cancelPending(): void {
    for (const job of this.pending.splice(0)) job.cancel()
  }
  private drain(): void {
    while (this.pending.length > 0 && this.active < this.width) {
      const job = this.pending[0]
      if (this.used + job.cost > this.budget) break
      this.pending.shift()
      job.start()
    }
  }
}
