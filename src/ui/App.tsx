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
import { summarizeMissing } from '../lib/fontInventory'
import { formatBytes } from '../lib/fontStore'
import { imageModeOf } from '../lib/presets'
import { ImageGlyph, TypeGlyph } from './glyphs'
import { FrameFocusHandler, FrameItem, ResizeWindowHandler, Settings, SortMode } from '../lib/types'
import { PLUGIN_VERSION } from './buildInfo'
import { ExportFooter } from './ExportFooter'
import { FontPanel, fontsSummaryText, missingFonts } from './FontPanel'
import { PreviewPanel } from './PreviewPanel'
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

/**
 * 요약 칩 문구. "이미지" + 프리셋 이름을 그냥 이으면 "이미지 직접" 처럼 말이 안 되는
 * 조합이 나온다 — 그 경우만 따로 쓴다.
 */
function imageChipText(settings: Settings): string {
  if (settings.fitToSize) {
    return `${t('tab.images')} ≤ ${formatBytes(mbToBytes(settings.fitTargetMb))}`
  }
  const mode = imageModeOf(settings)
  if (mode === 'custom') return t('summary.imagesCustom')
  return `${t('tab.images')} ${t(`presets.${mode}` as const)}`
}

function AppBody(): JSX.Element {
  // 화면이 들고 있는 것: 탭·정렬·순서·제외. 메인에서 오는 것: useMainState.
  // 초기 탭 — ui-preview 캡처 자동화용 훅. Figma 안에서는 전역이 없어 항상 'export'.
  const [tab, setTab] = useState<'export' | 'images' | 'fonts' | 'preview'>(() => {
    const preset = (window as { __PREVIEW_TAB__?: string }).__PREVIEW_TAB__
    return preset === 'images' || preset === 'fonts' || preset === 'preview' ? preset : 'export'
  })
  const [sortMode, setSortMode] = useState<SortMode>('position')
  const [excluded, setExcluded] = useState<string[]>([])
  const [manualOrder, setManualOrder] = useState<string[]>([])

  const main = useMainState(() => {
    setManualOrder([]) // 선택이 바뀌면 손으로 잡은 순서·제외는 버린다
    setExcluded([])
  })
  const { items, fonts, storedFonts, settings, showNotice } = main

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

    // 내보내기 탭에 실제로 쌓이는 것만 센다. 이미지 설정은 탭 분리 때 Images 로
    // 옮겨갔는데 그 몫(140px)이 계산에 남아 있어서, 목록이 짧아도 창이 그만큼 컸다.
    const HEADER = 56 // 탭 바
    const SUMMARY = 40 // 요약 칩 + 정렬
    const ROW = 44
    const LIST_PADDING = 24
    const FOOTER = 96 // 구분선 + 버튼 + 버전
    // 탭마다 담기는 내용이 다르다. 프레임 수만 보고 높이를 정하면 이미지 탭처럼
    // 내용이 고정된 화면이 프레임 두 개짜리 문서에서 잘린다.
    const CONTENT: Record<typeof tab, number> = {
      export: SUMMARY + Math.max(items.length, 1) * ROW + LIST_PADDING,
      images: 530, // 영문 설명이 한글보다 길다 — 긴 쪽에 맞춘다
      fonts: 300,
      preview: 300
    }
    const desired = Math.max(320, Math.min(680, HEADER + CONTENT[tab] + FOOTER))

    autoHeight.current = desired
    emit<ResizeWindowHandler>('resize:window', { width: window.innerWidth, height: desired })
  }, [items.length, tab])

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
              else if (value === t('tab.preview')) setTab('preview')
              else setTab('fonts')
            }}
            options={[
              { value: t('tab.export'), children: null },
              { value: t('tab.images'), children: null },
              { value: t('tab.fonts'), children: null },
              { value: t('tab.preview'), children: null }
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
                        <Muted>{imageChipText(settings)}</Muted>
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
                          <Muted>{fontsSummaryText(fonts)}</Muted>
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
                        {t(
                          'app.missingWarn',
                          summarizeMissing(missing.map((font) => `${font.family} ${font.style}`))
                        )}
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

        {tab === 'preview' ? (
          <Fragment>
            <VerticalSpace space="small" />
            <PreviewPanel lines={exporter.report?.extractable ?? []} />
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
              onNotice={showNotice}
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
          onOpenPreview={() => setTab('preview')}
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
