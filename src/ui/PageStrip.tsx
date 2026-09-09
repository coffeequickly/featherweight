// 시작 탭 아래 — 무엇을 뽑는지 눈으로 확인하는 자리.
//
// 앞 몇 장만 그린다. 전체 목록은 정렬 탭이 맡는다 — 썸네일은 장당 exportAsync 라
// 서른 장을 다 그리면 여는 속도만 버린다(selection.ts 의 renderThumbs 주석).

import { Muted, Text } from '@create-figma-plugin/ui'
import { JSX } from 'preact'

import { t } from '../lib/i18n'
import { FrameItem } from '../lib/types'
import { useThumbUrl } from './FrameList'

/** 시작 탭에 그리는 장수. 메인에 이 수만큼만 썸네일을 요청한다 */
export const PAGES_SHOWN = 4

type Props = {
  items: FrameItem[]
  onGo: () => void
}

export function PageStrip({ items, onGo }: Props): JSX.Element | null {
  if (items.length === 0) return null
  const rest = items.length - PAGES_SHOWN

  return (
    <div class="pageStrip">
      <div class="pageStripHead">
        <Text>
          <Muted>{t('start.pagesTitle')}</Muted>
        </Text>
        {items.length < 2 ? null : (
          <button type="button" class="linkButton" onClick={onGo}>
            {t('tab.order')}
          </button>
        )}
      </div>
      <div class="pageStripRow">
        {items.slice(0, PAGES_SHOWN).map((item, index) => (
          <Page key={item.id} item={item} index={index} />
        ))}
        {rest <= 0 ? null : (
          <div class="pageMore">
            <Text>
              <Muted>{t('start.pagesMore', { count: rest })}</Muted>
            </Text>
          </div>
        )}
      </div>
    </div>
  )
}

function Page({ item, index }: { item: FrameItem; index: number }): JSX.Element {
  const url = useThumbUrl(item.thumb)

  return (
    <div class="pageCell" title={item.name}>
      {/* 정사각 칸에 비율을 지켜 담는다 — 칸마다 높이가 다르면 줄이 들쭉날쭉해진다.
          세로 문서와 슬라이드는 칸 안에서 남는 여백으로 구분된다 */}
      <div class="pageThumb">
        {url === null ? null : <img class="pageThumbImg" src={url} alt="" />}
      </div>
      <div class="pageNo">
        <Text>
          <Muted>{index + 1}</Muted>
        </Text>
      </div>
    </div>
  )
}
