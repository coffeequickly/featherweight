// 옵션 탭 — 프리셋도 목표 용량도 정하지 않는 나머지.
//
// 셋뿐인 게 좋은 신호다. 화면이 비어 보여도 억지로 채우지 않는다 — 채우면 다시
// 설정 잡동사니가 된다.
//
// "모든 텍스트를 아웃라인으로" 는 제품의 핵심 기능을 끄는 것이라 나머지 둘과 무게가
// 다르다. 상자에 따로 두고, 켜지면 다른 탭에 미치는 영향을 그 자리에서 말한다.
//
// 톱니를 없앴으므로 설정 초기화가 여기로 왔다.

import { Button, Checkbox, Muted, Text, VerticalSpace } from '@create-figma-plugin/ui'
import { Fragment, JSX } from 'preact'

import { t } from '../lib/i18n'
import { Settings } from '../lib/types'
import { Says } from './panelParts'
import { Section } from './Section'

type Props = {
  settings: Settings
  disabled: boolean
  onChange: (next: Settings) => void
  onReset: () => void
  /** 문의할 때 물어보는 정보 — 초기화 옆에 흐리게 */
  version: string
}

export function OptionsPanel({
  settings,
  disabled,
  onChange,
  onReset,
  version
}: Props): JSX.Element {
  const outlineAll = !settings.embedText

  return (
    <Fragment>
      <Section title={t('settings.sectionText')}>
        {/* 아웃라인으로 내보내면 링크를 얹을 글자가 없다 */}
        <Checkbox
          disabled={disabled || outlineAll}
          onValueChange={(value: boolean) => onChange({ ...settings, keepLinks: value })}
          value={settings.keepLinks}
        >
          <Text>{t('settings.keepLinks')}</Text>
        </Checkbox>
        <Says text={t('settings.keepLinksSays')} />
        <VerticalSpace space="small" />
        <Checkbox
          disabled={disabled || outlineAll}
          onValueChange={(value: boolean) => onChange({ ...settings, glyphFallback: value })}
          value={settings.glyphFallback}
        >
          <Text>{t('settings.glyphFallback')}</Text>
        </Checkbox>
        <Says text={t('settings.glyphFallbackSays')} />
      </Section>

      <Section title={t('settings.sectionImages')}>
        {/* 기본 켬. 규칙이 보수적이라 끌 이유가 드물지만 첫 배포의 도망갈 길로 둔다 (docs/IMAGE-CROP.md) */}
        <Checkbox
          disabled={disabled}
          onValueChange={(value: boolean) => onChange({ ...settings, cropToVisible: value })}
          value={settings.cropToVisible}
        >
          <Text>{t('settings.cropToVisible')}</Text>
        </Checkbox>
        <Says text={t('settings.cropToVisibleSays')} />
      </Section>

      <Section title={t('settings.sectionCareful')}>
        <div class={`dangerBox${outlineAll ? ' dangerBoxOn' : ''}`}>
          {/* 폰트를 PDF에 포함하는 건 기본 기능이다 — 여기 옵션은 그 반대를 켜는 쪽이다 */}
          <Checkbox
            disabled={disabled}
            onValueChange={(value: boolean) => onChange({ ...settings, embedText: !value })}
            value={outlineAll}
          >
            <Text>{t('settings.outlineAll')}</Text>
          </Checkbox>
          <Says text={t('settings.outlineAllSays')} />
          {outlineAll ? (
            <div class="dangerEffect">
              <Text>{t('settings.outlineAllEffect')}</Text>
            </div>
          ) : null}
        </div>
      </Section>

      <div class="optionsTail">
        <Button disabled={disabled} onClick={onReset} secondary>
          {t('settings.reset')}
        </Button>
        <div class="optionsVersion">
          <Text>
            <Muted>Featherweight v{version}</Muted>
          </Text>
        </div>
      </div>
    </Fragment>
  )
}
