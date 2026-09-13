import { describe, expect, it } from 'vitest'

import { processedImagesArePresent } from '../src/lib/pdfIntegrity'
import { PdfPart } from '../src/lib/types'

function part(processed: string[]): PdfPart {
  return {
    index: 0,
    name: 'page',
    bytes: new Uint8Array(),
    text: [],
    stats: {
      imagesProcessed: processed,
      imagesCropped: [],
      imagesRecovered: [],
      imageHashes: processed,
      bytesBefore: 0,
      bytesAfter: 0,
      bytesUntouched: 0,
      fallbacks: [],
      imageWarnings: []
    }
  }
}

describe('processedImagesArePresent', () => {
  it('rejects a structurally valid PDF that lost every processed image', () => {
    expect(processedImagesArePresent([part(['photo', 'alpha'])], 0)).toBe(false)
  })

  it('accepts an export once at least one image object is present', () => {
    expect(processedImagesArePresent([part(['photo'])], 1)).toBe(true)
  })

  it('does not reject a vector-only document', () => {
    expect(processedImagesArePresent([part([])], 0)).toBe(true)
  })
})
