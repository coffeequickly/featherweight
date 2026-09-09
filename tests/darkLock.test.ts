// 다크 고정의 구멍을 막는다.
//
// styles.css 는 :root 에서 --figma-color-* 를 !important 로 덮어 다크로 고정한다.
// 덮지 않은 토큰은 Figma 가 준 값이 그대로 새어 들어온다 — 경고 카드의 hover 가
// 그랬다. 밝은 노랑 배경에 노란 글자가 얹혀 글자가 안 보였다(실기 제보).
//
// 미리보기는 자기 다크 값을 따로 깔아 두어 이 사고를 재현하지 못한다. 그래서 눈이 아니라
// 이 검사가 잡는다.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../src/ui/styles.css', import.meta.url), 'utf8')

/** 다크 고정이 사는 :root 블록. 앞쪽에 글꼴 변수용 :root 가 따로 있어 그것과 구분한다 */
function darkLockBlock(): string {
  const start = css.lastIndexOf(':root {', css.indexOf('color-scheme: dark'))
  const end = css.indexOf('}', start)
  return css.slice(start, end)
}

describe('다크 고정', () => {
  it('CSS 가 쓰는 --figma-color-* 를 하나도 빠짐없이 덮는다', () => {
    const declared = new Set(
      [...darkLockBlock().matchAll(/(--figma-color-[a-z0-9-]+)\s*:/g)].map((m) => m[1])
    )
    const used = new Set([...css.matchAll(/var\((--figma-color-[a-z0-9-]+)/g)].map((m) => m[1]))
    const missing = [...used].filter((token) => !declared.has(token))
    expect(missing, `다크 고정에서 빠진 토큰: ${missing.join(', ')}`).toEqual([])
  })

  it('덮은 값에는 전부 !important 가 붙는다', () => {
    const lines = darkLockBlock()
      .split('\n')
      .filter((line) => line.includes('--figma-color-'))
    const weak = lines.filter((line) => !line.includes('!important'))
    expect(weak, `!important 가 없는 줄: ${weak.join(' / ')}`).toEqual([])
  })

  it('미리보기의 다크 값이 같은 토큰을 덮는다 — 캡처와 실제가 갈라지면 안 된다', () => {
    const preview = readFileSync(new URL('../tools/ui-preview.mjs', import.meta.url), 'utf8')
    const open = preview.indexOf('`', preview.indexOf('const FIGMA_VARS_DARK'))
    const block = preview.slice(open + 1, preview.indexOf('`', open + 1))
    const inPreview = new Set(
      [...block.matchAll(/(--figma-color-[a-z0-9-]+)\s*:/g)].map((m) => m[1])
    )
    const declared = [...darkLockBlock().matchAll(/(--figma-color-[a-z0-9-]+)\s*:/g)].map(
      (m) => m[1]
    )
    const missing = declared.filter((token) => !inPreview.has(token))
    expect(missing, `미리보기에서 빠진 토큰: ${missing.join(', ')}`).toEqual([])
  })
})
