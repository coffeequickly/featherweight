import {
  IconButton,
  IconChevronDown24,
  IconChevronUp24,
  IconClose24,
  Muted,
  Text,
  VerticalSpace
} from '@create-figma-plugin/ui'
import { Fragment, JSX } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'

import { t } from '../lib/i18n'
import { FrameItem } from '../lib/types'

type Props = {
  items: FrameItem[]
  disabled: boolean
  onMove: (id: string, direction: -1 | 1) => void
  onReorder: (id: string, toIndex: number) => void
  /** 행 클릭: 캔버스에서 그 프레임을 보여준다 (선택은 안 바꾼다) */
  onFocus: (id: string) => void
  onExclude: (id: string) => void
}

export const ROW_HEIGHT = 44 // .frameRow 실측 높이(패딩 8 포함) — 드래그 인덱스 계산에 쓴다
const DRAG_THRESHOLD = 4 // px — 이보다 덜 움직이면 클릭으로 본다

type DragState = {
  id: string
  fromIndex: number
  /** 지금 끌려가 있는 위치 */
  toIndex: number
  startY: number
  dy: number
}

export function FrameList({
  items,
  disabled,
  onMove,
  onReorder,
  onFocus,
  onExclude
}: Props): JSX.Element {
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  dragRef.current = drag

  if (items.length === 0) {
    return (
      <div class="emptyState">
        <Text align="center">
          <Muted>{t('frames.empty')}</Muted>
        </Text>
        <VerticalSpace space="extraSmall" />
        <Text align="center">
          <Muted>{t('frames.emptyHint')}</Muted>
        </Text>
      </div>
    )
  }

  function handlePointerDown(event: PointerEvent, id: string, index: number): void {
    if (disabled) return
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    setDrag({ id, fromIndex: index, toIndex: index, startY: event.clientY, dy: 0 })
  }

  function handlePointerMove(event: PointerEvent): void {
    const current = dragRef.current
    if (current === null) return
    const dy = event.clientY - current.startY
    const offset = Math.round(dy / ROW_HEIGHT)
    const toIndex = Math.max(0, Math.min(items.length - 1, current.fromIndex + offset))
    setDrag({ ...current, dy, toIndex })
  }

  function handlePointerUp(): void {
    const current = dragRef.current
    if (current === null) return
    setDrag(null)
    if (Math.abs(current.dy) < DRAG_THRESHOLD) {
      onFocus(current.id) // 안 움직였으면 클릭 — 캔버스에서 보여준다
      return
    }
    if (current.toIndex !== current.fromIndex) onReorder(current.id, current.toIndex)
  }

  /** 끌리는 행이 지나갈 자리를 비워 주려고 나머지 행을 한 칸씩 민다 */
  function shiftFor(index: number): number {
    if (drag === null || index === drag.fromIndex) return 0
    if (drag.toIndex > drag.fromIndex && index > drag.fromIndex && index <= drag.toIndex) {
      return -ROW_HEIGHT
    }
    if (drag.toIndex < drag.fromIndex && index < drag.fromIndex && index >= drag.toIndex) {
      return ROW_HEIGHT
    }
    return 0
  }

  return (
    <Fragment>
      {items.map((item, index) => (
        <FrameRow
          key={item.id}
          item={item}
          index={index}
          first={index === 0}
          last={index === items.length - 1}
          disabled={disabled}
          dragging={drag?.id === item.id}
          shiftY={drag?.id === item.id ? drag.dy : shiftFor(index)}
          onPointerDown={(event) => handlePointerDown(event, item.id, index)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onMove={onMove}
          onExclude={onExclude}
        />
      ))}
    </Fragment>
  )
}

function FrameRow({
  item,
  index,
  first,
  last,
  disabled,
  dragging,
  shiftY,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onMove,
  onExclude
}: {
  item: FrameItem
  index: number
  first: boolean
  last: boolean
  disabled: boolean
  dragging: boolean
  shiftY: number
  onPointerDown: (event: PointerEvent) => void
  onPointerMove: (event: PointerEvent) => void
  onPointerUp: () => void
  onMove: (id: string, direction: -1 | 1) => void
  onExclude: (id: string) => void
}): JSX.Element {
  const url = useThumbUrl(item.thumb)

  return (
    <div
      class={`frameRow${dragging ? ' frameRowDragging' : ''}`}
      style={shiftY === 0 ? undefined : `transform: translateY(${shiftY}px)`}
    >
      <div
        class="frameMain"
        title={t('frames.focus')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div class="frameIndex">
          <Text>
            <Muted>{index + 1}</Muted>
          </Text>
        </div>
        {url === null ? (
          <div class="frameThumbEmpty" />
        ) : (
          <img class="frameThumb" src={url} alt="" />
        )}
        <div class="frameMeta">
          <div class="ellipsis">
            <Text>{item.name}</Text>
          </div>
          <VerticalSpace space="extraSmall" />
          <div class="ellipsis">
            <Text>
              <Muted>
                {t('frames.meta', {
                  width: item.width,
                  height: item.height,
                  images: item.imageCount,
                  texts: item.textCount
                })}
              </Muted>
            </Text>
          </div>
        </div>
      </div>
      <div class="frameActions">
        <IconButton disabled={disabled || first} onClick={() => onMove(item.id, -1)}>
          <IconChevronUp24 />
        </IconButton>
        <IconButton disabled={disabled || last} onClick={() => onMove(item.id, 1)}>
          <IconChevronDown24 />
        </IconButton>
        <IconButton disabled={disabled} onClick={() => onExclude(item.id)}>
          <IconClose24 />
        </IconButton>
      </div>
    </div>
  )
}

function useThumbUrl(thumb: Uint8Array | undefined): string | null {
  const blob = useMemo(
    () => (thumb === undefined ? null : new Blob([thumb as BlobPart], { type: 'image/png' })),
    [thumb]
  )
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (blob === null) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => {
      URL.revokeObjectURL(next)
    }
  }, [blob])

  return url
}
