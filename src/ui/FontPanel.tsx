import {
  Button,
  FileUploadButton,
  IconButton,
  IconClose24,
  IconFolder16,
  IconTrash24,
  Muted,
  Text,
  VerticalSpace
} from '@create-figma-plugin/ui'
import { emit } from '@create-figma-plugin/utilities'
import { Fragment, JSX } from 'preact'
import { useRef } from 'preact/hooks'

import { formatReason, t } from '../lib/i18n'
import { FontFacts, screenFontFile, weightMismatch } from '../lib/fontFile'
import { fontKey, weightName } from '../lib/fontInventory'
import { describeFileProblem } from './fontProblem'
import { catalogEntry } from '../lib/fontCatalog'
import { availabilityOf, FontAvailability, missingFonts } from '../lib/fontStatus'
import { fitsWithin, formatBytes, remainingBytes, upsertFont, usedBytes } from '../lib/fontStore'
import {
  CLIENT_STORAGE_LIMIT,
  FontDeleteHandler,
  FontSaveHandler,
  FontUsage,
  StoredFont
} from '../lib/types'
import { findFontFiles } from './fontFolder'
import { packFont } from './fontPack'
import { Section } from './Section'
import { collectionFaces, createProbe, factsOf, FontProbe, namesOf } from './fontkitAdapter'
import { extractFace } from '../lib/fontCollection'
import { rankFontFiles } from '../lib/fontFolder'
import { awaitResponse, nextRequestId } from './bridge'
import { saveFoundFonts, SaveReply, SaveRequest, scanIncompleteLine } from './fontScanSave'
import {
  abortScan,
  buildScanDisplay,
  clearScan,
  countOutcomes,
  finishScan,
  rowOutcomeFor,
  RowOutcome,
  ScanDisplay,
  setScanProgress,
  settleRetry,
  startScan,
  useFontScanState
} from './fontScanState'

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
 *
 * 화면은 한 섹션에 저장 공간(한 번) → 한 줄 도움말 → 폴더 버튼 → 스캔 결과(두 줄) → 행(두 줄) 순이다.
 * 폴더 스캔의 결과는 행마다 남는다 — 찾았지만 저장 못 한 것을 "파일 없음" 으로 보여 주면 사용자는
 * 폴더를 계속 다시 고른다. 설명 문단을 늘어놓았더니 화면이 벽이 됐다(2026-09-08) — 문장은 하나씩만.
 */
export function FontPanel({ fonts, stored, disabled, onNotice }: Props): JSX.Element {
  const states = fonts.map((font) => availabilityOf(font, stored))
  const missing = missingFonts(fonts, stored)
  const scan = useFontScanState()
  const used = usedBytes(stored)
  const share = Math.min(1, used / CLIENT_STORAGE_LIMIT)
  const busy = disabled || scan.progress !== null

  /**
   * 공간을 비운 뒤 다시 스캔 없이 — 들고 있던 압축본으로. 한도는 `have` 로 센다 — 여러 개를 이어서
   * 넣을 때 직전에 넣은 것을 빼먹으면 메인이 거절한다. 넣은 뒤의 목록을 돌려준다.
   */
  async function retry(key: string, have: readonly StoredFont[]): Promise<readonly StoredFont[]> {
    const request = scan.pending.get(key)
    if (request === undefined) return have
    const failed = (error: string, storage: boolean): RowOutcome => ({
      kind: 'unsaved',
      fileName: request.font.fileName,
      bytes: request.bytes.length,
      error,
      storage,
      retry: true
    })
    if (!fitsWithin(have, request.font, request.bytes.length)) {
      settleRetry(key, failed(t('fonts.rowNoRoom'), true))
      return have
    }
    const reply = await requestSave(request)
    if (reply?.ok === true) {
      settleRetry(key, null)
      return upsertFont(have, request.font)
    }
    settleRetry(key, failed(reply?.error ?? t('fonts.saveNoReply'), false))
    return have
  }

  async function retryAll(): Promise<void> {
    let have: readonly StoredFont[] = stored
    for (const key of [...scan.pending.keys()]) have = await retry(key, have)
  }

  return (
    <Fragment>
      <Section
        title={t('fonts.sectionThisFile')}
        aside={
          <Muted>
            {t('fonts.storageUsage', {
              used: formatBytes(used),
              limit: formatBytes(CLIENT_STORAGE_LIMIT)
            })}
          </Muted>
        }
      >
        <div class="storageBar">
          <div
            class={share >= 0.9 ? 'storageBarFill warn' : 'storageBarFill'}
            style={`width: ${share * 100}%`}
          />
        </div>
        <VerticalSpace space="extraSmall" />
        <Text>
          <Muted>{fonts.length === 0 ? t('fonts.none') : t('fonts.help')}</Muted>
        </Text>
        {missing.length === 0 ? null : (
          <Fragment>
            <VerticalSpace space="small" />
            <FolderScan
              missing={missing}
              stored={stored}
              disabled={busy}
              progress={scan.progress}
            />
          </Fragment>
        )}
        {scan.display === null ? null : (
          <ScanResultBox
            display={scan.display}
            pendingCount={scan.pending.size}
            free={remainingBytes(stored)}
            disabled={busy}
            onRetryAll={() => {
              void retryAll()
            }}
            onClose={clearScan}
          />
        )}
        {fonts.length === 0 ? null : <VerticalSpace space="small" />}
        {fonts.map((font, index) => (
          <FontRow
            key={fontKey(font)}
            font={font}
            state={states[index]}
            outcome={rowOutcomeFor(scan.display, font, states[index])}
            all={stored}
            disabled={busy}
            onNotice={onNotice}
            onRetry={() => {
              void retry(fontKey(font), stored)
            }}
          />
        ))}
      </Section>

      <StoredFonts stored={stored} fonts={fonts} disabled={disabled} />
    </Fragment>
  )
}

