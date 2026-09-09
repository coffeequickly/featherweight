import {
  Button,
  IconButton,
  IconClose24,
  IconFolder16,
  IconWarning16,
  Muted,
  Text,
  VerticalSpace
} from '@create-figma-plugin/ui'
import { emit } from '@create-figma-plugin/utilities'
import { Fragment, JSX } from 'preact'
import { useRef, useState } from 'preact/hooks'

import { t } from '../lib/i18n'
import { fontKey } from '../lib/fontInventory'
import { fontFamilies } from '../lib/fontFamilies'
import { missingFonts, uploadedProblems } from '../lib/fontStatus'
import { fitsWithin, formatBytes, remainingBytes, upsertFont, usedBytes } from '../lib/fontStore'
import { CLIENT_STORAGE_LIMIT, FontSaveHandler, FontUsage, StoredFont } from '../lib/types'
import { findFontFiles } from './fontFolder'
import { screenUpload } from './fontScreen'
import { packFont } from './fontPack'
import { FontFamilyRow } from './FontFamilyRow'
import { Section } from './Section'
import { awaitResponse, nextRequestId } from './bridge'
import { saveFoundFonts, SaveReply, SaveRequest, scanIncompleteLine } from './fontScanSave'
import {
  abortScan,
  beginRetry,
  buildScanDisplay,
  clearScan,
  countOutcomes,
  failScan,
  finishScan,
  RowOutcome,
  ScanDisplay,
  setScanProgress,
  settleRetry,
  startScan,
  useFontScanState
} from './fontScanState'

type Props = {
  fonts: FontUsage[]
  stored: StoredFont[]
  disabled: boolean
  /** 패밀리 한 줄을 누르면 그 서체의 상세로 — 손보는 일은 전부 거기서 한다 */
  onOpenFamily: (family: string) => void
  /** 저장소는 지우는 화면이 따로 있다 — 다른 문서에서 넣은 것까지 보인다 */
  onOpenStorage: () => void
}

/**
 * 문서가 쓰는 폰트와 그 폰트를 구할 수 있는지 보여준다.
 *
 * 공개 폰트는 내보낼 때 알아서 받아 온다(카탈로그). 못 구하는 서체만 사용자가 넣는다 —
 * 파일 하나씩, 또는 폰트 폴더를 통째로 골라 자동으로.
 * 파일에서 family/style 을 자동으로 읽어 자리를 정하지 않는 이유: variable 에서 뽑은 static
 * 인스턴스의 이름표가 Figma 가 부르는 이름과 어긋난다("Pretendard Variable SemiBold / Regular").
 *
 * 화면은 배너(해결로 가는 길) → 폴더 버튼 → 패밀리 목록 → 저장소 순이다. 손보는 일은
 * 목록에 두지 않고 패밀리 상세로 내린다 — 아이콘 서넛이 줄마다 붙으면 상태가 안 읽힌다.
 * 설명 문단을 늘어놓았더니 화면이 벽이 됐다(2026-09-08) — 문장은 하나씩만.
 */
