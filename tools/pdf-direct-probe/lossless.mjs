// Offline feasibility probe only. Native jpegtran cannot run in a Figma plugin.
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
const [input, output] = process.argv.slice(2)
if (!input || !output) throw new Error('Usage: node lossless.mjs input.pdf output.pdf')
if (!output.endsWith('.pdf') || resolve(input) === resolve(output))
  throw new Error('Use a distinct .pdf output path')
const directory = await mkdtemp(join(tmpdir(), 'fw-lossless-'))
const start = performance.now()
try {
  const bytes = await readFile(input)
  const document = await PDFDocument.load(bytes, { updateMetadata: false })
  const control = await document.save({ useObjectStreams: true })
  await writeFile(output.replace(/\.pdf$/, '-control.pdf'), control)
  const records = []
  for (const [ref, object] of document.context.enumerateIndirectObjects()) {
    if (
      !(object instanceof PDFRawStream) ||
      object.dict.get(PDFName.of('Subtype'))?.toString() !== '/Image'
    )
      continue
    const filter = object.dict.lookup(PDFName.of('Filter'))?.toString().replace(/\s/g, '')
    if (filter !== '/DCTDecode' && filter !== '[/DCTDecode]') continue
    const source = join(directory, `${ref.objectNumber}-in.jpg`)
    const target = join(directory, `${ref.objectNumber}-out.jpg`)
    await writeFile(source, object.contents)
    const transformStart = performance.now()
    try {
      execFileSync(
        process.env.JPEGTRAN_BIN || '/opt/homebrew/bin/jpegtran',
        ['-strict', '-copy', 'all', '-progressive', '-outfile', target, source],
        { timeout: 30000, stdio: 'pipe' }
      )
      const fresh = await readFile(target)
      const adopted = fresh.length < object.contents.length
      records.push({
        object: ref.objectNumber,
        before: object.contents.length,
        after: fresh.length,
        adopted,
        ms: performance.now() - transformStart
      })
      if (adopted)
        document.context.assign(ref, PDFRawStream.of(object.dict.clone(document.context), fresh))
    } catch (error) {
      records.push({ object: ref.objectNumber, skipped: String(error) })
    }
  }
  const result = await document.save({ useObjectStreams: true })
  await writeFile(output, result)
  const report = {
    inputBytes: bytes.length,
    controlBytes: control.length,
    outputBytes: result.length,
    totalMs: performance.now() - start,
    records
  }
  await writeFile(output.replace(/\.pdf$/, '.json'), JSON.stringify(report, null, 2))
  console.log(
    JSON.stringify({
      ...report,
      records: records.length,
      adopted: records.filter((r) => r.adopted).length
    })
  )
} finally {
  await rm(directory, { recursive: true, force: true })
}
