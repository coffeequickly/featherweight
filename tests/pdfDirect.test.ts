import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument, PDFName, PDFNumber, PDFRawStream, decodePDFRawStream } from 'pdf-lib'

const mocks = vi.hoisted(() => ({ selections: vi.fn(), jpeg: vi.fn() }))
vi.mock('../src/ui/imageCache', () => ({
  directImageSelections: mocks.selections,
  rememberOwnSize: vi.fn()
}))
vi.mock('../src/ui/resize', () => ({ figmaJpegOf: mocks.jpeg }))

import { PROFILE_LADDER } from '../src/lib/fitToSize'
import { PdfPart } from '../src/lib/types'
import {
  DirectImageMapping,
  isKnownSrgbIcc,
  patchFitParts,
  patchPdfPartDirect,
  signatureDistance
} from '../src/ui/pdfDirect'

const decode = (value: string): Uint8Array =>
  Uint8Array.from(atob(value), (character) => character.charCodeAt(0))

const oldJpeg = decode(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAgABgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDg6KKK+XP2gKKKKACiiigAooooA//Z'
)
const newJpeg = decode(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAQAAwDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDyuiiiv14+aP/Z'
)

const source = (key: string, bytes: Uint8Array, width: number, height: number) => ({
  key,
  bytes,
  mime: 'image/jpeg' as const,
  width,
  height
})

const mapping: DirectImageMapping = {
  from: source('old', oldJpeg, 24, 32),
  to: source('new', newJpeg, 12, 16)
}

async function fixture(alpha = 255, maskWidth = 24, icc?: Uint8Array): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  const page = document.addPage([100, 100])
  const image = await document.embedJpg(oldJpeg)
  await image.embed()
  const raw = document.context.lookup(image.ref)
  if (!(raw instanceof PDFRawStream)) throw new Error('fixture image')
  if (icc !== undefined) {
    const profile = document.context.register(document.context.flateStream(icc, { N: 3 }))
    raw.dict.set(PDFName.of('ColorSpace'), document.context.obj(['ICCBased', profile]))
  }
  const mask = document.context.flateStream(new Uint8Array(24 * 32).fill(alpha), {
    Type: 'XObject',
    Subtype: 'Image',
    Width: maskWidth,
    Height: 32,
    BitsPerComponent: 8,
    ColorSpace: 'DeviceGray'
  })
  raw.dict.set(PDFName.of('SMask'), document.context.register(mask))
  page.drawImage(image, { x: 0, y: 0, width: 100, height: 100 })
  return await document.save({ useObjectStreams: true })
}

beforeEach(() => {
  mocks.selections.mockReset()
  mocks.jpeg.mockReset().mockImplementation(async (bytes: Uint8Array) => bytes)
})

function images(document: PDFDocument): PDFRawStream[] {
  const out: PDFRawStream[] = []
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    if (
      object instanceof PDFRawStream &&
      object.dict.get(PDFName.of('Subtype'))?.toString() === '/Image'
    ) {
      out.push(object)
    }
  }
  return out
}

