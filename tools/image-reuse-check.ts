import {
  forgetOriginals,
  rememberOriginal,
  probeImageBytes,
  resizeImageCached,
  resizeManyCached,
  imageCacheStats
} from '../src/ui/imageCache'
import { resizeImage, resizeMany } from '../src/ui/resize'
const same = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((v, i) => v === b[i])
export async function run(photo: Uint8Array) {
  const canvas = new OffscreenCanvas(1536, 1024)
  const ctx = canvas.getContext('2d')!
  const data = ctx.createImageData(1536, 1024)
  let seed = 123456
  for (let i = 0; i < data.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    data.data[i] = seed & 255
    data.data[i + 1] = (seed >>> 8) & 255
    data.data[i + 2] = (seed >>> 16) & 255
    data.data[i + 3] = (i / 4) % 3 === 0 ? 0 : 180
  }
  ctx.putImageData(data, 0, 0)
  const png = new Uint8Array(
    await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer()
  )
  const samples = [
    { name: 'EXIF photo', bytes: photo, crop: { x0: 220, y0: 300, w: 1200, h: 1400 } },
    { name: 'transparent PNG', bytes: png, crop: { x0: 30, y0: 60, w: 800, h: 700 } }
  ]
  const rows = []
  for (const sample of samples)
    for (const quality of [0.74, 0.8]) {
      forgetOriginals()
      const request = {
        imageHash: sample.name,
        bytes: sample.bytes,
        targetLongEdge: 960,
        quality,
        reencodeOpaquePng: true
      }
      const jobs = [{ crop: sample.crop, targetLongEdge: 640 }]
      const cold = []
      const warm = []
      let equal = true
      rememberOriginal(sample.name, sample.bytes)
      const probe = await probeImageBytes(
        [
          {
            imageHash: sample.name,
            targetLongEdge: 960,
            originalBytes: sample.bytes.length,
            skip: false,
            pieces: jobs,
            densityGain: 2
          }
        ],
        quality,
        true
      )
      for (let n = 0; n < 3; n++) {
        const start = performance.now()
        const whole = await resizeImage(request)
        const pieces = await resizeMany({ ...request, jobs })
        cold.push(performance.now() - start)
        const startReuse = performance.now()
        const cachedWhole = await resizeImageCached(request)
        const cachedPieces = await resizeManyCached({ ...request, jobs })
        warm.push(performance.now() - startReuse)
        if (!whole.ok || !pieces.ok || !cachedWhole.ok || !cachedPieces.ok)
          throw Error('encoding failed')
        equal &&=
          same(whole.bytes, cachedWhole.bytes) &&
          whole.mime === cachedWhole.mime &&
          whole.width === cachedWhole.width &&
          whole.height === cachedWhole.height &&
          whole.changed === cachedWhole.changed
        equal &&= pieces.results.every(
          (p, i) =>
            same(p.bytes, cachedPieces.results[i].bytes) &&
            p.width === cachedPieces.results[i].width &&
            p.height === cachedPieces.results[i].height &&
            p.mime === cachedPieces.results[i].mime
        )
      }
      rows.push({
        sample: sample.name,
        quality,
        equal,
        coldMs: cold,
        cachedMs: warm,
        cache: imageCacheStats(),
        probe
      })
      if (!equal) throw Error('byte difference')
    }
  forgetOriginals()
  return { userAgent: navigator.userAgent, rows, afterClear: imageCacheStats() }
}
