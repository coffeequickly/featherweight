import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
const [input, output] = process.argv.slice(2)
if (!input || !output) throw new Error('Usage: node unpack.mjs capture.json output-directory')
const capture = JSON.parse(await readFile(input, 'utf8'))
await mkdir(output, { recursive: true })
for (const [name, data] of Object.entries(capture.files)) {
  if (!/^(source\.bin|q\d+\.jpg|browser-q\d+\.pdf|reference\.pdf|baseline\.pdf)$/.test(name))
    throw new Error('Unexpected capture filename')
  await writeFile(join(output, name), Buffer.from(data, 'base64'))
}
const metadata = { metadata: capture.metadata, encoding: capture.encoding }
await writeFile(join(output, 'capture-metadata.json'), JSON.stringify(metadata, null, 2))
