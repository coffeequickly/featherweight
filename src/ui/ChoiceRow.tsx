// "하나를 고른다" 를 위한 버튼 묶음. 메인의 프리셋 타일과 같은 문법(테두리 · 고르면
// 파란 테두리와 옅은 바탕)이되 키가 낮다 — 숫자 서너 개를 고르는 데 타일은 과하다.
//
// 라이브러리 세그먼트 컨트롤을 안 쓰는 이유: 그 모양은 "보기 전환(탭)" 으로 읽힌다.
// 같은 화면 안에서 고르는 부품이 두 가지 모양이면 사용자는 둘이 다른 일을 한다고 믿는다.

import { JSX } from 'preact'

export type Choice<T extends string | number> = {
  value: T
  label: string
  /** 값 아래 작은 글자 — "FHD 1.1×" 처럼 값의 뜻 */
  tag?: string
}

type Props<T extends string | number> = {
  options: ReadonlyArray<Choice<T>>
  value: T
  disabled?: boolean
  onChange: (value: T) => void
  /** true 면 폭을 채우지 않고 내용만큼 — 정렬 순서처럼 작은 선택 */
  compact?: boolean
  /** 스크린리더용 묶음 이름 */
  label?: string
}

export function ChoiceRow<T extends string | number>({
  options,
  value,
  disabled = false,
  onChange,
  compact = false,
  label
}: Props<T>): JSX.Element {
  return (
    <div
      class={`choiceRow${compact ? ' choiceRowCompact' : ''}`}
      role="radiogroup"
      aria-label={label}
      style={
        compact ? undefined : `grid-template-columns: repeat(${options.length}, minmax(0, 1fr))`
      }
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            class={`choiceBtn${selected ? ' choiceBtnOn' : ''}`}
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            <span class="choiceLabel">{option.label}</span>
            {option.tag === undefined ? null : <span class="choiceTag">{option.tag}</span>}
          </button>
        )
      })}
    </div>
  )
}
