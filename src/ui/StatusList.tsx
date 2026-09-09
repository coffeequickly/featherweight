// 시작 탭의 상태 — 문제만 카드, 나머지는 회색 한 줄.
//
// 네 줄짜리 체크리스트를 대신한다. 그 목록은 넷 중 둘이 어떤 경우에도 경고가 되지 못해
// 검사가 아니라 영수증이었고, 폰트와 텍스트가 같은 사고를 두 번 경고했다.
//
// 정상인 줄에는 갈 곳을 달지 않는다. 각 항목으로 가는 문은 탭이 이미 맡고 있어서,
// 여기 또 달면 읽을 것이 넷으로 돌아간다.

import { IconCheck16, IconWarning16, Muted, Text } from '@create-figma-plugin/ui'
import { Fragment, JSX } from 'preact'

import { fontReadiness } from '../lib/fontStatus'
import { formatReason, t } from '../lib/i18n'
import { forecastImages, uniformSize } from '../lib/preflight'
import { StartIssue, startIssues } from '../lib/startStatus'
import { EditorKind, FontUsage, FrameItem, Preflight, Settings, StoredFont } from '../lib/types'
import { unitWords } from './units'

/** 사유 요약에 늘어놓을 가짓수 — "선 있음 ×2 · 효과 있음 ×1 외 1가지" */
const REASONS_SHOWN = 2

export type StatusTarget = 'fonts' | 'options' | 'outline'

type Props = {
  items: FrameItem[]
  preflight: Preflight | null
  fonts: FontUsage[]
  storedFonts: StoredFont[]
  settings: Settings
  editor: EditorKind
  onGo: (target: StatusTarget) => void
}

export function StatusList(props: Props): JSX.Element {
  const issues = startIssues(props.settings, props.fonts, props.storedFonts, props.preflight)

  return (
    <Fragment>
      {/* 제목은 문제가 있을 때만 — 멀쩡한 문서 위에 "확인이 필요합니다" 는 거짓말이다 */}
      {issues.length === 0 ? null : (
        <Text>
          <Muted>{t('start.sectionStatus')}</Muted>
        </Text>
      )}

      {issues.map((issue, index) => (
        <IssueCard key={index} issue={issue} onGo={props.onGo} />
      ))}

      <div class="statusFine">
        <div class="statusFineIcon">
          <IconCheck16 />
        </div>
        <Text>
          <Muted>{fineLine(props)}</Muted>
        </Text>
      </div>
    </Fragment>
  )
}

function IssueCard({
  issue,
  onGo
}: {
  issue: StartIssue
  onGo: (target: StatusTarget) => void
}): JSX.Element {
  const { head, detail, go, goLabel } = describe(issue)

  const inside = (
    <Fragment>
      <div class="statusCardIcon">
        <IconWarning16 />
      </div>
      <div class="statusCardBody">
        <div class="statusCardHead">
          <Text>{head}</Text>
        </div>
        {detail === null ? null : <div class="statusCardDetail">{detail}</div>}
      </div>
      {go === null ? null : <span class="statusCardGo">{goLabel}</span>}
    </Fragment>
  )

  // 갈 곳이 있으면 진짜 버튼이다 — 클릭 가능한 div 는 Tab 이 건너뛰고 커서도 안 바뀐다
  if (go === null) return <div class="statusCard">{inside}</div>
  return (
    <button type="button" class="statusCard" onClick={() => onGo(go)}>
      {inside}
    </button>
  )
}

function describe(issue: StartIssue): {
  head: string
  detail: string | null
  go: StatusTarget | null
  goLabel: string
} {
  switch (issue.kind) {
    case 'textOff':
      return {
        head: t('start.textOffHead'),
        detail: t('start.textOffDetail'),
        go: 'options',
        goLabel: t('tab.options')
      }

    case 'fontsMissing':
      return {
        head: t('start.fontsHead', { missing: issue.fonts, texts: issue.texts }),
        detail: t('start.fontsDetail', { first: issue.first, rest: issue.rest, auto: issue.auto }),
        go: 'fonts',
        goLabel: t('tab.fonts')
      }

    case 'fontFiles':
      return {
        head: t(issue.mismatch ? 'start.fontFilesHead' : 'start.fontFilesUnusableHead', {
          count: issue.count
        }),
        detail: issue.first,
        go: 'fonts',
        goLabel: t('tab.fonts')
      }

    case 'structural': {
      const shown = issue.reasons
        .slice(0, REASONS_SHOWN)
        .map((row) => `${formatReason(row.reason)} ×${row.count}`)
        .join(' · ')
      const more =
        issue.reasons.length > REASONS_SHOWN
          ? t('preflight.moreReasons', { count: issue.reasons.length - REASONS_SHOWN })
          : ''
      return {
        head: t('start.structuralHead', { count: issue.count }),
        detail: shown + more,
        go: 'outline',
        goLabel: t('start.goOutline')
      }
    }
  }
}

/**
 * 정상인 것들을 한 줄로. 사실만 늘어놓는다 — 앞의 초록 체크가 이미 "여긴 문제 없음" 을
 * 말하므로 "준비됐습니다" 를 글자로 또 붙이면 군더더기다.
 */
function fineLine(props: Props): string {
  const parts: string[] = []
  const words = unitWords(props.editor)

  if (props.items.length > 0) {
    const size = uniformSize(props.items)
    parts.push(
      t('preflight.frames', {
        count: props.items.length,
        size: size === null ? t('preflight.framesMixed') : `${size.width}×${size.height}`,
        ...words
      })
    )
  }

  if (props.preflight !== null) {
    const forecast = forecastImages(props.preflight, props.settings)
    if (forecast.total > 0) {
      parts.push(
        forecast.shrink === 0
          ? t('preflight.imagesAllKept', { total: forecast.total })
          : t('preflight.imagesShrink', { total: forecast.total, shrink: forecast.shrink })
      )
    }
  }

  const readiness = fontReadiness(props.fonts, props.storedFonts)
  const embedded = readiness.total - readiness.missing.length
  if (props.settings.embedText && embedded > 0) {
    parts.push(t('start.fontsIncluded', { count: embedded }))
  }

  return parts.join(' · ')
}
