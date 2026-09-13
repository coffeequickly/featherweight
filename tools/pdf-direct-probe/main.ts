// Isolated experiment; does not participate in the Featherweight build.
figma.showUI(__html__, { width: 540, height: 460 })
let busy = false
let frame: FrameNode | undefined
let resolveEncoding: ((message: Encoded) => void) | undefined

type Encoded = {
  op: 'encoded'
  variants: Array<{ quality: number; bytes: Uint8Array; width: number; height: number; ms: number }>
  error?: string
}
const send = (message: unknown) => figma.ui.postMessage(message)
function candidates() {
  const result: Array<{ nodeId: string; fillIndex: number; name: string }> = []
  for (const root of figma.currentPage.selection) {
    const nodes = [root, ...('findAll' in root ? root.findAll() : [])]
    for (const node of nodes) {
      if (!('fills' in node) || !Array.isArray(node.fills)) continue
      node.fills.forEach((paint: Paint, fillIndex: number) => {
        if (paint.type === 'IMAGE' && paint.imageHash && paint.visible !== false)
          result.push({ nodeId: node.id, fillIndex, name: node.name })
      })
    }
  }
  return result
}
figma.on('close', () => {
  if (frame && !frame.removed) frame.remove()
})
figma.ui.onmessage = async (message) => {
  if (message.op === 'encoded') {
    resolveEncoding?.(message)
    return
  }
  if (message.op === 'list') {
    send({ op: 'list', candidates: candidates() })
    return
  }
  if (message.op !== 'run' || busy) return
  busy = true
  const start = Date.now()
  try {
    const node = await figma.getNodeByIdAsync(message.nodeId)
    if (!node || !('fills' in node) || !Array.isArray(node.fills))
      throw new Error('Image node unavailable')
    const paint = node.fills[message.fillIndex] as ImagePaint
    if (!paint || paint.type !== 'IMAGE' || !paint.imageHash)
      throw new Error('Image paint unavailable')
    if (
      (paint.opacity ?? 1) !== 1 ||
      (paint.blendMode && paint.blendMode !== 'NORMAL') ||
      Object.values(paint.filters ?? {}).some((value) => value !== 0)
    )
      throw new Error('This experiment requires an opaque, unfiltered, normal image paint')
    const transform = paint.imageTransform
    if (
      paint.scaleMode !== 'CROP' ||
      !transform ||
      transform[0][1] !== 0 ||
      transform[1][0] !== 0 ||
      transform[0][0] <= 0 ||
      transform[1][1] <= 0
    )
      throw new Error('This capture protocol currently requires an axis-aligned CROP paint')
    const source = figma.getImageByHash(paint.imageHash)!
    const bytes = await source.getBytesAsync()
    const dimensions = await source.getSizeAsync()
    const metadata = {
      nodeId: node.id,
      name: node.name,
      fillIndex: message.fillIndex,
      imageHash: paint.imageHash,
      width: node.width,
      height: node.height,
      absoluteTransform: node.absoluteTransform,
      paint,
      dimensions,
      protocol:
        'Isolated rectangle reproducing one selected paint; same 1920px full-image dimensions, no crop optimization; baseline is q80 via Figma, direct variants use original source through production resizeImage.'
    }
    send({ op: 'status', text: '원본과 대상 식별 완료. 같은 해상도의 품질별 JPEG를 만듭니다.' })
    const encodedPromise = new Promise<Encoded>((resolve) => {
      const timeout = setTimeout(
        () =>
          resolve({ op: 'encoded', variants: [], error: 'Encoding timed out after 30 seconds' }),
        30000
      )
      resolveEncoding = (message) => {
        clearTimeout(timeout)
        resolve(message)
      }
    })
    send({ op: 'encode', bytes, metadata })
    const encoded = await encodedPromise
    resolveEncoding = undefined
    if (encoded.error) throw new Error(encoded.error)
    const baseline = encoded.variants.find((item) => item.quality === 0.8)!
    if (!baseline) throw new Error('Missing q80 baseline')
    frame = figma.createFrame()
    frame.name = '__pdf_direct_probe_temporary__'
    frame.resize(node.width, node.height)
    frame.x = 110000
    frame.y = 110000
    frame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }]
    frame.clipsContent = true
    const rect = figma.createRectangle()
    rect.resize(node.width, node.height)
    rect.fills = [paint]
    rect.strokes = []
    frame.appendChild(rect)
    rect.x = 0
    rect.y = 0
    send({ op: 'status', text: '원본 기준 PDF를 만듭니다. 문서 원본은 변경하지 않습니다.' })
    const refStart = Date.now()
    const reference = await frame.exportAsync({ format: 'PDF' })
    const referenceMs = Date.now() - refStart
    const applyStart = Date.now()
    const image = figma.createImage(baseline.bytes)
    rect.fills = [{ ...paint, imageHash: image.hash }]
    const createMs = Date.now() - applyStart
    // Deliberately retain a conservative wait; readiness optimization is outside this spike.
    await new Promise((resolve) => setTimeout(resolve, 700))
    const exportStart = Date.now()
    const pdf = await frame.exportAsync({ format: 'PDF' })
    const exportMs = Date.now() - exportStart
    frame.remove()
    frame = undefined
    send({
      op: 'done',
      reference,
      baseline: pdf,
      metadata: {
        ...metadata,
        baselineImageHash: image.hash,
        timings: { referenceMs, createMs, settleMs: 700, exportMs, totalMs: Date.now() - start }
      }
    })
  } catch (error) {
    send({ op: 'error', text: String(error) })
  } finally {
    if (frame && !frame.removed) frame.remove()
    frame = undefined
    busy = false
  }
}
send({ op: 'list', candidates: candidates() })
