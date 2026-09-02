import {
  Button,
  FileUploadButton,
  IconButton,
  IconTrash24,
  Muted,
  Text,
  VerticalSpace
} from '@create-figma-plugin/ui'
import { emit } from '@create-figma-plugin/utilities'
import { Fragment, JSX } from 'preact'
import { useRef, useState } from 'preact/hooks'

import { formatNumber, formatReason, t } from '../lib/i18n'
import { FontFacts, screenFontFile, weightMismatch } from '../lib/fontFile'
import { fontKey } from '../lib/fontInventory'
import { availabilityOf, FontAvailability, missingFonts } from '../lib/fontStatus'
import { fitsWithin, formatBytes, upsertFont } from '../lib/fontStore'
import {
  FontDeleteHandler,
  FontSaveHandler,
  FontUsage,
  StoredFont,
  ToastHandler
} from '../lib/types'
import { findFontFiles } from './fontFolder'
import { createProbe, factsOf, FontProbe } from './fontkitAdapter'

type Notice = { message: string; error: boolean }

type Props = {
  fonts: FontUsage[]
  stored: StoredFont[]
  disabled: boolean
  /** UI 안에서 난 일은 UI 가 띄운다 — emit('notice') 는 메인에 핸들러가 없어 죽는다 */
  onNotice: (notice: Notice) => void
}

/**
 * 문서가 쓰는 폰트와 그 폰트를 구할 수 있는지 보여준다.
 *
 * 공개 폰트는 내보낼 때 알아서 받아 온다(카탈로그). 못 구하는 서체만 사용자가 넣는다 —
 * 파일 하나씩, 또는 폰트 폴더를 통째로 골라 자동으로.
 * 파일에서 family/style 을 자동으로 읽어 자리를 정하지 않는 이유: variable 에서 뽑은 static
 * 인스턴스의 이름표가 Figma 가 부르는 이름과 어긋난다("Pretendard Variable SemiBold / Regular").
 */
