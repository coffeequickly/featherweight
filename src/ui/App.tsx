import {
  Banner,
  Button,
  Container,
  Divider,
  IconWarning16,
  Muted,
  SegmentedControl,
  Tabs,
  Text,
  useWindowResize,
  VerticalSpace
} from '@create-figma-plugin/ui'
import { emit } from '@create-figma-plugin/utilities'
import { Component, ComponentChildren, Fragment, JSX } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'

import { suggestFileName } from '../lib/fileName'
import { t } from '../lib/i18n'
import { sortItems } from '../lib/order'
import { mbToBytes } from '../lib/fitToSize'
import { formatBytes } from '../lib/fontStore'
import { imageModeOf } from '../lib/presets'
import { ImageGlyph, TypeGlyph } from './glyphs'
import { FrameFocusHandler, FrameItem, ResizeWindowHandler, SortMode } from '../lib/types'
import { PLUGIN_VERSION } from './buildInfo'
import { ExportFooter } from './ExportFooter'
import { FontPanel, fontsSummaryText, missingFonts } from './FontPanel'
import { FrameList } from './FrameList'
import { ImageSettings } from './ImageSettings'
import { useExport } from './useExport'
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

function AppBody(): JSX.Element {
  // 화면이 들고 있는 것: 탭·정렬·순서·제외. 메인에서 오는 것: useMainState.
  // 초기 탭 — ui-preview 캡처 자동화용 훅. Figma 안에서는 전역이 없어 항상 'export'.
  const [tab, setTab] = useState<'export' | 'images' | 'fonts'>(() => {
    const preset = (window as { __PREVIEW_TAB__?: string }).__PREVIEW_TAB__
    return preset === 'images' || preset === 'fonts' ? preset : 'export'
  })
  const [sortMode, setSortMode] = useState<SortMode>('position')
  const [excluded, setExcluded] = useState<string[]>([])
  const [manualOrder, setManualOrder] = useState<string[]>([])

  const main = useMainState(() => {
    setManualOrder([]) // 선택이 바뀌면 손으로 잡은 순서·제외는 버린다
    setExcluded([])
  })
  const { items, fonts, storedFonts, settings } = main

  const exporter = useExport(storedFonts, settings.embedText)

  useWindowResize(
    (size: { width: number; height: number }) => emit<ResizeWindowHandler>('resize:window', size),
    { minWidth: 360, minHeight: 400, maxWidth: 720, maxHeight: 1200 }
  )

  // 목록 크기에 창 높이를 맞춘다 — 레이어가 적을 때 아래가 텅 비지 않게.
  // 사용자가 손으로 크기를 바꿨으면(자동으로 맞춘 높이와 다르면) 그 뒤로는 건드리지 않는다.
  const autoHeight = useRef<number | null>(null)
  useEffect(() => {
    const manual =
      autoHeight.current !== null && Math.abs(window.innerHeight - autoHeight.current) > 4
    if (manual) return

    const HEADER = 56
    const ROW = 44
    const LIST_PADDING = 24
    const SETTINGS = 140
    const FOOTER = 96
    const rows = Math.max(items.length, 2) // 빈 상태 안내도 두 줄 몫은 차지한다
    const desired = Math.max(
      420,
      Math.min(680, HEADER + rows * ROW + LIST_PADDING + SETTINGS + FOOTER)
    )

    autoHeight.current = desired
    emit<ResizeWindowHandler>('resize:window', { width: window.innerWidth, height: desired })
  }, [items.length])

  // 기본은 정렬 결과, 손으로 옮긴 뒤에는 그 순서를 따른다
  const ordered = useMemo(() => {
    const sorted = sortItems(items, sortMode)
    if (manualOrder.length === 0) return sorted

    const byId = new Map(sorted.map((item) => [item.id, item]))
    const picked = manualOrder
      .map((id) => byId.get(id))
      .filter((item): item is FrameItem => item !== undefined)
    const rest = sorted.filter((item) => !manualOrder.includes(item.id))
    return [...picked, ...rest]
  }, [items, sortMode, manualOrder])

  const visible = ordered.filter((item) => !excluded.includes(item.id))
  const missing = missingFonts(fonts, storedFonts)

  function handleMove(id: string, direction: -1 | 1): void {
    const ids = visible.map((item) => item.id)
    const from = ids.indexOf(id)
    const to = from + direction
    if (from === -1 || to < 0 || to >= ids.length) return
    ;[ids[from], ids[to]] = [ids[to], ids[from]]
    setManualOrder([...ids, ...excluded])
  }

  function handleReorder(id: string, toIndex: number): void {
    const ids = visible.map((item) => item.id)
    const from = ids.indexOf(id)
    if (from === -1 || toIndex === from) return
    ids.splice(from, 1)
    ids.splice(toIndex, 0, id)
    setManualOrder([...ids, ...excluded])
  }

  function handleSort(mode: SortMode): void {
    setSortMode(mode)
    setManualOrder([])
  }

  function handleExport(): void {
    exporter.start(
      visible.map((item) => item.id),
      settings,
      suggestFileName(
        visible.map((item) => item.name),
        main.docName,
        new Date()
      )
    )
  }

  // 세로 3단: 헤더(고정) / 목록·설정(스크롤) / 실행·결과(고정).
  // 프레임이 많아도 내보내기 버튼과 진행 상태는 항상 보인다.
  return (
    <div class="appRoot">
      <div class="appHeader">
        <VerticalSpace space="extraSmall" />
        {/* Tabs 는 바 + 내용이 한 몸이지만, 내용은 스크롤 영역에 우리가 그린다 —
            children 을 비워 바만 쓴다. 자체 하단 보더가 있으므로 Divider 는 안 그린다.
            탭 안쪽 패딩(8+8) 때문에 텍스트가 본문 그리드(16px)에서 밀리는 것을
            음수 마진으로 당겨 맞춘다 — 보더도 창 끝까지 닿는다. */}
        <div class="tabsBar">
          <Tabs
            onValueChange={(value: string) => {
              if (value === t('tab.export')) setTab('export')
              else if (value === t('tab.images')) setTab('images')
              else setTab('fonts')
            }}
            options={[
              { value: t('tab.export'), children: null },
              { value: t('tab.images'), children: null },
              { value: t('tab.fonts'), children: null }
            ]}
            value={t(`tab.${tab}` as const)}
          />
        </div>
      </div>

      <div class="appScroll">
        {tab === 'export' ? (
          <Fragment>
            <VerticalSpace space="small" />

            {items.length === 0 ? null : (
              <Fragment>
                <div class="rowBetween">
                  <div class="ellipsis summaryRow">
                    <span
                      class="clickable summaryChip"
                      title={t('summary.imagesTip')}
                      onClick={() => setTab('images')}
                    >
                      <ImageGlyph />
                      <Text>
                        <Muted>
                          {t('tab.images')}{' '}
                          {settings.fitToSize
                            ? `≤ ${formatBytes(mbToBytes(settings.fitTargetMb))}`
                            : t(`presets.${imageModeOf(settings)}` as const)}
                        </Muted>
                      </Text>
                    </span>
                    {fonts.length === 0 ? null : (
                      <span
                        class="clickable summaryChip"
                        title={t('summary.fontsTip')}
                        onClick={() => setTab('fonts')}
                      >
                        <TypeGlyph />
                        <Text>
                          <Muted>{fontsSummaryText(fonts, storedFonts)}</Muted>
                        </Text>
                      </span>
                    )}
                  </div>
                  <SegmentedControl
                    disabled={exporter.busy}
                    onValueChange={(value: string) => handleSort(value as SortMode)}
                    options={[
                      { value: 'position', children: t('app.sortPosition') },
                      { value: 'name', children: t('app.sortName') }
                    ]}
                    value={sortMode}
                  />
                </div>
                {missing.length === 0 ? null : (
                  <Fragment>
                    <VerticalSpace space="extraSmall" />
                    <div class="clickable missingLine ellipsis" onClick={() => setTab('fonts')}>
                      <Text>
                        {t('app.missingWarn', {
                          names: missing.map((font) => `${font.family} ${font.style}`).join(', ')
                        })}
                      </Text>
                    </div>
                  </Fragment>
                )}
                <VerticalSpace space="small" />
              </Fragment>
            )}

            <FrameList
              items={visible}
              disabled={exporter.busy}
              onMove={handleMove}
              onReorder={handleReorder}
              onFocus={(id) => emit<FrameFocusHandler>('frame:focus', id)}
              onExclude={(id) => setExcluded([...excluded, id])}
            />

            {excluded.length === 0 ? null : (
              <Fragment>
                <VerticalSpace space="extraSmall" />
                <div class="rowBetween">
                  <Text>
                    <Muted>{t('app.excluded', { count: excluded.length })}</Muted>
                  </Text>
                  {excluded.length < 2 ? null : (
                    <Button disabled={exporter.busy} onClick={() => setExcluded([])} secondary>
                      {t('app.restoreAll')}
                    </Button>
                  )}
                </div>
                {ordered
                  .filter((item) => excluded.includes(item.id))
                  .map((item) => (
                    <div key={item.id} class="rowBetween excludedRow">
                      <div class="ellipsis">
                        <Text>
                          <Muted>{item.name}</Muted>
                        </Text>
                      </div>
                      <Button
                        disabled={exporter.busy}
                        onClick={() => setExcluded(excluded.filter((id) => id !== item.id))}
                        secondary
                      >
                        {t('app.restore')}
                      </Button>
                    </div>
                  ))}
              </Fragment>
            )}
          </Fragment>
        ) : null}

        {tab === 'images' ? (
          <Fragment>
            <VerticalSpace space="small" />
            <ImageSettings
              settings={settings}
              disabled={exporter.busy}
              onChange={main.applySettings}
            />
          </Fragment>
        ) : null}

        {tab === 'fonts' ? (
          <Fragment>
            <VerticalSpace space="small" />
            <FontPanel
              fonts={fonts}
              stored={storedFonts}
              disabled={exporter.busy}
              embedText={settings.embedText}
              onEmbedTextChange={(value) => main.applySettings({ ...settings, embedText: value })}
            />
          </Fragment>
        ) : null}

        <VerticalSpace space="small" />
      </div>

      <div class="appFooter">
        <Divider />
        <VerticalSpace space="small" />
        <ExportFooter
          exporter={exporter}
          notice={main.notice}
          pageCount={visible.length}
          onExport={handleExport}
        />
        <VerticalSpace space="extraSmall" />
        <div class="versionLine">
          <Text align="right">
            <Muted>v{PLUGIN_VERSION}</Muted>
          </Text>
        </div>
        <VerticalSpace space="small" />
      </div>
    </div>
  )
}
