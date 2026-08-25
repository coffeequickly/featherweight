import {
  Checkbox,
  FileUploadButton,
  IconButton,
  IconTrash24,
  Muted,
  Text,
  VerticalSpace
} from '@create-figma-plugin/ui'
import { emit } from '@create-figma-plugin/utilities'
import { Fragment, JSX } from 'preact'

import { formatNumber, t } from '../lib/i18n'
import { catalogEntry } from '../lib/fontCatalog'
import { fontKey } from '../lib/fontInventory'
import { findStored, fitsWithin, formatBytes } from '../lib/fontStore'
import {
  FontDeleteHandler,
  FontSaveHandler,
  FontUsage,
  NoticeHandler,
  StoredFont,
  ToastHandler
} from '../lib/types'
import { createProbe } from './fontkitAdapter'

type Props = {
  fonts: FontUsage[]
  stored: StoredFont[]
  disabled: boolean
  embedText: boolean
  onEmbedTextChange: (value: boolean) => void
}

type Availability =
  { kind: 'catalog' } | { kind: 'uploaded'; font: StoredFont } | { kind: 'missing' }

function availabilityOf(font: FontUsage, stored: StoredFont[]): Availability {
  if (catalogEntry(font) !== undefined) return { kind: 'catalog' }
  const uploaded = findStored(stored, font)
  return uploaded === undefined ? { kind: 'missing' } : { kind: 'uploaded', font: uploaded }
}

/**
 * 문서가 쓰는 폰트와 그 폰트를 구할 수 있는지 보여준다.
 *
 * 공개 폰트는 내보낼 때 알아서 받아 온다(카탈로그). 못 구하는 서체만 사용자가 넣는다.
 * 파일에서 family/style 을 자동으로 읽지 않는 이유: variable 에서 뽑은 static 인스턴스의
 * 이름표가 Figma 가 부르는 이름과 어긋난다("Pretendard Variable SemiBold / Regular").
 */
/** 파일이 없어 아웃라인으로 나갈 폰트들 — 내보내기 탭 경고에 쓴다 */
export function missingFonts(fonts: FontUsage[], stored: StoredFont[]): FontUsage[] {
  return fonts.filter((font) => availabilityOf(font, stored).kind === 'missing')
}

/** 내보내기 탭의 한 줄 요약 — "4종 · 전부 준비됨" */
export function fontsSummaryText(fonts: FontUsage[], stored: StoredFont[]): string {
  if (fonts.length === 0) return ''
  const missing = fonts.filter((font) => availabilityOf(font, stored).kind === 'missing').length
  return missing === 0
    ? t('fonts.summaryReady', { count: fonts.length })
    : t('fonts.summaryMissing', { count: fonts.length, missing })
}

export function FontPanel({
  fonts,
  stored,
  disabled,
  embedText,
  onEmbedTextChange
}: Props): JSX.Element {
  if (fonts.length === 0) {
    return (
      <Text>
        <Muted>{t('fonts.none')}</Muted>
      </Text>
    )
  }

  const states = fonts.map((font) => availabilityOf(font, stored))
  const missing = states.filter((state) => state.kind === 'missing').length

  return (
    <Fragment>
      <VerticalSpace space="extraSmall" />
      {/* 끄면 이 플러그인의 반쪽이 죽는다 — 끌 일이 드물어 여기로 접어 둔다 */}
      <Checkbox disabled={disabled} onValueChange={onEmbedTextChange} value={embedText}>
        <Text>{t('app.embedText')}</Text>
      </Checkbox>
      <VerticalSpace space="extraSmall" />
      <Text>
        <Muted>{t('fonts.help')}</Muted>
      </Text>
      <VerticalSpace space="small" />

      {fonts.map((font, index) => (
        <FontRow
          key={fontKey(font)}
          font={font}
          state={states[index]}
          all={stored}
          disabled={disabled}
        />
      ))}
      <VerticalSpace space="extraSmall" />

      {missing === 0 ? null : (
        <Fragment>
          <VerticalSpace space="extraSmall" />
          <Text>
            <Muted>{t('fonts.missingNote', { missing })}</Muted>
          </Text>
          <VerticalSpace space="extraSmall" />
          {/* 파일 선택창은 보안상 시작 폴더를 지정할 수 없다 —
              대신 경로를 복사해 주고 이동(⌘⇧G)으로 안내한다 */}
          <Text>
            <Muted>{t(IS_MAC ? 'fonts.pathHelpMac' : 'fonts.pathHelpWin')}</Muted>
          </Text>
          <VerticalSpace space="extraSmall" />
          <Text>
            <Muted>
              {FONT_DIRS.map((dir, index) => (
                <Fragment key={dir}>
                  {index > 0 ? '  ·  ' : ''}
                  <span class="clickable pathChip" onClick={() => void copyPath(dir)}>
                    {dir}
                  </span>
                </Fragment>
              ))}
            </Muted>
          </Text>
        </Fragment>
      )}
    </Fragment>
  )
}

/**
 * navigator.platform 은 deprecated 라 브라우저가 값을 얼리거나 비울 수 있다.
 * userAgentData(신규) → userAgent(범용) → platform(구형) 순으로 본다.
 * 판정 실패 시 mac 이 아닌 쪽으로 두는 게 안전하다 — 윈도우 안내에는 mac 전용
 * 단축키(⌘⇧G)가 없으므로 틀려도 잘못된 키를 알려주지 않는다.
 */
