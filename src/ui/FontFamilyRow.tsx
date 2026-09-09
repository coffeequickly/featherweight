// 폰트 목록의 한 줄 — 서체 이름 + 상태 한 마디, 그 아래 스타일 뱃지.
//
// 줄에 아이콘을 두지 않는다. 손보는 일은 전부 상세 페이지 안에서 하고, 여기서는 줄 전체가
// 그리로 가는 문이다. 아이콘 서넛이 줄마다 붙어 있으면 목록이 시끄러워 상태가 안 읽힌다.
//
// 뱃지는 문제 있는 것이 앞이고, 폭이 모자라면 정상인 것부터 접는다 — 문제 뱃지는 접지 않는다.

import { IconChevronRight16, IconWarning16, Muted, Text } from '@create-figma-plugin/ui'
import { JSX } from 'preact'

import { FontFamilyRow as Row, visibleStyles } from '../lib/fontFamilies'
import { formatBytes } from '../lib/fontStore'
import { t } from '../lib/i18n'

/** 한 줄에 늘어놓을 뱃지 수. 440px 에서 대략 이 정도가 한 줄에 든다 */
const BADGES_SHOWN = 5

export function FontFamilyRow({ row, onOpen }: { row: Row; onOpen: () => void }): JSX.Element {
  const { shown, rest } = visibleStyles(row, BADGES_SHOWN)

  return (
    <button type="button" class="famRow" onClick={onOpen}>
      <div class="famBody">
        <div class="famHead">
          <span class="famName ellipsis">
            <Text>{row.family}</Text>
          </span>
          <span class={`famMeta${row.problems > 0 ? ' famMetaWarn' : ''}`}>
            <Text>{summary(row)}</Text>
          </span>
        </div>
        <div class="famBadges">
          {shown.map((style) => (
            <span key={style.usage.style} class={`famBadge${style.problem ? ' famBadgeWarn' : ''}`}>
              {style.problem ? <IconWarning16 /> : null}
              {style.usage.style}
            </span>
          ))}
          {rest === 0 ? null : (
            <span class="famBadgeRest">
              <Text>
                <Muted>{t('fonts.stylesMore', { count: rest })}</Muted>
              </Text>
            </span>
          )}
        </div>
      </div>
      <span class="famChevron">
        <IconChevronRight16 />
      </span>
    </button>
  )
}

/**
 * 오른쪽 한 마디. 손볼 것이 있으면 그것부터 — "3종 저장됨" 이라고 말해 놓고 그중 하나가
 * 아웃라인으로 나가면 그 줄은 거짓말이 된다.
 */
function summary(row: Row): string {
  if (row.problems > 0) return t('fonts.familyMissing', { count: row.problems })
  if (row.allCatalog) return t('fonts.familyCatalog')
  if (row.storedBytes > 0) return t('fonts.familyStored', { size: formatBytes(row.storedBytes) })
  return t('fonts.familyMixed')
}
