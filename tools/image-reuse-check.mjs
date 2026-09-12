// Optional browser verification; no production dependency on Playwright.
// PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs CHROME_PATH=/path/to/chrome \
// node tools/image-reuse-check.mjs source.jpg report.json
import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
const [source, report] = process.argv.slice(2)
if (!source || !report)
  throw new Error('Usage: node tools/image-reuse-check.mjs source.jpg report.json')
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const bundle = await build({
  entryPoints: [new URL('image-reuse-check.ts', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'reuseCheck',
  target: 'es2020'
})
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true })
try {
  const page = await browser.newPage()
  await page.setContent('<html><body>Featherweight isolated image reuse check</body></html>')
  await page.addScriptTag({ content: bundle.outputFiles[0].text })
  const photo = await readFile(source)
  // Base64 is data only. Run in an isolated test browser, never the user's profile.
  const result = await page.evaluate(
    `reuseCheck.run(Uint8Array.from(atob(${JSON.stringify(photo.toString('base64'))}), c => c.charCodeAt(0)))`
  )
  await writeFile(report, JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
} finally {
  await browser.close()
}
