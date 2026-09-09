// 폰트 패밀리 상세 — 스타일마다 카드 하나. 손보는 일은 전부 여기서 한다.
//
// 목록의 좁은 행에는 상태 한 마디밖에 못 넣는다. 여기서는 셋을 다 말한다:
// 이 자리를 얼마나 쓰는지(중요도), 왜 안 되는지(원인), 안 고치면 어떻게 되는지(결과).
// 셋이 모여야 사용자가 "지금 고칠 일인가" 를 판단할 수 있다.
//
// 목록에서 아이콘을 걷어낸 대가로 한 뎁스가 생겼다. 대신 목록은 훑어보는 곳이 되고
// 여기는 손보는 곳이 된다 — 두 일이 한 줄에 섞이지 않는다.

import { Button, Muted, Text, VerticalSpace } from '@create-figma-plugin/ui'
import { emit } from '@create-figma-plugin/utilities'
import { Fragment, JSX } from 'preact'
import { useRef } from 'preact/hooks'

import { catalogEntry } from '../lib/fontCatalog'
import { FamilyStyle, fontFamilies } from '../lib/fontFamilies'
import { formatBytes } from '../lib/fontStore'
import { t } from '../lib/i18n'
import { FontDeleteHandler, FontUsage, StoredFont } from '../lib/types'
import { Notice } from './fontScreen'
import { describeFileProblem } from './fontProblem'
import { uploadFontFile } from './fontUpload'

type Props = {
  family: string
  fonts: FontUsage[]
  stored: StoredFont[]
  disabled: boolean
  onNotice: (notice: Notice) => void
}

export function FontFamilyPage({
  family,
  fonts,
  stored,
  disabled,
  onNotice
}: Props): JSX.Element | null {
  const row = fontFamilies(fonts, stored).find((candidate) => candidate.family === family)
  if (row === undefined) return null

  return (
    <Fragment>
      <VerticalSpace space="small" />
      <Text>
        <Muted>{t('family.header', { count: row.styles.length })}</Muted>
      </Text>
      {row.styles.map((style) => (
        <StyleCard
          key={style.usage.style}
          style={style}
          all={stored}
          disabled={disabled}
          onNotice={onNotice}
        />
      ))}
    </Fragment>
  )
}

function StyleCard({
  style,
  all,
  disabled,
  onNotice
}: {
  style: FamilyStyle
  all: StoredFont[]
  disabled: boolean
  onNotice: (notice: Notice) => void
}): JSX.Element {
  const { usage, availability, problem } = style
  const input = useRef<HTMLInputElement>(null)

  async function pick(event: Event): Promise<void> {
    const target = event.currentTarget as HTMLInputElement
    const file = target.files?.[0]
    // 같은 파일을 다시 고를 수 있어야 한다 — 값을 비우지 않으면 change 가 안 뜬다
    target.value = ''
    if (file === undefined) return
    await uploadFontFile(file, usage, all, onNotice)
  }

  const lines: string[] = [t('family.usedBy', { count: usage.nodeCount })]
  let status: string

  if (availability.kind === 'catalog') {
    const entry = catalogEntry(usage)
    status = t('fonts.detailCatalog')
    lines.push(
      `${usage.family}${entry?.build === undefined ? '' : t('fonts.detailBuild', { build: entry.build })}`
    )
    lines.push(t('family.catalogSource'))
  } else if (availability.kind === 'uploaded') {
    const file = availability.font
    status = t('fonts.detailUploaded', { size: formatBytes(file.byteLength) })
    lines.push(
      `${file.fileName}${
        file.facts?.version === undefined
          ? ''
          : t('fonts.detailVersion', { version: file.facts.version })
      }`
    )
    const trouble = describeFileProblem(file)
    if (trouble !== null) lines.push(trouble)
  } else {
    status = t('fonts.rowNoFile')
    lines.push(t('family.willOutline'))
  }

  return (
    <div class={`styleCard${problem ? ' styleCardWarn' : ''}`}>
      <div class="styleHead">
        <span class="styleName">
          <Text>{usage.style}</Text>
        </span>
        <span class={`styleStatus${problem ? ' styleStatusWarn' : ''}`}>
          <Text>{status}</Text>
        </span>
      </div>

      {lines.map((line, index) => (
        <div key={index} class="styleLine">
          <Text>
            <Muted>{line}</Muted>
          </Text>
        </div>
      ))}

      <div class="styleActions">
        <input
          ref={input}
          type="file"
          accept=".ttf,.otf,.ttc,.otc"
          class="hiddenFile"
          disabled={disabled}
          onChange={(event) => {
            void pick(event)
          }}
        />
        <Button
          disabled={disabled}
          secondary={availability.kind !== 'missing'}
          onClick={() => input.current?.click()}
        >
          {availability.kind === 'missing'
            ? t('family.pickFile')
            : availability.kind === 'uploaded'
              ? t('family.replaceFile')
              : t('family.ownFile')}
        </Button>
        {availability.kind === 'uploaded' ? (
          <Button
            danger
            disabled={disabled}
            secondary
            onClick={() =>
              emit<FontDeleteHandler>('font:delete', {
                family: availability.font.family,
                style: availability.font.style
              })
            }
          >
            {t('family.deleteStored')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