const IS_MAC = detectMac()

function detectMac(): boolean {
  const data = (navigator as { userAgentData?: { platform?: string } }).userAgentData
  if (typeof data?.platform === 'string' && data.platform !== '') {
    return data.platform.toUpperCase().includes('MAC')
  }
  const agent = navigator.userAgent ?? ''
  if (agent !== '') return /Mac|iPhone|iPad|iPod/i.test(agent)
  return (navigator.platform ?? '').toUpperCase().includes('MAC')
}
// 윈도우는 "모든 사용자"(C:\Windows\Fonts)와 "나만"(%LOCALAPPDATA%) 두 곳에 설치된다 —
// 관리자 권한 없이 설치한 폰트는 후자에만 있어서 둘 다 안내해야 한다.
const FONT_DIRS = IS_MAC
  ? ['~/Library/Fonts', '/Library/Fonts']
  : ['C:\\Windows\\Fonts', '%LOCALAPPDATA%\\Microsoft\\Windows\\Fonts']

async function copyPath(path: string): Promise<void> {
  // execCommand 를 먼저 쓴다 — 동기라 절대 멈추지 않는다. 실측 결과 Clipboard API
  // (navigator.clipboard.writeText) 는 이 플러그인 iframe 에서 권한 프롬프트가
  // 렌더링되지 못해 응답 없이 영원히 대기했다 — await 가 안 끝나 클릭이 "반응 없음"
  // 으로 보였다. 그래서 비동기 경로는 타임아웃을 씌워 반드시 끝나게 한다.
  const copied = trySyncCopy(path) || (await tryAsyncCopy(path))
  emit<ToastHandler>(
    'toast',
    t(copied ? (IS_MAC ? 'fonts.pathCopiedMac' : 'fonts.pathCopiedWin') : 'fonts.pathCopyFailed')
  )
}

function trySyncCopy(text: string): boolean {
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.focus()
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}

const CLIPBOARD_TIMEOUT_MS = 400

function tryAsyncCopy(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText === undefined) return Promise.resolve(false)
  const attempt = navigator.clipboard
    .writeText(text)
    .then(() => true)
    .catch(() => false)
  const timeout = new Promise<boolean>((resolve) =>
    setTimeout(() => resolve(false), CLIPBOARD_TIMEOUT_MS)
  )
  return Promise.race([attempt, timeout])
}

function FontRow({
  font,
  state,
  all,
  disabled
}: {
  font: FontUsage
  state: Availability
  all: StoredFont[]
  disabled: boolean
}): JSX.Element {
  async function handleFiles(files: File[]): Promise<void> {
    const file = files[0]
    if (file === undefined) return

    const bytes = new Uint8Array(await file.arrayBuffer())

    let parsed
    try {
      parsed = createProbe(bytes)
    } catch {
      emit<NoticeHandler>('notice', {
        message: t('fonts.parseError', { file: file.name }),
        error: true
      })
      return
    }

    if (!fitsWithin(all, font, bytes.length)) {
      emit<NoticeHandler>('notice', {
        message: t('fonts.storageFull', { size: formatBytes(bytes.length) }),
        error: true
      })
      return
    }

    emit<FontSaveHandler>('font:save', {
      font: {
        family: font.family,
        style: font.style,
        weight: font.weight,
        italic: font.italic,
        byteLength: bytes.length,
        numGlyphs: parsed.numGlyphs,
        codePoints: parsed.characterSet.length,
        fileName: file.name
      },
      bytes
    })
  }

  const detail =
    state.kind === 'catalog'
      ? t('fonts.detailCatalog', { count: font.nodeCount })
      : state.kind === 'uploaded'
        ? t('fonts.detailUploaded', {
            file: state.font.fileName,
            size: formatBytes(state.font.byteLength),
            count: font.nodeCount
          })
        : t('fonts.detailMissing', {
            count: font.nodeCount,
            chars: formatNumber(font.charCount)
          })

  return (
    <div class="fontRow">
      <div class="fontRowMain">
        <div class="ellipsis">
          <Text>
            {font.family} {font.style}
          </Text>
        </div>
        <VerticalSpace space="extraSmall" />
        <div class="ellipsis">
          <Text>
            <Muted>{detail}</Muted>
          </Text>
        </div>
      </div>
      <div class="fontRowActions">
        {state.kind === 'catalog' ? null : (
          <FileUploadButton
            acceptedFileTypes={['font/ttf', 'font/otf', '.ttf', '.otf']}
            disabled={disabled}
            onSelectedFiles={(files: File[]) => {
              void handleFiles(files)
            }}
            secondary
          >
            {state.kind === 'uploaded' ? t('fonts.replace') : t('fonts.add')}
          </FileUploadButton>
        )}
        {state.kind === 'uploaded' ? (
          <IconButton
            disabled={disabled}
            onClick={() => emit<FontDeleteHandler>('font:delete', font)}
          >
            <IconTrash24 />
          </IconButton>
        ) : null}
      </div>
    </div>
  )
}
