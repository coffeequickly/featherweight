import { createHash } from 'node:crypto'
import { PDFDocument, PDFRef, PDFRawStream } from 'pdf-lib'
import { readFile, writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { replaceBoundJpeg } from '../../build/pdf-direct-probe/replace.mjs'
{
  const [pdf, jpeg, bindingPath, output] = process.argv.slice(2)
  const binding = JSON.parse(await readFile(bindingPath, 'utf8'))
  const pdfBytes = await readFile(pdf)
  const document = await PDFDocument.load(pdfBytes)
  const image = document.context.lookup(PDFRef.of(binding.objectNumber))
  if (!(image instanceof PDFRawStream)) throw new Error('Not a bound image')
  const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
  if (sha(pdfBytes) !== binding.pdfSha256 || sha(image.contents) !== binding.imageSha256)
    throw new Error('Capture hash mismatch')
  const runtimeBinding = { ...binding, pdfBytes, imageBytes: image.contents }
  const start = performance.now()
  const bytes = await replaceBoundJpeg(pdfBytes, await readFile(jpeg), runtimeBinding)
  await writeFile(output, bytes)
  console.log(JSON.stringify({ output, bytes: bytes.length, ms: performance.now() - start }))
}
