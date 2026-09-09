// 설정 탭들이 함께 쓰는 두 조각. 이미지·옵션이 갈라지면서 한쪽에만 두면 순환 참조가 된다.

import { Muted, Text } from '@create-figma-plugin/ui'
import { ComponentChildren, JSX } from 'preact'

/** 라벨 위, 컨트롤 아래. 라벨 앞 아이콘은 시작 탭의 값 줄과 같은 것이다. */
export function Field({
  label,
  glyph,
  children
}: {
  label: string
  glyph?: JSX.Element
  children: ComponentChildren
}): JSX.Element {
  return (
    <div class="field">
      <div class="fieldLabel">
        <Text>
          <Muted>
            <span class="labelGlyph">
              {glyph}
              {label}
            </span>
          </Muted>
        </Text>
      </div>
      {children}
    </div>
  )
}

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
