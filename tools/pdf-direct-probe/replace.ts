// Only for controlled one-image captures. Not a document-wide image mapper.
import {
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFDict,
  PDFRef,
  PDFNumber,
  PDFArray,
  decodePDFRawStream
} from 'pdf-lib'
export type ProbeBinding = {
  pdfBytes: Uint8Array
  page: number
  resource: string
  objectNumber: number
  width: number
  height: number
  imageBytes: Uint8Array
}
const name = (value: string) => PDFName.of(value)
const equalBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((byte, i) => byte === b[i])
export async function replaceBoundJpeg(
  pdfBytes: Uint8Array,
  jpegBytes: Uint8Array,
  binding: ProbeBinding
) {
  if (!equalBytes(pdfBytes, binding.pdfBytes)) throw new Error('PDF differs from the bound capture')
  const doc = await PDFDocument.load(pdfBytes, { updateMetadata: false })
  if (doc.getPageCount() !== 1 || binding.page !== 0)
    throw new Error('Only isolated one-page probes are supported')
  const xobjects = doc.getPage(0).node.Resources()!.lookup(name('XObject'), PDFDict)
  if (xobjects.keys().length !== 1) throw new Error('Ambiguous image resources')
  const ref = xobjects.get(name(binding.resource.replace(/^\//, '')))
  if (!(ref instanceof PDFRef) || ref.objectNumber !== binding.objectNumber)
    throw new Error('Image reference mismatch')
  const old = doc.context.lookup(ref)
  if (!(old instanceof PDFRawStream) || old.dict.get(name('Subtype'))?.toString() !== '/Image')
    throw new Error('Not an image stream')
  if (!equalBytes(old.contents, binding.imageBytes)) throw new Error('Image stream mismatch')
  if (
    old.dict.lookup(name('BitsPerComponent'), PDFNumber).asNumber() !== 8 ||
    old.dict.has(name('Decode')) ||
    old.dict.has(name('DecodeParms')) ||
    old.dict.has(name('Mask'))
  )
    throw new Error('Unsupported image decoding')
  const filter = old.dict.lookup(name('Filter'))?.toString()
  if (filter !== '/DCTDecode' && filter?.replace(/\s/g, '') !== '[/DCTDecode]')
    throw new Error('Only JPEG input streams supported')
  if (
    old.dict.lookup(name('Width'), PDFNumber).asNumber() !== binding.width ||
    old.dict.lookup(name('Height'), PDFNumber).asNumber() !== binding.height
  )
    throw new Error('Bound dimensions mismatch')
  const colorSpace = old.dict.lookup(name('ColorSpace'))
  if (colorSpace?.toString() !== '/DeviceRGB') {
    if (!(colorSpace instanceof PDFArray) || colorSpace.lookup(0)?.toString() !== '/ICCBased')
      throw new Error('Unsupported PDF color space')
    const profile = colorSpace.lookup(1)
    if (
      !(profile instanceof PDFRawStream) ||
      profile.dict.lookup(name('N'), PDFNumber).asNumber() !== 3
    )
      throw new Error('Unsupported PDF color space')
  }
  const mask = old.dict.lookup(name('SMask'))
  if (
    !(mask instanceof PDFRawStream) ||
    mask.dict.lookup(name('BitsPerComponent'), PDFNumber).asNumber() !== 8 ||
    mask.dict.lookup(name('ColorSpace'))?.toString() !== '/DeviceGray' ||
    mask.dict.has(name('Decode')) ||
    mask.dict.has(name('Matte'))
  )
    throw new Error('Unsupported alpha mask')
  if (
    mask.dict.lookup(name('Width'), PDFNumber).asNumber() !== binding.width ||
    mask.dict.lookup(name('Height'), PDFNumber).asNumber() !== binding.height
  )
    throw new Error('Mask dimensions mismatch')
  const alpha = decodePDFRawStream(mask).decode()
  if (alpha.length !== binding.width * binding.height || alpha.some((byte) => byte !== 255))
    throw new Error('Non-opaque or mismatched mask')
  // Embed into a scratch document only to validate JPEG dimensions/components.
  const scratch = await PDFDocument.create()
  const embedded = await scratch.embedJpg(jpegBytes)
  await embedded.embed()
  const fresh = scratch.context.lookup(embedded.ref)
  if (!(fresh instanceof PDFRawStream)) throw new Error('JPEG embedding failed')
  if (fresh.dict.lookup(name('ColorSpace'))?.toString() !== '/DeviceRGB')
    throw new Error('Only RGB JPEG supported')
  if (embedded.width !== binding.width || embedded.height !== binding.height)
    throw new Error('Density must stay identical in this experiment')
  const dictionary = old.dict.clone(doc.context)
  doc.context.assign(ref, PDFRawStream.of(dictionary, new Uint8Array(jpegBytes)))
  return doc.save({ useObjectStreams: true })
}