export function FontPanel({
  fonts,
  stored,
  disabled,
  onOpenFamily,
  onOpenStorage
}: Props): JSX.Element {
  const missing = missingFonts(fonts, stored)
  const families = fontFamilies(fonts, stored)
  const scan = useFontScanState()
  const used = usedBytes(stored)
  const share = Math.min(1, used / CLIENT_STORAGE_LIMIT)
  // 이 문서에서 안 쓰는 것 — 공간이 모자랄 때 제일 먼저 지울 후보다
  const inUse = new Set(fonts.map((font) => fontKey(font)))
  const unused = stored.filter((font) => !inUse.has(fontKey(font)))
  const unusedBytes = unused.reduce((sum, font) => sum + font.byteLength, 0)
  // 무엇이 들어 있는지 서체 이름으로. 5MB 한도라 몇 개 안 되므로 접지 않고 다 적는다
  const storedFamilies = [...new Set(stored.map((font) => font.family))]
  const busy = disabled || scan.progress !== null

  // 배너는 맨 위 한 자리다 — 무엇이 문제인지와 다음에 뭘 하는지를 여기서만 말한다
  const files = uploadedProblems(fonts, stored)
  const banner =
    missing.length > 0
      ? {
          head: t('fonts.bannerMissing', { count: missing.length }),
          detail: t('fonts.bannerMissingDetail')
        }
      : files.length > 0
        ? {
            head: t('fonts.bannerFiles', { count: files.length }),
            detail: `${files[0].font.family} ${files[0].font.style}`
          }
        : null

  /**
   * 공간을 비운 뒤 다시 스캔 없이 — 들고 있던 압축본으로. 한도는 `have` 로 센다 — 여러 개를 이어서
   * 넣을 때 직전에 넣은 것을 빼먹으면 메인이 거절한다. 넣은 뒤의 목록을 돌려준다.
   */
  async function retry(key: string, have: readonly StoredFont[]): Promise<readonly StoredFont[]> {
    const request = scan.pending.get(key)
    if (request === undefined) return have
    // 같은 항목이 겹쳐 돌면 성공을 두 번 센다. 세대는 늦게 온 응답이 다음 스캔을 건드리지 못하게 한다
    const generation = beginRetry(key)
    if (generation === null) return have
    const failed = (error: string, storage: boolean): RowOutcome => ({
      kind: 'unsaved',
      fileName: request.font.fileName,
      bytes: request.bytes.length,
      error,
      storage,
      retry: true
    })
    if (!fitsWithin(have, request.font, request.bytes.length)) {
      settleRetry(key, failed(t('fonts.rowNoRoom'), true), generation)
      return have
    }
    const reply = await requestSave(request)
    if (reply?.ok === true) {
      settleRetry(key, null, generation)
      return upsertFont(have, request.font)
    }
    settleRetry(key, failed(reply?.error ?? t('fonts.saveNoReply'), false), generation)
    return have
  }

  async function retryAll(): Promise<void> {
    let have: readonly StoredFont[] = stored
    for (const key of [...scan.pending.keys()]) have = await retry(key, have)
  }

  return (
    <Fragment>
      {/* 해결로 가는 길은 맨 위다 — 목록 아래에 두면 다 지나야 나온다.
          스캔 전에는 무엇이 없는지, 스캔 뒤에는 무엇이 남았는지를 같은 자리가 말한다 */}
      {banner === null ? null : (
        <div class="fontBanner">
          <div class="fontBannerIcon">
            <IconWarning16 />
          </div>
          <div class="fontBannerBody">
            <div class="fontBannerHead">
              <Text>{banner.head}</Text>
            </div>
            <div class="fontBannerDetail">{banner.detail}</div>
          </div>
        </div>
      )}

      {fonts.length === 0 ? null : (
        <FolderScan missing={missing} stored={stored} disabled={busy} progress={scan.progress} />
      )}

      {scan.display === null ? null : (
        <ScanResultBox
          display={scan.display}
          pendingCount={scan.pending.size}
          free={remainingBytes(stored)}
          disabled={busy || scan.retrying.size > 0}
          onRetryAll={() => {
            void retryAll()
          }}
          onClose={clearScan}
        />
      )}

      <Section
        title={t('fonts.sectionThisFile')}
        aside={
          families.length === 0 ? undefined : (
            <Muted>{t('fonts.familyCount', { count: fonts.length })}</Muted>
          )
        }
      >
        {families.length === 0 ? (
          <Text>
            <Muted>{t('fonts.none')}</Muted>
          </Text>
        ) : (
          families.map((row) => (
            <FontFamilyRow key={row.family} row={row} onOpen={() => onOpenFamily(row.family)} />
          ))
        )}
      </Section>

      {/* 저장소는 문서와 무관한 플러그인 단위 자산이다 — 선택이 없어도 같은 자리에 있다.
          목록은 여기 두지 않는다. 지우는 일은 관리 페이지가 맡고, 여기서는 얼마나 찼는지만 */}
      <Section
        title={t('fonts.storageSection')}
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
        <div class="storageSummary">
          <div class="storageNames">
            <Text>
              {storedFamilies.length === 0 ? (
                <Muted>{t('fonts.storedNone')}</Muted>
              ) : (
                storedFamilies.join(' · ')
              )}
            </Text>
          </div>
          {stored.length === 0 ? null : (
            <button type="button" class="linkButton" onClick={onOpenStorage}>
              {t('fonts.storageManage')}
            </button>
          )}
        </div>
        {stored.length === 0 ? null : (
          <div class="storageUnused">
            <Text>
              <Muted>
                {unused.length === 0
                  ? t('fonts.storedAllInUse')
                  : t('fonts.storageUnused', {
                      count: unused.length,
                      size: formatBytes(unusedBytes)
                    })}
              </Muted>
            </Text>
          </div>
        )}
      </Section>
    </Fragment>
  )
}

