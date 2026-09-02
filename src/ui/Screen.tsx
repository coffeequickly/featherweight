// 화면 맨 위 한 줄. 메인은 이름과 버전, 하위 화면은 "‹ 제목" 과 오른쪽 행동 하나.
//
// 하위 화면은 전부 이 헤더로 드나든다 — 이동 규칙이 하나뿐이라 배울 게 없다.

import { IconButton, IconNavigateBack24, Muted, Text } from '@create-figma-plugin/ui'
import { JSX } from 'preact'

import { t } from '../lib/i18n'

type Props = {
  title: string
  /** 메인 화면에서만 — 오른쪽 끝에 흐리게 */
  version?: string
  onBack?: () => void
  /** 오른쪽 끝의 텍스트 행동 (예: 기본값으로) */
  action?: { label: string; onClick: () => void; disabled?: boolean }
}

export function ScreenHeader({ title, version, onBack, action }: Props): JSX.Element {
  return (
    <div class="appHeader">
      {onBack === undefined ? null : (
        <div class="headerBack">
          <IconButton onClick={onBack} title={t('screen.back')}>
            <IconNavigateBack24 />
          </IconButton>
        </div>
      )}
      <div class="headerTitle ellipsis">
        <Text>{title}</Text>
      </div>
      {version === undefined ? null : (
        <Text>
          <Muted>v{version}</Muted>
        </Text>
      )}
      {action === undefined ? null : (
        <span
          class={`headerAction${action.disabled === true ? ' headerActionDisabled' : ''}`}
          onClick={action.disabled === true ? undefined : action.onClick}
        >
          <Text>{action.label}</Text>
        </span>
      )}
    </div>
  )
}
