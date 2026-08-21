// 메인 스레드와의 배선을 한곳에 모은다. (PRD §7.3, C3)
//
// 두 가지 일을 한다:
//   1. 상태 수신 — selection / doc:name / fonts / fonts:stored / notice / settings
//   2. 메인이 못 하는 일 대행 — 이미지 리사이즈(Canvas)·텍스트 검증(fontkit)·폰트 바이트 응답
// 핸들러는 마운트 때 한 번만 등록되므로, 갱신되는 값은 ref 로 본다.

import { emit, on } from '@create-figma-plugin/utilities'
import { useEffect, useRef, useState } from 'preact/hooks'

import {
  DEFAULT_SETTINGS,
  DocNameHandler,
  FontBytesResultHandler,
  FontsHandler,
  FontUsage,
  FrameItem,
  ImageResizeHandler,
  ImageResizeResultHandler,
  NoticeHandler,
  SelectionHandler,
  Settings,
  SettingsHandler,
  SettingsSaveHandler,
  StoredFont,
  StoredFontsHandler,
  TextValidateHandler,
  TextValidateResultHandler,
  UiReadyHandler
} from '../lib/types'
import { settleResponse } from './bridge'
import { resetFontCache } from './fontSource'
import { resizeImage } from './resize'
import { validateSources } from './validateText'

export type Notice = { message: string; error: boolean } | null

export type MainState = {
  items: FrameItem[]
  fonts: FontUsage[]
  storedFonts: StoredFont[]
  notice: Notice
  settings: Settings
  docName: string
  /** 설정을 바꾸고 clientStorage 에도 저장한다 */
  applySettings: (next: Settings) => void
}

export function useMainState(onSelectionChange: () => void): MainState {
  const [items, setItems] = useState<FrameItem[]>([])
  const [fonts, setFonts] = useState<FontUsage[]>([])
  const [storedFonts, setStoredFonts] = useState<StoredFont[]>([])
  const [notice, setNotice] = useState<Notice>(null)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [docName, setDocName] = useState('')

  const storedFontsRef = useRef<StoredFont[]>(storedFonts)
  storedFontsRef.current = storedFonts
  const onSelectionChangeRef = useRef(onSelectionChange)
  onSelectionChangeRef.current = onSelectionChange

  useEffect(() => {
    const offSelection = on<SelectionHandler>('selection', (next) => {
      setItems(next)
      onSelectionChangeRef.current() // 화면 쪽 상태(순서·제외)는 App 이 되돌린다
    })
    const offDocName = on<DocNameHandler>('doc:name', setDocName)
    const offFonts = on<FontsHandler>('fonts', setFonts)
    const offStored = on<StoredFontsHandler>('fonts:stored', (next) => {
      resetFontCache() // 폰트가 바뀌면 캐시된 바이트·글리프 정보를 버린다
      setStoredFonts(next)
    })
    const offNotice = on<NoticeHandler>('notice', setNotice)
    const offSettings = on<SettingsHandler>('settings', setSettings)

    const offFontBytes = on<FontBytesResultHandler>('font:bytes:result', (payload) => {
      settleResponse(payload.reqId, payload)
    })

    // 메인에는 Canvas 가 없다. 리사이즈 요청이 오면 여기서 처리해 돌려준다. (PRD C3)
    const offResize = on<ImageResizeHandler>('image:resize', (payload) => {
      void resizeImage(payload).then((result) => {
        emit<ImageResizeResultHandler>('image:resize:result', { reqId: payload.reqId, ...result })
      })
    })

    // fill 을 지워도 되는 노드인지 판정한다 — 폰트 파일과 글리프는 여기서만 볼 수 있다
    const offValidate = on<TextValidateHandler>('text:validate', (payload) => {
      void validateSources(payload.sources, storedFontsRef.current).then((outcome) => {
        emit<TextValidateResultHandler>('text:validate:result', {
          reqId: payload.reqId,
          ...outcome
        })
      })
    })

    emit<UiReadyHandler>('ui:ready', navigator.language)

    return () => {
      offSelection()
      offDocName()
      offFonts()
      offStored()
      offNotice()
      offSettings()
      offFontBytes()
      offResize()
      offValidate()
    }
  }, [])

  function applySettings(next: Settings): void {
    setSettings(next)
    emit<SettingsSaveHandler>('settings:save', next)
  }

  return { items, fonts, storedFonts, notice, settings, docName, applySettings }
}
