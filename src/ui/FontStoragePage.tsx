// 저장 공간 관리 — 플러그인에 넣어 둔 폰트 파일 전부.
//
// 저장소는 문서가 아니라 플러그인 단위 자산이다. 다른 파일에서 넣은 것도 여기 다 있고,
// 한도(5MB)를 넘기면 새 폰트를 못 넣는다 — 무엇이 자리를 차지하는지 보고 지울 수 있어야 한다.
//
// 이 문서에서 쓰는 것도 같이 보여 준다. 안 쓰는 것만 보여 주면 "4.2MB 가 어디서 왔지" 가
// 답이 없다. 대신 쓰는 것에는 표시를 달아, 지우면 이 문서가 아웃라인으로 나간다는 걸 알린다.

import { IconButton, IconTrash24, Muted, Text, VerticalSpace } from '@create-figma-plugin/ui'
import { emit } from '@create-figma-plugin/utilities'
import { Fragment, JSX } from 'preact'

import { fontKey } from '../lib/fontInventory'
import { formatBytes, usedBytes } from '../lib/fontStore'
import { t } from '../lib/i18n'
import { CLIENT_STORAGE_LIMIT, FontDeleteHandler, FontUsage, StoredFont } from '../lib/types'

type Props = {
  stored: StoredFont[]
  fonts: FontUsage[]
  disabled: boolean
}

export function FontStoragePage({ stored, fonts, disabled }: Props): JSX.Element {
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
      </div>
      <div class="storageBar">
        <div
          class={share >= 0.9 ? 'storageBarFill warn' : 'storageBarFill'}
          style={`width: ${share * 100}%`}
        />
      </div>
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
                        {font.fileName} · {formatBytes(font.byteLength)} ·{' '}
                        {t(mine ? 'storage.inUse' : 'storage.unused')}
                      </Muted>
                    </Text>
                  </div>
                </div>
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
