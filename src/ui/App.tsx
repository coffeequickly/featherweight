import {
  Banner,
  Container,
  Divider,
  IconWarning16,
  useWindowResize,
  VerticalSpace
} from '@create-figma-plugin/ui'
import { emit } from '@create-figma-plugin/utilities'
import { Component, ComponentChildren, Fragment, JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'

import { suggestFileName } from '../lib/fileName'
import { fontReadiness, uploadedProblems } from '../lib/fontStatus'
import { MessageKey, t } from '../lib/i18n'
import { outlinedTexts } from '../lib/preflight'
import { DEFAULT_SETTINGS, FrameThumbsRequestHandler, ResizeWindowHandler } from '../lib/types'
import { PLUGIN_VERSION } from './buildInfo'
import { ExportFooter } from './ExportFooter'
import { FontFamilyPage } from './FontFamilyPage'
import { FontPanel } from './FontPanel'
import { FontStoragePage } from './FontStoragePage'
import { FramesScreen } from './FramesScreen'
import { ImagesPanel } from './ImagesPanel'
import { MainScreen } from './MainScreen'
import { OptionsPanel } from './OptionsPanel'
import { PAGES_SHOWN } from './PageStrip'
import { PreviewPanel } from './PreviewPanel'
import { ResultScreen } from './ResultScreen'
import { ScreenHeader } from './Screen'
import { TabBar, TabId, TAB_IDS } from './TabBar'
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
 * 탭 여섯이 작업 순서다 — 시작에서 상태를 보고, 가운데 넷에서 고치고, 결과로 끝난다.
 * 목록보다 큰 것(사유별 진단, 추출한 텍스트)은 탭 아래 하위 페이지로 내려간다.
 * 내보내기 버튼과 진행은 어느 탭에서든 아래에 붙어 있다.
 */
type Subpage = 'outline' | 'extracted' | 'family' | 'storage' | null

const SUB_TITLES: Record<Exclude<Subpage, null | 'family'>, MessageKey> = {
  outline: 'screen.text',
  extracted: 'screen.preview',
  storage: 'screen.storage'
}

/** 초기 하위 페이지 — ui-preview 캡처 자동화용 훅. Figma 안에서는 전역이 없어 항상 null. */
function initialSubpage(): Subpage {
  if (initialFamily() !== null) return 'family'
  const preset = (window as { __PREVIEW_SUB__?: string }).__PREVIEW_SUB__
  return preset === 'storage' || preset === 'outline' || preset === 'extracted' ? preset : null
}

/** 초기 패밀리 상세 — ui-preview 캡처 자동화용 훅. Figma 안에서는 전역이 없어 항상 null. */
function initialFamily(): string | null {
  const preset = (window as { __PREVIEW_FAMILY__?: string }).__PREVIEW_FAMILY__
  return preset === undefined || preset === '' ? null : preset
}

/** 초기 탭 — ui-preview 캡처 자동화용 훅. Figma 안에서는 전역이 없어 항상 시작. */
function initialTab(): TabId {
  const preset = (window as { __PREVIEW_SCREEN__?: string }).__PREVIEW_SCREEN__
  return preset !== undefined && (TAB_IDS as readonly string[]).includes(preset)
    ? (preset as TabId)
    : 'start'
}

function AppBody(): JSX.Element {
  const [tab, setTab] = useState<TabId>(initialTab)
  const [subpage, setSubpage] = useState<Subpage>(initialSubpage)
  /** 상세를 연 폰트 패밀리 — subpage 가 'family' 일 때만 뜻이 있다 */
  const [family, setFamilyName] = useState<string | null>(initialFamily)
  /** 내보낸 문서의 첫 장 썸네일 — 결과 카드가 쓴다 */
  const [firstPage, setFirstPage] = useState<Uint8Array | undefined>(undefined)

  const setFamily = (name: string): void => {
    setFamilyName(name)
    setSubpage('family')
  }

  const main = useMainState()
  const { items, fonts, storedFonts, settings, preflight, showNotice } = main
  const order = useFrameOrder(items, main.selectionSerial)
  const exporter = useExport(
    storedFonts,
    settings.embedText,
    settings.keepLinks,
    settings.glyphFallback
  )

  useWindowResize(
    (size: { width: number; height: number }) => emit<ResizeWindowHandler>('resize:window', size),
    { minWidth: 360, minHeight: 400, maxWidth: 720, maxHeight: 1200 }
  )

  /**
   * 정렬은 두 장부터 뜻이 있다. 탭은 사라지지 않고 비활성으로 자리를 지킨다.
   *
   * 첫 선택이 도착하기 전에는 판정하지 않는다 — items 는 그때까지 빈 배열이라,
   * 열자마자 비활성이 됐다가 켜지고 선택을 바꾸는 찰나마다 탭에서 쫓겨난다.
   */
  const knowsSelection = main.selectionSerial > 0
  const orderDisabled = knowsSelection && items.length < 2
  const disabledTabs: TabId[] = orderDisabled ? ['order'] : []

  // 폰트를 못 구했거나 넣은 파일이 자리에 안 맞으면 폰트 탭에 표시가 붙는다
  const readiness = fontReadiness(fonts, storedFonts)
  const fontProblem =
    readiness.missing.length > 0 || uploadedProblems(fonts, storedFonts).length > 0
  const problemTabs: TabId[] = fontProblem ? ['fonts'] : []

  // 비활성이 된 탭에 그대로 서 있으면 빈 화면이 된다 — 시작으로 돌아온다
  useEffect(() => {
    if (orderDisabled && tab === 'order') setTab('start')
  }, [orderDisabled, tab])

  // 선택이 비면 그 선택을 설명하던 하위 페이지도 갈 곳이 없다
  useEffect(() => {
    if (main.selectionSerial > 0 && items.length === 0 && subpage === 'outline') setSubpage(null)
  }, [main.selectionSerial, items.length, subpage])

  /** 미리보기 캡처는 내보내기를 거치지 않는다 — 픽스처 리포트에는 첫 장을 붙여 준다 */
  const shownFirstPage = firstPage ?? order.visible[0]?.thumb

  const goTab = (next: TabId): void => {
    setSubpage(null)
    setTab(next)
  }

  /**
   * 썸네일은 필요한 탭에서만, 그리고 그 탭이 실제로 그릴 프레임만. 시작 탭은 확인용이라
   * 앞 몇 장이면 되고 전체는 정렬 탭이 요청한다 — 장당 exportAsync 라 서른 장을 다 그리면
   * 여는 속도를 버린다.
   *
   * 개수가 아니라 id 로 요청한다. 메인의 선택 배열은 Figma 가 준 순서라 우리가 정렬해
   * 보여 주는 것과 다르고, "앞에서 넷" 이 서로 다른 넷을 가리켰다.
   */
  const thumbsAsked = useRef<{ serial: number; ids: Set<string> }>({ serial: -1, ids: new Set() })
  useEffect(() => {
    const wanted =
      tab === 'order' ? order.visible : tab === 'start' ? order.visible.slice(0, PAGES_SHOWN) : []
    if (wanted.length === 0) return
    if (thumbsAsked.current.serial !== main.selectionSerial) {
      thumbsAsked.current = { serial: main.selectionSerial, ids: new Set() }
    }
    const asked = thumbsAsked.current.ids
    const ids = wanted.map((item) => item.id).filter((id) => !asked.has(id))
    if (ids.length === 0) return
    for (const id of ids) asked.add(id)
    emit<FrameThumbsRequestHandler>('frames:thumbs:request', ids)
  }, [tab, main.selectionSerial, order.visible])

  /**
   * 내보내고 나면 결과 탭이 받는다 — 고치고 다시 내보내는 왕복이 여기서 돈다.
   * 임베딩한 텍스트를 읽던 중이었으면 그 자리에 둔다 — 그 페이지도 결과 탭 소속이고,
   * 다시 내보낸 이유가 대개 그 텍스트를 고치려던 것이다.
   */
  useEffect(() => {
    if (exporter.report !== null) {
      setSubpage((current) => (current === 'extracted' ? current : null))
      setTab('result')
    }
  }, [exporter.report])

  function handleExport(): void {
    // 내보내는 순간의 첫 장을 붙잡아 둔다 — 뒤에 선택이 바뀌어도 결과 카드는 그때 것을 보여준다
    setFirstPage(order.visible[0]?.thumb)
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

  // 세로 4단: 탭(고정) / 하위 페이지 헤더(있을 때) / 내용(스크롤) / 실행·결과(고정).
  return (
    <div class="appRoot">
      <TabBar active={tab} problems={problemTabs} disabled={disabledTabs} onSelect={goTab} />

      {subpage === null ? null : (
        <ScreenHeader
          title={subpage === 'family' ? (family ?? '') : t(SUB_TITLES[subpage])}
          onBack={() => setSubpage(null)}
        />
      )}

      <div class="appScroll">
        {subpage === 'outline' ? (
          <TextScreen rejects={outlinedTexts(preflight?.textRejects ?? [], fonts, storedFonts)} />
        ) : null}

        {subpage === 'extracted' ? (
          <PreviewPanel lines={exporter.report?.extractable ?? []} />
        ) : null}

        {subpage === 'storage' ? (
          <FontStoragePage stored={storedFonts} fonts={fonts} disabled={exporter.busy} />
        ) : null}

        {subpage === 'family' && family !== null ? (
          <FontFamilyPage
            family={family}
            fonts={fonts}
            stored={storedFonts}
            disabled={exporter.busy}
            onNotice={showNotice}
          />
        ) : null}

        {subpage !== null ? null : (
          <Fragment>
            {tab === 'start' ? (
              <MainScreen
                items={items}
                order={order}
                preflight={preflight}
                fonts={fonts}
                storedFonts={storedFonts}
                settings={settings}
                editor={main.editor}
                disabled={exporter.busy}
                onChangeSettings={main.applySettings}
                onOpen={(target) => {
                  if (target === 'outline') setSubpage('outline')
                  else if (target === 'frames') setTab('order')
                  else if (target === 'images') setTab('images')
                  else if (target === 'options') setTab('options')
                  else setTab('fonts')
                }}
              />
            ) : null}

            {tab === 'order' ? <FramesScreen order={order} disabled={exporter.busy} /> : null}

            {tab === 'fonts' ? (
              <FontPanel
                fonts={fonts}
                stored={storedFonts}
                disabled={exporter.busy}
                onOpenFamily={setFamily}
                onOpenStorage={() => setSubpage('storage')}
              />
            ) : null}

            {tab === 'images' ? (
              <ImagesPanel
                settings={settings}
                preflight={preflight}
                disabled={exporter.busy}
                onChange={main.applySettings}
              />
            ) : null}

            {tab === 'options' ? (
              <OptionsPanel
                settings={settings}
                disabled={exporter.busy}
                onChange={main.applySettings}
                onReset={() => main.applySettings(DEFAULT_SETTINGS)}
                version={PLUGIN_VERSION}
              />
            ) : null}

            {tab === 'result' ? (
              <ResultScreen
                report={exporter.report}
                firstPage={shownFirstPage}
                error={exporter.error}
                onOpenPreview={() => setSubpage('extracted')}
              />
            ) : null}
          </Fragment>
        )}

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
        />
        <VerticalSpace space="small" />
      </div>
    </div>
  )
}
