// 제목 + 구분선으로 나뉜 한 덩어리. 고급 설정과 폰트 화면이 같은 것을 쓴다 —
// 두 화면이 다르게 나뉘어 보이면 같은 플러그인 같지 않다.

import { Text } from '@create-figma-plugin/ui'
import { ComponentChildren, JSX } from 'preact'

export function Section({
  title,
  aside,
  children
}: {
  title: string
  /** 제목 줄 오른쪽 — 사용량처럼 제목과 같은 높이에 붙는 것 */
  aside?: ComponentChildren
  children: ComponentChildren
}): JSX.Element {
  return (
    <div class="section">
      <div class="sectionTitle rowBetween">
        <Text>{title}</Text>
        {aside === undefined ? null : <Text>{aside}</Text>}
      </div>
      {children}
    </div>
  )
}
