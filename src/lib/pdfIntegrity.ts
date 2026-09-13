import { PdfPart } from './types'

/**
 * Figma can occasionally finish exportAsync before newly-created image fills are renderable.
 * The PDF is structurally valid in that case, but every processed image is absent. Treating its
 * tiny byte size as a successful fit would save a blank document.
 */
export function processedImagesArePresent(
  parts: readonly PdfPart[],
  pdfImageCount: number
): boolean {
  const processed = parts.some((part) => part.stats.imagesProcessed.length > 0)
  return !processed || pdfImageCount > 0
}
