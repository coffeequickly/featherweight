// 메인 스레드와의 배선을 한곳에 모은다. (PRD §7.3, C3)
//
// 두 가지 일을 한다:
//   1. 상태 수신 — selection / preflight / frames:thumbs / doc:name / fonts / fonts:stored / notice / settings
//   2. 메인이 못 하는 일 대행 — 이미지 리사이즈(Canvas)·텍스트 검증(fontkit)·폰트 바이트 응답
// 핸들러는 마운트 때 한 번만 등록되므로, 갱신되는 값은 ref 로 본다.

import { emit, on } from '@create-figma-plugin/utilities'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'

import {
  DEFAULT_SETTINGS,
  DocNameHandler,
  EditorHandler,
  EditorKind,
  FontBytesResultHandler,
  FontsHandler,
  FontUsage,
  FrameItem,
  FrameMetaHandler,
  FrameThumbsHandler,
  ImageCacheHandler,
  ImageProbeHandler,
  ImageProbeResultHandler,
  ImageResizeHandler,
  ImageResizeResultHandler,
  NoticeHandler,
  Preflight,
  PreflightHandler,
  SelectionHandler,
  Settings,
  SettingsHandler,
  SettingsSaveHandler,
  StoredFont,
  StoredFontsHandler,
  TextValidateHandler,
  TextValidateResultHandler,
  ToastHandler,
  UiReadyHandler
} from '../lib/types'
import { settleResponse } from './bridge'
import { backfillFontFacts } from './fontFacts'
import { resetFontCache } from './fontSource'
import { forgetOriginals, probeImageBytes, rememberOriginal } from './imageCache'
import { resizeImage } from './resize'
import { validateSources } from './validateText'

export type Notice = { message: string; error: boolean } | null

/** 슬라이더를 끄는 동안 틱마다 clientStorage 에 쓰지 않는다 — 손을 뗀 뒤 한 번 */
const SAVE_DEBOUNCE_MS = 200

export type MainState = {
  items: FrameItem[]
  /** 선택이 바뀔 때마다 1 씩 는다 — 화면 쪽 상태(순서·제외)를 되돌리는 신호 */
  selectionSerial: number
  /** 체크리스트 재료. 목록보다 늦게 오므로 그 사이에는 null 이다. */
  preflight: Preflight | null
  fonts: FontUsage[]
  storedFonts: StoredFont[]
  /** 디자인 파일인지 Slides 인지 — 문구의 프레임/슬라이드가 갈린다 */
  editor: EditorKind
  notice: Notice
  settings: Settings
  docName: string
  /** 설정을 바꾸고 clientStorage 에도 저장한다 */
  applySettings: (next: Settings) => void
  /**
   * 알림을 띄운다. 잘 된 일은 캔버스 토스트로, 문제는 패널 띠로 — 띠에는 경고 아이콘이
   * 붙어서 "저장 완료" 같은 문구가 문제처럼 읽힌다.
   *
   * emit('notice') 로 보내면 안 된다 — notice 는 메인→UI 단방향이라 메인에 핸들러가
   * 없고, "No event handler with name `notice`" 로 죽는다. UI 에서 난 일은 UI 가 띄운다.
   */
  showNotice: (next: Notice) => void
}

