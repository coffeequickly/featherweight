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
  ImageCacheHandler,
  ImageProbeHandler,
  ImageProbeResultHandler,
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
import { forgetOriginals, probeImageBytes, rememberOriginal } from './imageCache'
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
  /**
   * UI 안에서 생긴 알림을 띄운다.
   *
   * emit('notice') 로 보내면 안 된다 — notice 는 메인→UI 단방향이라 메인에 핸들러가
   * 없고, "No event handler with name `notice`" 로 죽는다. UI 에서 난 일은 UI 가 띄운다.
   */
  showNotice: (next: Notice) => void
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
      offCache()
      offProbe()
      offValidate()
      forgetOriginals()
    }
  }, [])

  function applySettings(next: Settings): void {
    setSettings(next)
    emit<SettingsSaveHandler>('settings:save', next)
  }

  return {
    items,
    fonts,
    storedFonts,
    notice,
    settings,
    docName,
    applySettings,
    showNotice: setNotice
  }
}