/**
 * 마지막 폴더 스캔이 어떻게 됐나 — 닫거나 다음 스캔까지 남는다. 두 줄: 넣은 수·공간 부족·없음, 그리고
 * 공간이 모자라면 필요한 양과 남은 양에 "다시 넣기". 이유별 집계는 행이 말하므로 검사 미완료만 덧붙인다.
 */
function ScanResultBox({
  display,
  pendingCount,
  free,
  disabled,
  onRetryAll,
  onClose
}: {
  display: ScanDisplay
  pendingCount: number
  free: number
  disabled: boolean
  onRetryAll: () => void
  onClose: () => void
}): JSX.Element {
  const counts = countOutcomes(display.outcomes)
  const otherFailures = counts.unsaved - counts.noRoom
  const parts: string[] = []
  if (display.saved > 0 || counts.unsaved + counts.notFound === 0) {
    parts.push(t('fonts.scanBoxSaved', { count: display.saved }))
  }
  if (counts.noRoom > 0) parts.push(t('fonts.scanBoxNoRoom', { count: counts.noRoom }))
  if (otherFailures > 0) parts.push(t('fonts.scanBoxUnsaved', { count: otherFailures }))
  if (counts.notFound > 0) parts.push(t('fonts.scanBoxNotFound', { count: counts.notFound }))
  const warn = counts.unsaved > 0 || (display.saved === 0 && counts.notFound > 0)

  return (
    <div class={warn ? 'scanBox warn' : 'scanBox'}>
      <div class="rowBetween">
        <div class="ellipsis">
          <Text>
            {t('fonts.scanBoxTitle')} {parts.join(' · ')}
          </Text>
        </div>
        <IconButton onClick={onClose}>
          <IconClose24 />
        </IconButton>
      </div>
      {counts.needBytes > 0 || pendingCount > 0 ? (
        <div class="scanBoxLine rowBetween">
          <div class="ellipsis">
            <Muted>
              {counts.needBytes > 0
                ? t('fonts.scanBoxStorage', {
                    need: formatBytes(counts.needBytes),
                    free: formatBytes(free)
                  })
                : ''}
            </Muted>
          </div>
          {pendingCount > 0 ? (
            <Button disabled={disabled} onClick={onRetryAll} secondary>
              {t('fonts.scanBoxRetryAll', { count: pendingCount })}
            </Button>
          ) : null}
        </div>
      ) : null}
      {display.lines.map((line) => (
        <div class="scanBoxLine" key={line}>
          <Muted>{line}</Muted>
        </div>
      ))}
    </div>
  )
}

