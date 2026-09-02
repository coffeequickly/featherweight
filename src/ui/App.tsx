import {
  Banner,
  Container,
  Divider,
  IconWarning16,
  useWindowResize,
  VerticalSpace
} from '@create-figma-plugin/ui'
import { emit } from '@create-figma-plugin/utilities'
import { Component, ComponentChildren, JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'

import { suggestFileName } from '../lib/fileName'
import { MessageKey, t } from '../lib/i18n'
import { outlinedTexts } from '../lib/preflight'
import { DEFAULT_SETTINGS, FrameThumbsRequestHandler, ResizeWindowHandler } from '../lib/types'
import { PLUGIN_VERSION } from './buildInfo'
import { ExportFooter } from './ExportFooter'
import { FontPanel } from './FontPanel'
import { FramesScreen } from './FramesScreen'
import { MainScreen } from './MainScreen'
import { PreviewPanel } from './PreviewPanel'
import { ScreenHeader } from './Screen'
import { SettingsPanel } from './SettingsPanel'
import { TextScreen } from './TextScreen'
import { useExport } from './useExport'
import { useFrameOrder } from './useFrameOrder'
import { useMainState } from './useMainState'

export function App(): JSX.Element {
  return (
    <ErrorBoundary>
      <AppBody />
    </ErrorBoundary>
  )
}

/** 렌더 중 예외가 나면 빈 창 대신 안내를 보여준다. */
class ErrorBoundary extends Component<{ children: ComponentChildren }, { crashed: boolean }> {
  state = { crashed: false }

  componentDidCatch(): void {
    this.setState({ crashed: true })
  }

  render(): ComponentChildren {
    if (this.state.crashed) {
      return (
        <Container space="medium">
          <VerticalSpace space="large" />
          <Banner icon={<IconWarning16 />} variant="warning">
            {t('app.crashed')}
          </Banner>
        </Container>
      )
    }
    return this.props.children
  }
}

/**
 * 메인 한 화면과 하위 화면 다섯. 탭이 아니다 — 하위 화면은 "‹ 뒤로" 로만 드나든다.
 * 내보내기 버튼과 진행·결과는 어느 화면에서든 아래에 붙어 있다.
 */
type Screen = 'main' | 'settings' | 'frames' | 'fonts' | 'text' | 'preview'

const SUB_TITLES: Record<Exclude<Screen, 'main'>, MessageKey> = {
  settings: 'screen.settings',
  frames: 'screen.frames',
  fonts: 'screen.fonts',
  text: 'screen.text',
  preview: 'screen.preview'
}

/** 초기 화면 — ui-preview 캡처 자동화용 훅. Figma 안에서는 전역이 없어 항상 메인. */
function initialScreen(): Screen {
  const preset = (window as { __PREVIEW_SCREEN__?: string }).__PREVIEW_SCREEN__
  return preset !== undefined && preset in SUB_TITLES ? (preset as Screen) : 'main'
}

function AppBody(): JSX.Element {
  const [screen, setScreen] = useState<Screen>(initialScreen)

  const main = useMainState()
  const { items, fonts, storedFonts, settings, preflight, showNotice } = main
  const order = useFrameOrder(items, main.selectionSerial)
  const exporter = useExport(storedFonts, settings.embedText)

  useWindowResize(
    (size: { width: number; height: number }) => emit<ResizeWindowHandler>('resize:window', size),
    { minWidth: 360, minHeight: 400, maxWidth: 720, maxHeight: 1200 }
  )

  // 프레임에 대한 하위 화면은 프레임이 없어지면 갈 곳이 없다 — 메인으로 돌아온다
  useEffect(() => {
    const emptied = main.selectionSerial > 0 && items.length === 0
    if (emptied && (screen === 'frames' || screen === 'text')) setScreen('main')
  }, [main.selectionSerial, items.length, screen])

  const goMain = (): void => setScreen('main')

  // 썸네일은 정렬 화면을 열 때 한 번만 — 선택이 바뀌면 다시
  const thumbsFor = useRef(-1)
  useEffect(() => {
    if (screen !== 'frames' || thumbsFor.current === main.selectionSerial) return
    thumbsFor.current = main.selectionSerial
    emit<FrameThumbsRequestHandler>('frames:thumbs:request')
  }, [screen, main.selectionSerial])

  // 크기 그림에 그릴 장표 — 가장 긴 변을 가진 프레임과 그 짧은 변
  const widest = items.reduce(
    (best, item) => {
      const long = Math.max(item.width, item.height)
      return long > best.long ? { long, short: Math.min(item.width, item.height) } : best
    },
    { long: 0, short: 0 }
  )

  // 결과는 메인 화면의 체크리스트 아래에 뜬다 — 다른 화면에 있었어도 거기로 데려온다
  useEffect(() => {
    if (exporter.report !== null) setScreen('main')
  }, [exporter.report])

  function handleExport(): void {
    exporter.start(
      order.visible.map((item) => item.id),
      settings,
      suggestFileName(
        order.visible.map((item) => item.name),
        main.docName,
        new Date()
      )
    )
  }

  // 세로 3단: 헤더(고정) / 화면(스크롤) / 실행·결과(고정).
  return (
    <div class="appRoot">
      {/* 메인에는 헤더가 없다 — Figma 창 제목줄에 이미 "Featherweight" 가 있어 두 번 읽힌다 */}
      {screen === 'main' ? null : (
        <ScreenHeader
          title={t(SUB_TITLES[screen])}
          onBack={goMain}
          action={
            screen === 'settings'
              ? {
                  label: t('settings.reset'),
                  onClick: () => main.applySettings(DEFAULT_SETTINGS),
                  disabled: exporter.busy
                }
              : undefined
          }
        />
      )}

      <div class="appScroll">
        {screen === 'main' ? (
          <MainScreen
            items={items}
            order={order}
            preflight={preflight}
            fonts={fonts}
            storedFonts={storedFonts}
            settings={settings}
            editor={main.editor}
            disabled={exporter.busy}
            report={exporter.report}
            onChangeSettings={main.applySettings}
            onOpen={setScreen}
            onDismissReport={exporter.dismiss}
          />
        ) : null}

        {screen === 'settings' ? (
          <SettingsPanel
            settings={settings}
            disabled={exporter.busy}
            onChange={main.applySettings}
            frameLongEdge={widest.long}
            frameShortEdge={widest.short}
            version={PLUGIN_VERSION}
            editor={main.editor}
          />
        ) : null}

        {screen === 'frames' ? <FramesScreen order={order} disabled={exporter.busy} /> : null}

        {screen === 'fonts' ? (
          <FontPanel
            fonts={fonts}
            stored={storedFonts}
            disabled={exporter.busy}
            onNotice={showNotice}
          />
        ) : null}

        {screen === 'text' ? (
          <TextScreen rejects={outlinedTexts(preflight?.textRejects ?? [], fonts, storedFonts)} />
        ) : null}

        {screen === 'preview' ? <PreviewPanel lines={exporter.report?.extractable ?? []} /> : null}

        <VerticalSpace space="small" />
      </div>

      <div class="appFooter">
        <Divider />
        <VerticalSpace space="small" />
        <ExportFooter
          exporter={exporter}
          notice={main.notice}
          pageCount={order.visible.length}
          onExport={handleExport}
          onOpenSettings={() => setScreen('settings')}
        />
        <VerticalSpace space="small" />
      </div>
    </div>
  )
}
