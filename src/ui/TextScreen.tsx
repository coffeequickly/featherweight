// 아웃라인 처리될 텍스트 — 구조 때문에 진짜 폰트로 못 넣는 것들을 사유별로.
//
// 폰트가 없어 아웃라인이 되는 것은 폰트 화면의 일이다. 여기는 선·효과·그라데이션처럼
// 레이어를 고치면 풀리는 것만 모은다. 사유를 누르면 그 레이어들이 캔버스에서 선택된다.

import { Muted, Text, VerticalSpace } from '@create-figma-plugin/ui'
import { emit } from '@create-figma-plugin/utilities'
import { Fragment, JSX } from 'preact'

import { formatReason, t } from '../lib/i18n'
import { groupReasons } from '../lib/preflight'
import { NodesFocusHandler, TextReject } from '../lib/types'

type Props = {
  rejects: TextReject[]
}

export function TextScreen({ rejects }: Props): JSX.Element {
  if (rejects.length === 0) {
    return (
      <Fragment>
        <VerticalSpace space="small" />
        <Text>
          <Muted>{t('text.none')}</Muted>
        </Text>
      </Fragment>
    )
  }

  const groups = groupReasons(
    rejects.map((reject) => ({ reason: formatReason(reject.reason), id: reject.nodeId }))
  )

  return (
    <Fragment>
      <VerticalSpace space="small" />
      <Text>
        <Muted>{t('text.help')}</Muted>
      </Text>
      <VerticalSpace space="small" />
      <div class="reasonList reasonListTall">
        {groups.map((group) => (
          <div
            key={group.reason}
            class="reasonItem clickable"
            title={t('report.clickHint')}
            onClick={() => emit<NodesFocusHandler>('nodes:focus', group.ids)}
          >
            <Text>
              {group.reason}
              <Muted>{group.count > 1 ? ` × ${group.count}` : ''}</Muted>
            </Text>
          </div>
        ))}
      </div>
    </Fragment>
  )
}
