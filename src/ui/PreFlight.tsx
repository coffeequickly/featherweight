// 내보내기 전 체크리스트 — 프레임 · 이미지 · 폰트 · 텍스트 네 줄.
//
// 지금까지 탭 넷에 흩어져 있던 사실을 한 카드에 모은다. 문제가 없으면 초록 체크에
// 한 줄, 문제가 있으면 주황 경고와 바로 갈 곳. 사용자는 이 카드만 읽고 누르면 된다.
//
// 결말("아웃라인으로 나간다")은 텍스트 줄 하나만 말한다. 폰트 줄은 원인과 고칠 곳만
// 댄다 — 두 줄이 같은 결말을 말하면 같은 경고가 두 번 뜬 것으로 읽힌다.

import { IconCheck16, IconChevronRight16, IconWarning16, Text } from '@create-figma-plugin/ui'
import { JSX } from 'preact'

import { mbToBytes } from '../lib/fitToSize'
import { summarizeMissing } from '../lib/fontInventory'
import { fontReadiness, uploadedProblems } from '../lib/fontStatus'
import { formatBytes } from '../lib/fontStore'
import { formatReason, t } from '../lib/i18n'
import { forecastImages, groupReasons, outlinedTexts, uniformSize } from '../lib/preflight'
import { EditorKind, FontUsage, FrameItem, Preflight, Settings, StoredFont } from '../lib/types'
import { describeFileProblem } from './fontProblem'
import { unitWords } from './units'

export type SubScreen = 'frames' | 'fonts' | 'text'

type Props = {
  items: FrameItem[]
  visibleCount: number
  excludedCount: number
  reordered: boolean
  preflight: Preflight | null
  fonts: FontUsage[]
  storedFonts: StoredFont[]
  settings: Settings
  editor: EditorKind
  onOpen: (screen: SubScreen) => void
  /** "텍스트 임베딩 꺼짐" 줄의 [켜기] — 설정 화면까지 갈 일이 아니다 */
  onEnableText: () => void
}

type Row = {
  tone: 'ok' | 'warn'
  head: string
  detail: string
  action?: { label: string; onClick: () => void }
}

/** 사유 요약 한 줄 — "폰트 없음 ×3 · 선이 있음 ×2 외 1가지" */
const REASONS_SHOWN = 2

