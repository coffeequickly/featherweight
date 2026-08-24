// 개발 중 한 줄로: 자동 빌드 + 로컬 폰트 서버
//
//   npm run dev
//
// 켜두면 코드를 고칠 때마다 build/ 가 갱신되고, Figma 에서 플러그인을 다시 실행하면 반영된다.
// (manifest 를 바꿨을 때만 Figma 에서 다시 import 해야 한다.)

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const ROOT = fileURLToPath(new URL('../', import.meta.url))

const TASKS = [
  {
    label: 'build',
    command: join(ROOT, 'node_modules/.bin/build-figma-plugin'),
    args: ['--typecheck', '--watch']
  },
  { label: 'fonts', command: process.execPath, args: [join(ROOT, 'tools/serve-fonts.mjs')] }
]

const children = TASKS.map(({ label, command, args }) => {
  const child = spawn(command, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })

  const prefix = (stream, chunk) => {
    for (const line of String(chunk).split('\n')) {
      if (line.trim() !== '') stream.write(`[${label}] ${line}\n`)
    }
  }
  child.stdout.on('data', (chunk) => prefix(process.stdout, chunk))
  child.stderr.on('data', (chunk) => prefix(process.stderr, chunk))
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      process.stderr.write(`[${label}] 종료 (code ${code})\n`)
    }
  })

  return child
})

const stop = () => {
  for (const child of children) child.kill('SIGTERM')
  process.exit(0)
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