/**
 * 플러그인에 넣어 둔 폰트 전부 — 이 파일이 안 쓰는 것까지.
 *
 * 저장소는 파일별이 아니라 플러그인 하나에 5MB 다. 위 목록은 이 파일이 쓰는 폰트만 보여 주므로,
 * 다른 파일에서 넣은 것은 공간을 차지하면서도 지울 길이 없었다. 여기서 보이고 지운다.
 * 무엇을 지울지는 사용자가 고른다 — 이 파일이 안 쓰는 폰트가 사용자에게 필요 없는 폰트는 아니다.
 */
function StoredFonts({
  stored,
  fonts,
  disabled
}: {
  stored: readonly StoredFont[]
  fonts: readonly FontUsage[]
  disabled: boolean
}): JSX.Element {
  const inUse = new Set(fonts.map((font) => fontKey(font)))

  return (
    <Section title={t('fonts.storedTitle')} aside={<Muted>{t('fonts.storedAside')}</Muted>}>
      {stored.length === 0 ? (
        <Text>
          <Muted>{t('fonts.storedNone')}</Muted>
        </Text>
      ) : (
        stored.map((font) => (
          <div class="fontRow" key={fontKey(font)}>
            <div class="fontRowMain">
              <div class="ellipsis">
                <Text>
                  {font.family} {font.style}
                </Text>
              </div>
              <VerticalSpace space="extraSmall" />
              <div class="ellipsis">
                <Text>
                  <Muted>
                    {font.fileName} · {formatBytes(font.byteLength)}
                    {inUse.has(fontKey(font)) ? t('fonts.storedInUse') : ''}
                  </Muted>
                </Text>
              </div>
            </div>
            <div class="fontRowActions">
              <IconButton
                disabled={disabled}
                onClick={() =>
                  emit<FontDeleteHandler>('font:delete', {
                    family: font.family,
                    style: font.style
                  })
                }
              >
                <IconTrash24 />
              </IconButton>
            </div>
          </div>
        ))
      )}
    </Section>
  )
}

/** 메인의 저장(직렬 큐)을 기다리는 한도 — 5MB 쓰기는 보통 1초 안이다 */
const SAVE_TIMEOUT_MS = 30_000

/** 메인에 저장을 요청하고 결과를 기다린다. 건마다 토스트가 줄줄이 뜨지 않게 quiet */
async function requestSave(request: SaveRequest): Promise<SaveReply> {
  const reqId = nextRequestId('save')
  const reply = awaitResponse<{ ok: boolean; error?: string }>(reqId, SAVE_TIMEOUT_MS)
  emit<FontSaveHandler>('font:save', { ...request, quiet: true, reqId })
  return await reply
}

/**
 * 폰트 폴더를 통째로 골라 없는 폰트를 한 번에 넣는다.
 *
 * 파일 선택창에 폴더 모드(webkitdirectory)가 있다 — 라이브러리 업로드 버튼에는 그 옵션이
 * 없어 input 을 직접 둔다. 폴더 안 파일은 전부 이 컴퓨터에서만 읽힌다.
 * 결과는 토스트가 아니라 fontScanState 에 남긴다 — 위의 결과 상자와 행이 그것을 보여 준다.
 */