/** 처음 한 번만 읽는 설명 — 늘 펼쳐 두면 매번 읽어야 할 것처럼 보인다 */
function Help(): JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <Fragment>
      <button aria-expanded={open} class="linkButton" onClick={() => setOpen(!open)} type="button">
        {t('fonts.whyFile')}
      </button>
      {open ? (
        <Fragment>
          <VerticalSpace space="extraSmall" />
          <Text>
            <Muted>{t('fonts.help')}</Muted>
          </Text>
        </Fragment>
      ) : null}
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
      <div class="rowBetween scanBoxHead">
        <div class="ellipsis">
          <Text>
            {t('fonts.scanBoxTitle')} {parts.join(' · ')}
          </Text>
        </div>
        <IconButton
          aria-label={t('fonts.scanBoxClose')}
          onClick={onClose}
          title={t('fonts.scanBoxClose')}
        >
          <IconClose24 />
        </IconButton>
      </div>
      {counts.needBytes > 0 ? (
        <div class="scanBoxLine">
          <Muted>
            {t('fonts.scanBoxStorage', {
              need: formatBytes(counts.needBytes),
              free: formatBytes(free)
            })}
          </Muted>
        </div>
      ) : null}
      {display.lines.map((line) => (
        <div class="scanBoxLine" key={line}>
          <Muted>{line}</Muted>
        </div>
      ))}
      {pendingCount > 0 ? (
        <div class="scanBoxActions">
          <Button disabled={disabled} onClick={onRetryAll} secondary>
            {t('fonts.scanBoxRetryAll', { count: pendingCount })}
          </Button>
        </div>
      ) : null}
    </div>
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

  // 넣을 것이 없으면 버튼도 안내도 필요 없다 — 도움말 링크만 남긴다
  const idle = missing.length === 0

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
    } catch (error) {
      // 스캔이 통째로 실패해도 왜 그런지는 남긴다 — 진행 표시만 지우면 사용자는 아무것도 못 본다
      failScan(
        t('fonts.scanFailed', { error: error instanceof Error ? error.message : String(error) })
      )
      abortScan()
    } finally {
      if (input.current !== null) input.current.value = ''
    }
  }

  return (
    <Fragment>
      <div class="scanRow">
        {idle ? (
          <span />
        ) : (
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
        )}
        {progress === null ? (
          <Help />
        ) : (
          <Text>
            <Muted>{t('fonts.scanning', { current: progress.done, total: progress.total })}</Muted>
          </Text>
        )}
      </div>
      {idle ? null : (
        <Fragment>
          <VerticalSpace space="extraSmall" />
          <Text>
            <Muted>{t('fonts.scanHint')}</Muted>
          </Text>
        </Fragment>
      )}
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
