// 한쪽이 보내는 메시지를 반대쪽이 받는지 본다.
//
// create-figma-plugin 의 emit 은 **항상 반대편으로** 간다. 받는 쪽에 on 이 없으면
// 런타임에 "No event handler with name `x`" 로 죽는다. 타입은 이걸 못 잡는다 —
// EventHandler 인터페이스는 양쪽이 공유하는 이름표일 뿐 배선을 강제하지 않는다.
//
// 실제로 UI 가 emit('notice') 를 하고 있었는데 notice 는 메인→UI 단방향이라
// 메인에 핸들러가 없었다. 폰트 파일을 반려하는 순간 터졌다.

import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function read(patterns: string[]): string {
  return patterns
    .flatMap((pattern) => globSync(pattern))
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n')
}

/** `emit<FooHandler>('name'` / `on<FooHandler>('name'` 에서 name 만 뽑는다 */
function names(source: string, verb: 'emit' | 'on'): Set<string> {
  const found = new Set<string>()
  const pattern = new RegExp(`\\b${verb}<[A-Za-z]+>\\(\\s*'([^']+)'`, 'g')
  for (const match of source.matchAll(pattern)) found.add(match[1])
  return found
}

const ui = read(['src/ui/**/*.ts', 'src/ui/**/*.tsx'])
const main = read(['src/main.ts', 'src/main/**/*.ts'])

describe('메시지 배선', () => {
  it('UI 가 보내는 것을 메인이 받는다', () => {
    const unhandled = [...names(ui, 'emit')].filter((name) => !names(main, 'on').has(name))
    expect(unhandled, `메인에 on 이 없다: ${unhandled.join(', ')}`).toEqual([])
  })

  it('메인이 보내는 것을 UI 가 받는다', () => {
    // 'toast' 는 메인이 스스로 처리한다(figma.notify) — UI 로 가지 않는다
    const selfHandled = new Set(['toast'])
    const unhandled = [...names(main, 'emit')].filter(
      (name) => !names(ui, 'on').has(name) && !selfHandled.has(name)
    )
    expect(unhandled, `UI 에 on 이 없다: ${unhandled.join(', ')}`).toEqual([])
  })

  it('양쪽 다 뭔가는 주고받는다 — 정규식이 헛돌면 이 테스트가 무의미해진다', () => {
    expect(names(ui, 'emit').size).toBeGreaterThan(5)
    expect(names(main, 'on').size).toBeGreaterThan(5)
  })
})