describe('fit PDF direct image replacement', () => {
  it('replaces only the matched opaque JPEG and keeps the placement stream', async () => {
    const before = await fixture()
    const input = await PDFDocument.load(before, { updateMetadata: false })
    const oldContents = input.getPage(0).node.Contents()?.toString()
    const patched = await patchPdfPartDirect(
      before,
      [mapping],
      async () => new Uint8Array([1, 2, 3])
    )
    expect(patched.matched).toBe(1)
    expect(patched.skipped).toBe(0)
    const result = await PDFDocument.load(patched.bytes, { updateMetadata: false })
    const image = images(result).find(
      (candidate) => candidate.dict.get(PDFName.of('ColorSpace'))?.toString() !== '/DeviceGray'
    )
    expect(image).toBeDefined()
    expect(image?.contents).toEqual(newJpeg)
    expect(image?.dict.lookup(PDFName.of('Width'), PDFNumber).asNumber()).toBe(12)
    expect(image?.dict.lookup(PDFName.of('Height'), PDFNumber).asNumber()).toBe(16)
    expect(result.getPage(0).node.Contents()?.toString()).toBe(oldContents)
    const mask = image?.dict.lookup(PDFName.of('SMask'))
    expect(mask).toBeInstanceOf(PDFRawStream)
    expect(
      decodePDFRawStream(mask as PDFRawStream)
        .decode()
        .every((value) => value === 255)
    ).toBe(true)
  })

  it('rejects a non-opaque alpha mask', async () => {
    await expect(
      patchPdfPartDirect(await fixture(128), [mapping], async () => new Uint8Array([1]))
    ).rejects.toThrow('non-opaque')
  })

  it('rejects an alpha mask whose geometry does not match the source', async () => {
    await expect(
      patchPdfPartDirect(await fixture(255, 12), [mapping], async () => new Uint8Array([1]))
    ).rejects.toThrow('alpha mask dimensions differ')
  })

  it('rejects an unverified three-channel ICC profile instead of assuming sRGB', async () => {
    await expect(
      patchPdfPartDirect(
        await fixture(255, 24, new TextEncoder().encode('Display P3')),
        [mapping],
        async () => new Uint8Array([1])
      )
    ).rejects.toThrow('unverified RGB color profile')
    expect(isKnownSrgbIcc(new Uint8Array(3024))).toBe(false)
  })

  it('rejects replacement bytes that are not a JPEG', async () => {
    const invalid: DirectImageMapping = {
      ...mapping,
      to: source('invalid', new Uint8Array([1, 2, 3, 4]), 12, 16)
    }
    await expect(
      patchPdfPartDirect(await fixture(), [invalid], async () => new Uint8Array([1]))
    ).rejects.toThrow('invalid replacement JPEG')
  })

  it('keeps an unmatched baseline image instead of guessing', async () => {
    const before = await fixture()
    let calls = 0
    const patched = await patchPdfPartDirect(before, [mapping], async () => {
      calls += 1
      return new Uint8Array([calls === 1 ? 0 : 100])
    })
    expect(patched.bytes).toBe(before)
    expect(patched.matched).toBe(0)
    expect(patched.skipped).toBe(1)
  })

  it('rejects an ambiguous fingerprint when targets differ', async () => {
    const other: DirectImageMapping = {
      from: source('other-old', oldJpeg, 24, 32),
      to: source('other-new', oldJpeg, 24, 32)
    }
    await expect(
      patchPdfPartDirect(await fixture(), [mapping, other], async () => new Uint8Array([9]))
    ).rejects.toThrow('ambiguous')
  })

  it('measures normalized RGB signature distance', () => {
    expect(signatureDistance(new Uint8Array([1, 5, 9]), new Uint8Array([2, 7, 12]))).toBe(2)
    expect(signatureDistance(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(Infinity)
  })
})

describe('fit PDF direct plan completeness', () => {
  const selection = (imageHash: string, image: DirectImageMapping['from'], slot = 'whole') => ({
    imageHash,
    images: [{ slot, source: image }]
  })
  const run = async () => {
    const part: PdfPart = {
      index: 0,
      name: 'fixture',
      bytes: await fixture(),
      text: [],
      stats: {} as PdfPart['stats']
    }
    return await patchFitParts(
      [part],
      [{ index: 0, baseline: [], target: [] }],
      PROFILE_LADDER[3],
      PROFILE_LADDER[2],
      async () => new Uint8Array([1, 2, 3])
    )
  }

  it('marks a fully matched candidate complete', async () => {
    mocks.selections
      .mockReturnValueOnce([selection('photo', mapping.from)])
      .mockReturnValueOnce([selection('photo', mapping.to)])
    expect(await run()).toMatchObject({ matched: 1, skipped: 0, complete: true })
  })

  it('marks changed transparent PNGs incomplete while preserving their baseline', async () => {
    mocks.selections
      .mockReturnValueOnce([
        selection('photo', mapping.from),
        selection('alpha', { ...mapping.from, key: 'alpha-old', mime: 'image/png' })
      ])
      .mockReturnValueOnce([
        selection('photo', mapping.to),
        selection('alpha', { ...mapping.to, key: 'alpha-new', mime: 'image/png' })
      ])
    expect(await run()).toMatchObject({ matched: 1, skipped: 0, complete: false })
    expect(mocks.jpeg).toHaveBeenCalledTimes(1)
  })

  it('marks changed whole/crop slots incomplete instead of silently treating them as reproduced', async () => {
    mocks.selections
      .mockReturnValueOnce([
        selection('photo', mapping.from),
        selection('crop', { ...mapping.from, key: 'crop-old' })
      ])
      .mockReturnValueOnce([
        selection('photo', mapping.to),
        selection('crop', { ...mapping.to, key: 'crop-new' }, '0,0,12,16')
      ])
    expect(await run()).toMatchObject({ matched: 1, complete: false })
  })

  it('marks an unmatched independent image incomplete', async () => {
    mocks.selections
      .mockReturnValueOnce([
        selection('photo', mapping.from),
        selection('absent', { ...mapping.to, key: 'absent-old' })
      ])
      .mockReturnValueOnce([
        selection('photo', mapping.to),
        selection('absent', { ...mapping.from, key: 'absent-new' })
      ])
    expect(await run()).toMatchObject({ matched: 1, skipped: 1, complete: false })
  })
})