export function PreFlight(props: Props): JSX.Element {
  const rows = [framesRow(props), imagesRow(props), fontsRow(props), textRow(props)]

  return (
    <div class="checklist">
      {rows.map((row, index) => {
        const tone = row.tone === 'warn' ? 'checkWarn' : 'checkOk'
        const link = row.action === undefined ? '' : ' checkLink'
        return (
          // 갈 곳이 있는 줄은 줄 전체가 눌린다 — 오른쪽 끝 글자만 노리게 하지 않는다
          <div key={index} class={`checkRow ${tone}${link}`} onClick={row.action?.onClick}>
            <div class="checkIcon">{row.tone === 'warn' ? <IconWarning16 /> : <IconCheck16 />}</div>
            <div class="checkBody">
              <div class="checkHead ellipsis">
                <Text>{row.head}</Text>
              </div>
              {/* Text 컴포넌트 없이 그린다 — 두 줄 클램프를 그 안쪽 상자에 걸면 첫 줄 윗부분이 잘린다 */}
              {row.detail === '' ? null : <div class="checkDetail">{row.detail}</div>}
            </div>
            {row.action === undefined ? null : (
              <span class="checkAction">
                <Text>{row.action.label}</Text>
                <IconChevronRight16 />
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function framesRow({ items, visibleCount, excludedCount, reordered, editor, onOpen }: Props): Row {
  const size = uniformSize(items)
  const details: string[] = []
  if (reordered) details.push(t('preflight.framesReordered'))
  if (excludedCount > 0) details.push(t('preflight.framesExcluded', { count: excludedCount }))
  const asIs = t(editor === 'slides' ? 'preflight.slidesAsIs' : 'preflight.framesAsIs')

  return {
    tone: 'ok',
    head: t('preflight.frames', {
      count: visibleCount,
      size: size === null ? t('preflight.framesMixed') : `${size.width}×${size.height}`,
      ...unitWords(editor)
    }),
    detail: details.length === 0 ? asIs : details.join(' · '),
    action:
      items.length < 2 ? undefined : { label: t('screen.frames'), onClick: () => onOpen('frames') }
  }
}

function imagesRow({ items, preflight, settings }: Props): Row {
  // 재료가 오기 전에는 아직 모른다 — 0 이라고 말하면 거짓말이다
  if (preflight === null) {
    return { tone: 'ok', head: t('preflight.scanning'), detail: t('preflight.checking') }
  }
  const roughTotal = items.reduce((sum, item) => sum + item.imageCount, 0)
  if (roughTotal === 0) {
    return { tone: 'ok', head: t('preflight.imagesNone'), detail: t('preflight.imagesNoneDetail') }
  }

  const forecast = forecastImages(preflight, settings)
  // 크기를 아직 읽는 중이면 "줄임 예정 0장" 은 거짓말이다 — 몇 장 읽었는지만
  if (preflight.sizing === true && forecast.unsized > 0) {
    return {
      tone: 'ok',
      head: t('preflight.images', { count: forecast.total }),
      detail: t('preflight.imagesSizing', {
        done: forecast.total - forecast.unsized,
        total: forecast.total
      })
    }
  }
  const tiny =
    forecast.tiny > 0
      ? t('preflight.imagesKeptTiny', { count: forecast.tiny, minEdge: settings.minEdge })
      : ''

  if (settings.fitToSize) {
    return {
      tone: 'ok',
      head: t('preflight.images', { count: forecast.total }),
      detail:
        tiny === ''
          ? t('preflight.imagesFitDetail', { target: formatBytes(mbToBytes(settings.fitTargetMb)) })
          : tiny
    }
  }

  if (forecast.shrink === 0) {
    return {
      tone: 'ok',
      head: t('preflight.imagesAllKept', { total: forecast.total }),
      detail: tiny === '' ? t('preflight.imagesWithinBudget') : tiny
    }
  }

  return {
    tone: 'ok',
    head: t('preflight.imagesShrink', { total: forecast.total, shrink: forecast.shrink }),
    detail:
      tiny === ''
        ? t('preflight.imagesRule', { multiplier: settings.multiplier, maxEdge: settings.maxEdge })
        : tiny
  }
}

function fontsRow({ preflight, fonts, storedFonts, editor, onOpen }: Props): Row {
  if (preflight === null) {
    return { tone: 'ok', head: t('preflight.scanning'), detail: t('preflight.checking') }
  }
  const readiness = fontReadiness(fonts, storedFonts)
  if (readiness.total === 0) {
    return {
      tone: 'ok',
      head: t('preflight.fontsNone'),
      detail: t('preflight.noTextDetail', unitWords(editor))
    }
  }

  const open = { label: t('screen.fonts'), onClick: () => onOpen('fonts') }

  if (readiness.missing.length > 0) {
    const summary = summarizeMissing(
      readiness.missing.map((font) => `${font.family} ${font.style}`)
    )
    return {
      tone: 'warn',
      head: t('preflight.fontsMissing', {
        missing: readiness.missing.length,
        texts: readiness.missingTexts
      }),
      detail: t('preflight.fontsMissingDetail', {
        first: summary.first,
        more: summary.rest,
        auto: readiness.total - readiness.missing.length
      }),
      action: { ...open, label: t('preflight.fontsAction') }
    }
  }

  // 파일은 있는데 자리에 맞지 않는 것 — "준비됨" 이라고 하면 굵기가 틀린 채 나간다
  const problems = uploadedProblems(fonts, storedFonts)
  if (problems.length > 0) {
    const [first] = problems
    return {
      tone: 'warn',
      head: t('preflight.fontsFileProblem', { count: problems.length }),
      detail:
        `${first.font.family} ${first.font.style} · ${describeFileProblem(first.font) ?? ''}` +
        (problems.length > 1
          ? t('preflight.fontsFileProblemMore', { count: problems.length - 1 })
          : ''),
      action: open
    }
  }

  const names = readiness.families.slice(0, 2).join(' · ')
  return {
    tone: 'ok',
    head: t('preflight.fontsReady', { count: readiness.total }),
    detail: t(readiness.anyUploaded ? 'preflight.fontsMixed' : 'preflight.fontsAuto', { names }),
    action: open
  }
}

function textRow({
  items,
  preflight,
  fonts,
  storedFonts,
  settings,
  editor,
  onOpen,
  onEnableText
}: Props): Row {
  if (!settings.embedText) {
    return {
      tone: 'warn',
      head: t('preflight.textOff'),
      detail: t('preflight.textOffDetail'),
      action: { label: t('preflight.textOffAction'), onClick: onEnableText }
    }
  }

  if (preflight === null) {
    return { tone: 'ok', head: t('preflight.scanning'), detail: t('preflight.checking') }
  }

  const total = items.reduce((sum, item) => sum + item.textCount, 0)
  if (total === 0) {
    return {
      tone: 'ok',
      head: t('preflight.textNone'),
      detail: t('preflight.noTextDetail', unitWords(editor))
    }
  }

  const outlined = outlinedTexts(preflight.textRejects, fonts, storedFonts)

  if (outlined.length === 0) {
    return {
      tone: 'ok',
      head: t('preflight.textAll', { count: total }),
      detail: t('preflight.textAllDetail')
    }
  }

  // 요약에서는 서체별로 나누지 않는다 — "폰트 없음" 하나로 묶어야 한 줄에 든다
  const groups = groupReasons(
    outlined.map((reject) => ({
      reason:
        reject.reason.code === 'reject.missingFont'
          ? t('reject.missingFontAny')
          : formatReason(reject.reason),
      id: reject.nodeId
    }))
  )
  const shown = groups
    .slice(0, REASONS_SHOWN)
    .map((group) => `${group.reason} ×${group.count}`)
    .join(' · ')
  const more =
    groups.length > REASONS_SHOWN
      ? t('preflight.moreReasons', { count: groups.length - REASONS_SHOWN })
      : ''

  return {
    tone: 'warn',
    head: t('preflight.textSome', { count: outlined.length }),
    detail: shown + more,
    action: { label: t('preflight.textAction'), onClick: () => onOpen('text') }
  }
}
