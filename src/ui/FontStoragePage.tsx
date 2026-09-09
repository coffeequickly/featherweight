// 저장 공간 관리 — 플러그인에 넣어 둔 폰트 파일 전부.
//
// 저장소는 문서가 아니라 플러그인 단위 자산이다. 다른 파일에서 넣은 것도 여기 다 있고,
// 한도(5MB)를 넘기면 새 폰트를 못 넣는다 — 무엇이 자리를 차지하는지 보고 지울 수 있어야 한다.
//
// 이 문서에서 쓰는 것도 같이 보여 준다. 안 쓰는 것만 보여 주면 "4.2MB 가 어디서 왔지" 가
// 답이 없다. 대신 쓰는 것에는 표시를 달아, 지우면 이 문서가 아웃라인으로 나간다는 걸 알린다.

import {
  Button,
  IconButton,
  IconTrash24,
  Muted,
  Text,
  VerticalSpace
} from '@create-figma-plugin/ui'
import { emit } from '@create-figma-plugin/utilities'
import { Fragment, JSX } from 'preact'
import { useState } from 'preact/hooks'

import { fontKey } from '../lib/fontInventory'
import { formatBytes, usedBytes } from '../lib/fontStore'
import { t } from '../lib/i18n'
import {
  CLIENT_STORAGE_LIMIT,
  FontClearHandler,
  FontDeleteHandler,
  FontUsage,
  StoredFont
} from '../lib/types'

type Props = {
  stored: StoredFont[]
  fonts: FontUsage[]
  disabled: boolean
}

export function FontStoragePage({ stored, fonts, disabled }: Props): JSX.Element {
  // 되돌릴 수 없는 일이라 두 번 누르게 한다. 플러그인 iframe 에서 confirm() 은 창을 얼린다
  const [asking, setAsking] = useState(false)
  const inUse = new Set(fonts.map((font) => fontKey(font)))
  const used = usedBytes(stored)
  const share = Math.min(1, used / CLIENT_STORAGE_LIMIT)

  // 이 문서에서 안 쓰는 것이 위로 — 지워도 이 문서에는 아무 일이 없는 쪽이다
  const rows = [...stored].sort((a, b) => {
    const mine = Number(inUse.has(fontKey(a))) - Number(inUse.has(fontKey(b)))
    return mine || b.byteLength - a.byteLength
  })

  return (
    <Fragment>
      <VerticalSpace space="small" />
      <div class="rowBetween">
        <Text>
          <Muted>
            {t('fonts.storageUsage', {
              used: formatBytes(used),
              limit: formatBytes(CLIENT_STORAGE_LIMIT)
            })}
          </Muted>
        </Text>
        {rows.length === 0 || asking ? null : (
          <button type="button" class="linkButton danger" onClick={() => setAsking(true)}>
            {t('storage.clear')}
          </button>
        )}
      </div>
      <div class="storageBar">
        <div
          class={share >= 0.9 ? 'storageBarFill warn' : 'storageBarFill'}
          style={`width: ${share * 100}%`}
        />
      </div>
      {asking ? (
        <div class="storageAsk">
          <div class="storageAskText">
            <Text>{t('storage.clearAsk', { count: rows.length })}</Text>
          </div>
          <div class="storageAskButtons">
            <Button
              danger
              disabled={disabled}
              onClick={() => {
                emit<FontClearHandler>('fonts:clear')
                setAsking(false)
              }}
            >
              {t('storage.clearGo')}
            </Button>
            <Button onClick={() => setAsking(false)} secondary>
              {t('app.cancel')}
            </Button>
          </div>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <Fragment>
          <VerticalSpace space="medium" />
          <Text>
            <Muted>{t('storage.empty')}</Muted>
          </Text>
        </Fragment>
      ) : (
        <div class="storageList">
          <div class="storageListTitle">
            <Text>
              <Muted>{t('storage.listTitle')}</Muted>
            </Text>
          </div>
          {rows.map((font) => {
            const mine = inUse.has(fontKey(font))
            return (
              <div class="storageRow" key={fontKey(font)}>
                <div class="storageRowBody">
                  <div class="ellipsis">
                    <Text>
                      {font.family} {font.style}
                    </Text>
                  </div>
                  <div class="storageRowMeta ellipsis">
                    <Text>
                      <Muted>
                        {font.fileName} · {formatBytes(font.byteLength)}
                      </Muted>
                    </Text>
                  </div>
                </div>
                {/* 쓰는지 여부는 지우기 버튼 옆에 둔다 — 지울지 말지를 그 자리에서 판단한다 */}
                <span class="storageRowUse">
                  <Text>
                    <Muted>{t(mine ? 'storage.inUse' : 'storage.unused')}</Muted>
                  </Text>
                </span>
                <IconButton
                  aria-label={t('fonts.deleteFor', { font: `${font.family} ${font.style}` })}
                  disabled={disabled}
                  onClick={() =>
                    emit<FontDeleteHandler>('font:delete', {
                      family: font.family,
                      style: font.style
                    })
                  }
                  title={t('fonts.delete')}
                >
                  <IconTrash24 />
                </IconButton>
              </div>
            )
          })}
        </div>
      )}
    </Fragment>
  )
}