function FolderScan({
  missing,
  stored,
  disabled,
  progress
}: {
  missing: FontUsage[]
  stored: StoredFont[]
  disabled: boolean
  progress: { done: number; total: number } | null
}): JSX.Element {
  const input = useRef<HTMLInputElement>(null)

  async function scan(files: File[]): Promise<void> {
    startScan()
    try {
      const result = await findFontFiles(files, missing, setScanProgress)

      // "추가 완료" 는 메인이 저장 결과를 돌려준 뒤에만 센다 — 한도 계산에 방금 넣은 것까지 넣는다
      const outcome = await saveFoundFonts(result, missing, stored, {
        screen: async (match, font, have) => {
          const verdict = screenUpload(
            await packFont(match.bytes),
            match.fileName,
            match.probe,
            match.facts,
            font,
            have
          )
          return verdict.ok
            ? { ok: true, save: verdict.save }
            : {
                ok: false,
                message: verdict.notice.message,
                storage: verdict.storage,
                save: verdict.save
              }
        },
        save: requestSave,
        upsert: upsertFont
      })

      const incomplete = scanIncompleteLine(result)
      const built = buildScanDisplay(
        result,
        outcome,
        missing,
        incomplete === null ? [] : [incomplete]
      )
      finishScan(built.display, built.pending)
    } catch {
      abortScan()
    } finally {
      if (input.current !== null) input.current.value = ''
    }
  }

  return (
    <Fragment>
      <div class="rowBetween">
        <Button
          disabled={disabled}
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
  | { ok: true; save: SaveRequest; notice?: Notice }
  | {
      ok: false
      notice: Notice
      /** 공간 부족으로 막혔다 — 지우면 들어간다 */
      storage?: boolean
      /** 막혔어도 압축본은 있다 — 다시 넣기용 */
      save?: SaveRequest
    }

/**
 * 파일 하나를 이 자리에 넣어도 되는가. 한 번 올리기와 폴더 스캔이 같은 문을 지난다.
 *
 * 파싱만 되면 통과시키면 안 된다 — OTF(CFF)는 텍스트 추출이 통째로 깨지고, 가변 폰트는
 * 굵기가 조용히 틀린다 (src/lib/fontFile.ts). 굵기가 어긋나도 막지는 않는다 —
 * 파일 이름표가 틀린 경우가 있다. 대신 알려 준다.
 */
function screenUpload(
  /** 실제로 저장되는 형태(압축) — 한도는 이걸로 센다 */
  packed: Uint8Array,
  fileName: string,
  probe: FontProbe,
  facts: FontFacts,
  font: FontUsage,
  all: readonly StoredFont[]
): UploadVerdict {
  const verdict = screenFontFile(facts)
  if (!verdict.ok)
    return { ok: false, notice: { message: formatReason(verdict.reason), error: true } }

  const save: SaveRequest = {
    font: {
      family: font.family,
      style: font.style,
      weight: font.weight,
      italic: font.italic,
      byteLength: packed.length,
      numGlyphs: probe.numGlyphs,
      codePoints: probe.characterSet.length,
      fileName,
      facts
    },
    bytes: packed
  }

  if (!fitsWithin(all, font, packed.length)) {
    return {
      ok: false,
      notice: {
        message: t('fonts.storageFull', { size: formatBytes(packed.length) }),
        error: true
      },
      storage: true,
      save
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

  return { ok: true, notice, save }
}

/** 못 찾은 행의 둘째 줄 — 스캔이 알아낸 이유 */
function notFoundLabel(outcome: Extract<RowOutcome, { kind: 'not-found' }>): string {
  switch (outcome.reason) {
    case 'style-missing':
      return t('fonts.rowStyleMissing')
    case 'variable-only':
      return t('fonts.rowVariableOnly')
    case 'unusable':
      return t('fonts.rowUnusable')
    case 'unchecked':
      return t('fonts.rowUnchecked')
    default:
      return t('fonts.rowNotInFolder')
  }
}

function FontRow({
  font,
  state,
  outcome,
  all,
  disabled,
  onNotice,
  onRetry
}: {
  font: FontUsage
  state: FontAvailability
  /** 마지막 폴더 스캔이 이 폰트에 대해 알아낸 것 — 없으면 null */
  outcome: RowOutcome | null
  all: StoredFont[]
  disabled: boolean
  onNotice: (notice: Notice) => void
  onRetry: () => void
}): JSX.Element {
  async function handleFiles(files: File[]): Promise<void> {
    const file = files[0]
    if (file === undefined) return

    let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer())
    let fileName = file.name

    let probe: FontProbe
    try {
      // 컬렉션(TTC)이면 이 자리에 맞는 face 를 골라 단일 폰트로 뽑는다 — macOS 기본 서체가 이 형식이다.
      // 쓸 수 있는 face(가변 아님·윤곽 있음) 중에서 고르고, 이름은 맞는데 쓸 수 없으면 그 이유를 말한다
      const faces = collectionFaces(bytes)
      if (faces !== null) {
        const candidates = faces.map((face, index) => {
          const facts = factsOf(face)
          return {
            ...namesOf(face),
            fileName: file.name,
            weightClass: facts.weightClass,
            italic: facts.italic,
            index,
            verdict: screenFontFile(facts)
          }
        })
        const ranked = rankFontFiles(font, candidates)
        const pick = ranked.find((candidate) => candidate.verdict.ok)
        if (pick === undefined) {
          const unusable = ranked[0]
          if (unusable !== undefined && !unusable.verdict.ok) {
            onNotice({ message: formatReason(unusable.verdict.reason), error: true })
            return
          }
          const listed = candidates
            .slice(0, 8)
            .map((candidate) => `${candidate.family} ${candidate.subfamily}`)
          if (candidates.length > 8) listed.push('…')
          onNotice({
            message: t('font.ttcNoFace', {
              family: font.family,
              style: font.style,
              faces: listed.join(', ')
            }),
            error: true
          })
          return
        }
        bytes = extractFace(bytes, pick.index)
        fileName = `${file.name} (${pick.subfamily})`
      }
      probe = createProbe(bytes)
    } catch {
      onNotice({ message: t('fonts.parseError', { file: file.name }), error: true })
      return
    }

    const verdict = screenUpload(await packFont(bytes), fileName, probe, factsOf(probe), font, all)
    if (!verdict.ok) {
      onNotice(verdict.notice)
      return
    }
    if (verdict.notice !== undefined) onNotice(verdict.notice)
    emit<FontSaveHandler>('font:save', verdict.save)
  }

  const problem = state.kind === 'uploaded' ? describeFileProblem(state.font) : null
  // 어떤 판을 넣는지 보여 준다 — 같은 이름의 다른 판(Inter 3.19 vs 4.0)은 폭·굵기가 다르다
  const entry = state.kind === 'catalog' ? catalogEntry(font) : undefined
  const build =
    entry?.build === undefined
      ? ''
      : t(entry.figmaBundled === true ? 'fonts.detailFigmaBuild' : 'fonts.detailBuild', {
          build: entry.build
        })
  const version =
    state.kind === 'uploaded' && state.font.facts?.version !== undefined
      ? t('fonts.detailVersion', { version: state.font.facts.version })
      : ''

  // 둘째 줄 — 상태 하나. 찾았지만 못 넣은 행은 이유를 먼저, 그다음 크기와 파일 — 한 줄이라 끝이 잘려도
  // 이유는 남는다. 다음 행동(다시 넣기)은 버튼 자리에 둔다
  const canRetry = outcome?.kind === 'unsaved' && outcome.retry
  let second: JSX.Element
  if (state.kind === 'catalog') {
    second = <Muted>{t('fonts.detailCatalog') + build}</Muted>
  } else if (state.kind === 'uploaded') {
    second = (
      <Muted>
        {t('fonts.detailUploaded', {
          file: state.font.fileName,
          size: formatBytes(state.font.byteLength)
        }) + version}
      </Muted>
    )
  } else if (outcome === null) {
    second = <Muted>{t('fonts.rowNoFile')}</Muted>
  } else if (outcome.kind === 'not-found') {
    second = <Muted>{notFoundLabel(outcome)}</Muted>
  } else {
    const tooBig = outcome.bytes !== undefined && outcome.bytes > CLIENT_STORAGE_LIMIT
    const size = outcome.bytes === undefined ? '' : ` · ${formatBytes(outcome.bytes)}`
    const why = tooBig
      ? t('fonts.rowTooBig')
      : outcome.storage
        ? t('fonts.rowNoRoom')
        : t('fonts.rowSaveFailed', { error: outcome.error })
    const next = outcome.retry || tooBig ? '' : ` · ${t('fonts.rowRescan')}`
    second = (
      <span class="fontRowWarn">
        {why}
        {size} · {outcome.fileName}
        {next}
      </span>
    )
  }

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
          <Text>{second}</Text>
        </div>
        {problem === null ? null : <div class="fontRowWarn">{problem}</div>}
      </div>
      <div class="fontRowActions">
        {canRetry ? (
          <Button disabled={disabled} onClick={onRetry} secondary>
            {t('fonts.retry')}
          </Button>
        ) : state.kind === 'catalog' ? null : (
          <FileUploadButton
            acceptedFileTypes={[
              'font/ttf',
              'font/otf',
              'font/collection',
              '.ttf',
              '.otf',
              '.ttc',
              '.otc'
            ]}
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
