// 설정 탭들이 함께 쓰는 두 조각. 이미지·옵션이 갈라지면서 한쪽에만 두면 순환 참조가 된다.

import { Muted, Text } from '@create-figma-plugin/ui'
import { JSX } from 'preact'

/** 그 섹션의 지금 값이 무슨 뜻인지 한 줄로 */
export function Says({ text }: { text: string }): JSX.Element {
  return (
    <div class="sectionSays">
      <Text>
        <Muted>{text}</Muted>
      </Text>
    </div>
  )
}
