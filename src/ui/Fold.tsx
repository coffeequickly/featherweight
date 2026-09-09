// 접었다 펴는 섹션. 머리글은 요약만 말하고, 궁금하면 펼쳐 본다.
//
// 결과 탭처럼 "대개는 숫자만 확인하고 지나가지만 가끔은 하나하나 봐야 하는" 자리에 쓴다.
// 문제가 있으면 기본으로 펼친다 — 손댈 것이 접혀 있으면 못 보고 지나간다.

import { IconChevronDown16, IconChevronRight16, Text } from '@create-figma-plugin/ui'
import { ComponentChildren, JSX } from 'preact'
import { useState } from 'preact/hooks'

export function Fold({
  title,
  summary,
  defaultOpen = false,
  children
}: {
  title: string
  /** 접혀 있을 때도 보이는 한 마디 — 이것만 읽고 지나갈 수 있어야 한다 */
  summary: ComponentChildren
  defaultOpen?: boolean
  children: ComponentChildren
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div class="fold">
      <button type="button" aria-expanded={open} class="foldHead" onClick={() => setOpen(!open)}>
        <span class="foldCaret">{open ? <IconChevronDown16 /> : <IconChevronRight16 />}</span>
        <span class="foldTitle">
          <Text>{title}</Text>
        </span>
        <span class="foldSummary">{summary}</span>
      </button>
      {open ? <div class="foldBody">{children}</div> : null}
    </div>
  )
}
