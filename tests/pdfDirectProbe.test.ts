import { describe, expect, it } from 'vitest'
import { PDFDocument, PDFName, PDFDict, PDFRawStream, PDFNumber } from 'pdf-lib'
import { replaceBoundJpeg } from '../tools/pdf-direct-probe/replace'
const jpeg = Uint8Array.from(
  atob(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAgABgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD560/TunFdJp+ndOKuafp3Tiul0/TunFEZHZk+Y7alPT9O6cUV2On6d04orVSP0rCZj+7Wpjafp3Tiul0/TunFXNP07pxXS6fp3TiuSMj+esnzHbUp6fp3Tiiuw0/TunFFaqR+k4TMf3a1P//Z'
  ),
  (c) => c.charCodeAt(0)
)
async function fixture(opaque = true, duplicate = false, invalidColor = false) {
  const doc = await PDFDocument.create()
  const page = doc.addPage([100, 100])
  const image = await doc.embedJpg(jpeg)
  await image.embed()
  const raw = doc.context.lookup(image.ref)
  if (!(raw instanceof PDFRawStream)) throw new Error('fixture')
  if (invalidColor) raw.dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceCMYK'))
  const mask = doc.context.flateStream(new Uint8Array(24 * 32).fill(opaque ? 255 : 128), {
    Type: 'XObject',
    Subtype: 'Image',
    Width: 24,
    Height: 32,
    BitsPerComponent: 8,
    ColorSpace: 'DeviceGray'
  })
  raw.dict.set(PDFName.of('SMask'), doc.context.register(mask))
  const resources = doc.context.obj({ X1: image.ref })
  if (duplicate) resources.set(PDFName.of('X2'), image.ref)
  page.node.set(PDFName.of('Resources'), doc.context.obj({ XObject: resources }))
  page.node.set(
    PDFName.of('Contents'),
    doc.context.register(doc.context.stream('q 100 0 0 100 0 0 cm /X1 Do Q'))
  )
  const bytes = await doc.save()
  const binding = {
    pdfBytes: bytes,
    page: 0,
    resource: '/X1',
    objectNumber: image.ref.objectNumber,
    width: 24,
    height: 32,
    imageBytes: raw.contents
  }
  return { bytes, binding }
}
describe('isolated PDF direct replacement spike', () => {
  it('preserves placement, mask and exact JPEG bytes through save', async () => {
    const { bytes, binding } = await fixture()
    const out = await replaceBoundJpeg(bytes, jpeg, binding)
    const doc = await PDFDocument.load(out)
    const resource = doc.getPage(0).node.Resources()!.lookup(PDFName.of('XObject'), PDFDict)
    const image = doc.context.lookup(resource.get(PDFName.of('X1')))
    expect(image).toBeInstanceOf(PDFRawStream)
    if (!(image instanceof PDFRawStream)) return
    expect(image.contents).toEqual(jpeg)
    expect(image.dict.lookup(PDFName.of('Width'), PDFNumber).asNumber()).toBe(24)
    const original = await PDFDocument.load(bytes)
    expect(doc.getPage(0).node.Contents()!.toString()).toEqual(
      original.getPage(0).node.Contents()!.toString()
    )
    const oldImage = original.context.lookup(resource.get(PDFName.of('X1'))) as PDFRawStream
    expect(image.dict.get(PDFName.of('SMask'))!.toString()).toBe(
      oldImage.dict.get(PDFName.of('SMask'))!.toString()
    )
    const content = doc.context.lookup(doc.getPage(0).node.get(PDFName.of('Contents')))
    const oldContent = original.context.lookup(original.getPage(0).node.get(PDFName.of('Contents')))
    expect(content).toBeInstanceOf(PDFRawStream)
    expect(oldContent).toBeInstanceOf(PDFRawStream)
    expect((content as PDFRawStream).contents).toEqual((oldContent as PDFRawStream).contents)
  })
  it('rejects another PDF before changing an image', async () => {
    const { bytes, binding } = await fixture()
    await expect(
      replaceBoundJpeg(bytes, jpeg, { ...binding, pdfBytes: new Uint8Array([0]) })
    ).rejects.toThrow('bound capture')
  })
  it('rejects another resource/ref', async () => {
    const { bytes, binding } = await fixture()
    await expect(replaceBoundJpeg(bytes, jpeg, { ...binding, objectNumber: 999 })).rejects.toThrow(
      'reference mismatch'
    )
  })
  it('rejects an image stream not in the binding', async () => {
    const { bytes, binding } = await fixture()
    await expect(
      replaceBoundJpeg(bytes, jpeg, { ...binding, imageBytes: new Uint8Array([0]) })
    ).rejects.toThrow('stream mismatch')
  })
  it('rejects a changed density binding', async () => {
    const { bytes, binding } = await fixture()
    await expect(
      replaceBoundJpeg(bytes, jpeg, { ...binding, width: 32, height: 24 })
    ).rejects.toThrow('dimensions mismatch')
  })
  it('rejects non-opaque masks', async () => {
    const { bytes, binding } = await fixture(false)
    await expect(replaceBoundJpeg(bytes, jpeg, binding)).rejects.toThrow('Non-opaque')
  })
  it('rejects extra resources instead of choosing by size', async () => {
    const { bytes, binding } = await fixture(true, true)
    await expect(replaceBoundJpeg(bytes, jpeg, binding)).rejects.toThrow('Ambiguous')
  })
  it('rejects a PDF image in a different component space', async () => {
    const { bytes, binding } = await fixture(true, false, true)
    await expect(replaceBoundJpeg(bytes, jpeg, binding)).rejects.toThrow('color space')
  })
  it('rejects invalid replacement JPEG data', async () => {
    const { bytes, binding } = await fixture()
    await expect(replaceBoundJpeg(bytes, new Uint8Array([1, 2, 3]), binding)).rejects.toThrow()
  })
})
