import {
  Button,
  FileUploadButton,
  IconButton,
  IconFolder16,
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
import { fontKey, weightName } from '../lib/fontInventory'
import { describeFileProblem } from './fontProblem'
import { availabilityOf, FontAvailability, missingFonts } from '../lib/fontStatus'
import { fitsWithin, formatBytes, upsertFont } from '../lib/fontStore'
import { FontDeleteHandler, FontSaveHandler, FontUsage, StoredFont } from '../lib/types'
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
        // 건마다 토스트가 줄줄이 뜨지 않게 — 아래에서 한 번에 "6종 중 6종" 으로 알린다
        emit<FontSaveHandler>('font:save', { ...verdict.save, quiet: true })
        have = upsertFont(have, verdict.save.font)
        saved += 1
      }

      if (found.size === 0) {
        onNotice({ message: t('fonts.scanNone'), error: true })
        return
      }
      // "6종 중 6종" 은 셈을 시키는 문장이다 — 넣은 수를 말하고, 못 넣은 이유만 뒤에 붙인다
      const notInFolder = missing.length - found.size
      onNotice({
        message:
          t('fonts.scanResult', { found: saved }) +
          (notInFolder > 0 ? t('fonts.scanRest', { count: notInFolder }) : '') +
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
          onClick={() => {
            const element = input.current
            if (element === null) return
            // Preact 는 `webkitdirectory` 를 프로퍼티로 넣는다 — JSX 의 '' 는 false 가 돼 폴더
            // 모드가 안 켜지고 파일 여러 개 고르기 창이 떴다 (사용자 둘이 실측). 열기 직전에
            // 속성으로 직접 켠다. 속성이 있으면 프로퍼티도 true 다.
            element.setAttribute('webkitdirectory', '')
            element.setAttribute('directory', '')
            element.click()
          }}
          secondary
        >
          <span class="buttonWithIcon">
            <IconFolder16 />
            {t('fonts.scanFolder')}
          </span>
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
          fileStyle: weightName(mismatch.fileWeight, mismatch.fileItalic),
          slotStyle: `${font.family} ${font.style}`
        }),
        // 주의 문구는 패널 띠에 — 토스트로 흘려보내면 굵기가 다른 채로 넣은 걸 놓친다
        error: true
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
        fileName,
        facts
      },
      bytes
    }
  }
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

  const problem = state.kind === 'uploaded' ? describeFileProblem(state.font) : null
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
        {problem === null ? null : <div class="fontRowWarn">{problem}</div>}
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
