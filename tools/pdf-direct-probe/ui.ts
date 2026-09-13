import { PDFDocument, PDFDict, PDFName, PDFRawStream, PDFRef, PDFNumber } from 'pdf-lib'
import { replaceBoundJpeg } from './replace'
import { resizeImage } from '../../src/ui/resize'
const root = document.getElementById('root')!
const status = document.getElementById('status')!
const save = document.getElementById('save') as HTMLButtonElement
const post = (message: unknown) => parent.postMessage({ pluginMessage: message }, '*')
const base64 = (bytes: Uint8Array) => {
  let text = ''
  for (let i = 0; i < bytes.length; i += 16384)
    text += String.fromCharCode(...bytes.subarray(i, i + 16384))
  return btoa(text)
}
let files: Record<string, string> = {}
let metadata: unknown
let timings: unknown
let encodedVariants: Array<{ quality: number; bytes: Uint8Array; width: number; height: number }> =
  []
let downloadUrl: string | undefined
save.onclick = () => {
  if (downloadUrl) URL.revokeObjectURL(downloadUrl)
  downloadUrl = URL.createObjectURL(
    new Blob([JSON.stringify({ metadata, encoding: timings, files })], { type: 'application/json' })
  )
  const link = document.createElement('a')
  link.href = downloadUrl
  link.download = 'pdf-direct-capture.json'
  link.click()
}
window.onmessage = async (event) => {
  const message = event.data.pluginMessage
  if (!message) return
  if (message.op === 'list') {
    root.replaceChildren()
    for (const candidate of message.candidates) {
      const button = document.createElement('button')
      button.textContent = `${candidate.name} · fill ${candidate.fillIndex} · ${candidate.nodeId}`
      button.onclick = () => {
        root.querySelectorAll('button').forEach((b) => {
          b.disabled = true
        })
        post({ op: 'run', ...candidate })
      }
      root.appendChild(button)
    }
    if (!message.candidates.length)
      status.textContent = '이미지가 있는 노드를 선택한 후 다시 실행하세요.'
  }
  if (message.op === 'status' || message.op === 'error') status.textContent = message.text
  if (message.op === 'encode') {
    try {
      const source = new Uint8Array(message.bytes)
      files = { 'source.bin': base64(source) }
      const variants = []
      for (const quality of [0.6, 0.7, 0.76, 0.8, 0.85, 0.9, 0.98]) {
        const start = performance.now()
        const result = await resizeImage({
          bytes: source,
          targetLongEdge: 1920,
          quality,
          reencodeOpaquePng: true
        })
        if (!result.ok) throw new Error(result.reason)
        if (result.mime !== 'image/jpeg' || !result.changed)
          throw new Error('This probe requires a resized opaque JPEG')
        variants.push({
          quality,
          bytes: result.bytes,
          width: result.width,
          height: result.height,
          ms: performance.now() - start
        })
        files[`q${Math.round(quality * 100)}.jpg`] = base64(result.bytes)
      }
      encodedVariants = variants
      timings = variants.map(({ quality, bytes, ...rest }) => ({
        quality,
        bytes: bytes.length,
        ...rest
      }))
      post({ op: 'encoded', variants })
    } catch (error) {
      post({ op: 'encoded', error: String(error), variants: [] })
    }
  }
  if (message.op === 'done') {
    files['reference.pdf'] = base64(new Uint8Array(message.reference))
    files['baseline.pdf'] = base64(new Uint8Array(message.baseline))
    metadata = message.metadata
    let directError: string | undefined
    try {
      const pdf = new Uint8Array(message.baseline)
      const doc = await PDFDocument.load(pdf)
      const resources = doc.getPage(0).node.Resources()!.lookup(PDFName.of('XObject'), PDFDict)
      if (doc.getPageCount() !== 1 || resources.keys().length !== 1)
        throw new Error('Ambiguous probe PDF')
      const resource = resources.keys()[0]
      const ref = resources.get(resource)
      if (!(ref instanceof PDFRef)) throw new Error('Expected indirect image')
      const image = doc.context.lookup(ref)
      if (!(image instanceof PDFRawStream)) throw new Error('Not a raw image stream')
      const binding = {
        pdfBytes: pdf.slice(),
        page: 0,
        resource: resource.toString(),
        objectNumber: ref.objectNumber,
        imageBytes: image.contents.slice(),
        width: image.dict.lookup(PDFName.of('Width'), PDFNumber).asNumber(),
        height: image.dict.lookup(PDFName.of('Height'), PDFNumber).asNumber()
      }
      const direct = []
      for (const variant of encodedVariants) {
        const start = performance.now()
        const result = await replaceBoundJpeg(pdf, variant.bytes, binding)
        direct.push({
          quality: variant.quality,
          bytes: result.length,
          ms: performance.now() - start
        })
        files[`browser-q${Math.round(variant.quality * 100)}.pdf`] = base64(result)
      }
      metadata = {
        ...message.metadata,
        browserBinding: {
          page: binding.page,
          resource: binding.resource,
          objectNumber: binding.objectNumber,
          width: binding.width,
          height: binding.height
        },
        direct
      }
    } catch (error) {
      directError = String(error)
      metadata = { ...message.metadata, directError }
    }
    status.textContent = directError
      ? `원본 캡처 완료 · 직접 교체 실패: ${directError}. 캡처를 저장해 원인을 확인하세요.`
      : '직접 교체까지 완료. 임시 프레임을 제거했습니다. 캡처 저장 버튼으로 원본·식별 정보·PDF를 한 파일로 저장하세요.'
    save.hidden = false
  }
}