export function FontPanel({ fonts, stored, disabled, onNotice }: Props): JSX.Element {
  if (fonts.length === 0) {
    return (
      <Fragment>
        <VerticalSpace space="small" />
        <Text>
          <Muted>{t('fonts.none')}</Muted>
        </Text>
      </Fragment>
    )
  }

  const states = fonts.map((font) => availabilityOf(font, stored))
  const missing = missingFonts(fonts, stored)

  return (
    <Fragment>
      <VerticalSpace space="small" />
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
          onNotice={onNotice}
        />
      ))}

      {missing.length === 0 ? null : (
        <Fragment>
          <VerticalSpace space="medium" />
          <FolderScan missing={missing} stored={stored} disabled={disabled} onNotice={onNotice} />
          <VerticalSpace space="medium" />
          <Text>
            <Muted>{t('fonts.uploadHint')}</Muted>
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
 * 폰트 폴더를 통째로 골라 없는 폰트를 한 번에 넣는다.
 *
 * 파일 선택창에 폴더 모드(webkitdirectory)가 있다 — 라이브러리 업로드 버튼에는 그 옵션이
 * 없어 input 을 직접 둔다. 폴더 안 파일은 전부 이 컴퓨터에서만 읽힌다.
 */
function FolderScan({
  missing,
  stored,
  disabled,
  onNotice
}: {
  missing: FontUsage[]
  stored: StoredFont[]
  disabled: boolean
  onNotice: (notice: Notice) => void
}): JSX.Element {
  const input = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  async function scan(files: File[]): Promise<void> {
    setProgress({ done: 0, total: 0 })
    try {
      const found = await findFontFiles(files, missing, (done, total) =>
        setProgress({ done, total })
      )

      // 저장은 순서대로 쌓인다 — 한도(5MB) 계산에 방금 넣은 것까지 넣어야 한다
      let have = stored
      let saved = 0
      let skipped = 0
      for (const font of missing) {
        const match = found.get(fontKey(font))
        if (match === undefined) continue
        const verdict = screenUpload(
          match.bytes,
          match.fileName,
          match.probe,
          match.facts,
          font,
          have
        )
        if (!verdict.ok) {
          skipped += 1
          continue
        }
        emit<FontSaveHandler>('font:save', verdict.save)
        have = upsertFont(have, verdict.save.font)
        saved += 1
      }

      if (found.size === 0) {
        onNotice({ message: t('fonts.scanNone'), error: true })
        return
      }
      onNotice({
        message:
          t('fonts.scanResult', { found: saved, missing: missing.length }) +
          (skipped > 0 ? t('fonts.scanSkipped', { count: skipped }) : ''),
        error: saved === 0
      })
    } finally {
      setProgress(null)
      if (input.current !== null) input.current.value = ''
    }
  }

  return (
    <Fragment>
      <div class="rowBetween">
        <Button
          disabled={disabled || progress !== null}
          onClick={() => input.current?.click()}
          secondary
        >
          {t('fonts.scanFolder')}
        </Button>
        {progress === null ? null : (
          <Text>
            <Muted>{t('fonts.scanning', { current: progress.done, total: progress.total })}</Muted>
          </Text>
        )}
      </div>
      <VerticalSpace space="extraSmall" />
      <Text>
        <Muted>{t('fonts.scanHint')}</Muted>
      </Text>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        {...{ webkitdirectory: '' }}
        onChange={(event) => {
          const list = (event.currentTarget as HTMLInputElement).files
          if (list !== null && list.length > 0) void scan([...list])
        }}
      />
    </Fragment>
  )
}

type UploadVerdict =
  | { ok: true; save: { font: StoredFont; bytes: Uint8Array }; notice?: Notice }
  | { ok: false; notice: Notice }

/**
 * 파일 하나를 이 자리에 넣어도 되는가. 한 번 올리기와 폴더 스캔이 같은 문을 지난다.
 *
 * 파싱만 되면 통과시키면 안 된다 — OTF(CFF)는 텍스트 추출이 통째로 깨지고, 가변 폰트는
 * 굵기가 조용히 틀린다 (src/lib/fontFile.ts). 굵기가 어긋나도 막지는 않는다 —
 * 파일 이름표가 틀린 경우가 있다. 대신 알려 준다.
 */
function screenUpload(
  bytes: Uint8Array,
  fileName: string,
  probe: FontProbe,
  facts: FontFacts,
  font: FontUsage,
  all: readonly StoredFont[]
): UploadVerdict {
  const verdict = screenFontFile(facts)
  if (!verdict.ok)
    return { ok: false, notice: { message: formatReason(verdict.reason), error: true } }

  if (!fitsWithin(all, font, bytes.length)) {
    return {
      ok: false,
      notice: { message: t('fonts.storageFull', { size: formatBytes(bytes.length) }), error: true }
    }
  }

  const mismatch = weightMismatch(facts, { weight: font.weight, italic: font.italic })
  const notice: Notice | undefined = mismatch.differs
    ? {
        message: t('fontFile.weightMismatch', {
          fileStyle: `${mismatch.fileWeight}${mismatch.fileItalic ? ' Italic' : ''}`,
          slotStyle: font.style
        }),
        error: false
      }
    : undefined

  return {
    ok: true,
    notice,
    save: {
      font: {
        family: font.family,
        style: font.style,
        weight: font.weight,
        italic: font.italic,
        byteLength: bytes.length,
        numGlyphs: probe.numGlyphs,
        codePoints: probe.characterSet.length,
        fileName
      },
      bytes
    }
  }
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
  disabled,
  onNotice
}: {
  font: FontUsage
  state: FontAvailability
  all: StoredFont[]
  disabled: boolean
  onNotice: (notice: Notice) => void
}): JSX.Element {
  async function handleFiles(files: File[]): Promise<void> {
    const file = files[0]
    if (file === undefined) return

    const bytes = new Uint8Array(await file.arrayBuffer())

    let probe: FontProbe
    try {
      probe = createProbe(bytes)
    } catch {
      onNotice({ message: t('fonts.parseError', { file: file.name }), error: true })
      return
    }

    const verdict = screenUpload(bytes, file.name, probe, factsOf(probe), font, all)
    if (!verdict.ok) {
      onNotice(verdict.notice)
      return
    }
    if (verdict.notice !== undefined) onNotice(verdict.notice)
    emit<FontSaveHandler>('font:save', verdict.save)
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
            acceptedFileTypes={['font/ttf', '.ttf']}
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