export function useMainState(): MainState {
  const [items, setItems] = useState<FrameItem[]>([])
  const [selectionSerial, setSelectionSerial] = useState(0)
  const [preflight, setPreflight] = useState<Preflight | null>(null)
  const [fonts, setFonts] = useState<FontUsage[]>([])
  const [storedFonts, setStoredFonts] = useState<StoredFont[]>([])
  const [notice, setNotice] = useState<Notice>(null)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [docName, setDocName] = useState('')
  const [editor, setEditor] = useState<EditorKind>('figma')

  const storedFontsRef = useRef<StoredFont[]>(storedFonts)
  storedFontsRef.current = storedFonts
  // 검증은 그리기와 같은 규칙이어야 한다 — 대체 폰트 옵션을 같이 본다
  const settingsRef = useRef<Settings>(settings)
  settingsRef.current = settings

  const showNotice = useCallback((next: Notice): void => {
    if (next !== null && !next.error) emit<ToastHandler>('toast', next.message)
    else setNotice(next)
  }, [])

  useEffect(() => {
    const offSelection = on<SelectionHandler>('selection', (next) => {
      setItems(next)
      setPreflight(null) // 새 선택의 재료는 뒤따라 온다
      setSelectionSerial((serial) => serial + 1)
    })
    const offPreflight = on<PreflightHandler>('preflight', setPreflight)
    // 이미지·텍스트 수는 목록 뒤에 온다 — 있는 행에만 얹는다
    const offMeta = on<FrameMetaHandler>('frames:meta', (meta) => {
      const byId = new Map(meta.map((entry) => [entry.id, entry]))
      setItems((previous) =>
        previous.map((item) => {
          const found = byId.get(item.id)
          return found === undefined
            ? item
            : { ...item, imageCount: found.imageCount, textCount: found.textCount }
        })
      )
    })
    // 썸네일은 목록 뒤에 따로 온다 — 있는 행에만 얹는다
    const offThumbs = on<FrameThumbsHandler>('frames:thumbs', (thumbs) => {
      const byId = new Map(thumbs.map((entry) => [entry.id, entry.thumb]))
      setItems((previous) =>
        previous.map((item) => {
          const thumb = byId.get(item.id)
          return thumb === undefined ? item : { ...item, thumb }
        })
      )
    })
    const offDocName = on<DocNameHandler>('doc:name', setDocName)
    const offEditor = on<EditorHandler>('editor', setEditor)
    const offFonts = on<FontsHandler>('fonts', setFonts)
    const offStored = on<StoredFontsHandler>('fonts:stored', (next) => {
      resetFontCache() // 폰트가 바뀌면 캐시된 바이트·글리프 정보를 버린다
      setStoredFonts(next)
      void backfillFontFacts(next) // 옛 항목의 파일 사실을 채운다 — 있으면 아무 일도 없다
    })
    const offNotice = on<NoticeHandler>('notice', showNotice)
    const offSettings = on<SettingsHandler>('settings', setSettings)

    const offFontBytes = on<FontBytesResultHandler>('font:bytes:result', (payload) => {
      settleResponse(payload.reqId, payload)
    })

    // 메인에는 Canvas 가 없다. 리사이즈 요청이 오면 여기서 처리해 돌려준다. (PRD C3)
    const offResize = on<ImageResizeHandler>('image:resize', (payload) => {
      // 목표 용량 탐색이 같은 원본을 여러 설정으로 다시 재봐야 해서 들고 있는다
      if (payload.imageHash !== undefined) rememberOriginal(payload.imageHash, payload.bytes)
      void resizeImage(payload).then((result) => {
        emit<ImageResizeResultHandler>('image:resize:result', { reqId: payload.reqId, ...result })
      })
    })

    // 리사이즈는 없고 캐시만 — 이번엔 건너뛰지만 더 센 설정에서는 재봐야 할 이미지들
    const offCache = on<ImageCacheHandler>('image:cache', (payload) => {
      rememberOriginal(payload.imageHash, payload.bytes)
    })

    // 목표 용량 탐색: 캐시된 원본을 재인코딩해 바이트 합계만 돌려준다 (Figma 미개입)
    const offProbe = on<ImageProbeHandler>('image:probe', (payload) => {
      void probeImageBytes(payload.items, payload.quality, payload.reencodeOpaquePng).then(
        (result) => {
          emit<ImageProbeResultHandler>('image:probe:result', { reqId: payload.reqId, ...result })
        }
      )
    })

    // fill 을 지워도 되는 노드인지 판정한다 — 폰트 파일과 글리프는 여기서만 볼 수 있다
    const offValidate = on<TextValidateHandler>('text:validate', (payload) => {
      void validateSources(payload.sources, storedFontsRef.current, {
        glyphFallback: settingsRef.current.glyphFallback
      }).then((outcome) => {
        emit<TextValidateResultHandler>('text:validate:result', {
          reqId: payload.reqId,
          ...outcome
        })
      })
    })

    emit<UiReadyHandler>('ui:ready', navigator.language)

    return () => {
      offSelection()
      offPreflight()
      offMeta()
      offThumbs()
      offDocName()
      offEditor()
      offFonts()
      offStored()
      offNotice()
      offSettings()
      offFontBytes()
      offResize()
      offCache()
      offProbe()
      offValidate()
      forgetOriginals()
    }
  }, [])

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const applySettings = useCallback((next: Settings): void => {
    setSettings(next)
    if (saveTimer.current !== null) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      emit<SettingsSaveHandler>('settings:save', next)
    }, SAVE_DEBOUNCE_MS)
  }, [])

  return {
    items,
    selectionSerial,
    preflight,
    fonts,
    storedFonts,
    editor,
    notice,
    settings,
    docName,
    applySettings,
    showNotice
  }
}
