// 페이지 순서와 제외. 선택이 바뀌면 손으로 잡은 것은 버린다 — 다른 프레임들의 순서다.

import { useCallback, useEffect, useMemo, useState } from 'preact/hooks'

import { sortItems } from '../lib/order'
import { FrameItem, SortMode } from '../lib/types'

export type FrameOrder = {
  sortMode: SortMode
  /** 정렬·수동 순서를 적용한 전체 (제외된 것 포함) */
  ordered: FrameItem[]
  /** 실제로 내보낼 것들, 순서대로 */
  visible: FrameItem[]
  excluded: FrameItem[]
  /** 손으로 순서를 바꿨는가 — 체크리스트가 "순서 직접 정함" 이라고 말할 근거 */
  reordered: boolean
  sort: (mode: SortMode) => void
  move: (id: string, direction: -1 | 1) => void
  reorder: (id: string, toIndex: number) => void
  exclude: (id: string) => void
  restore: (id: string) => void
  restoreAll: () => void
}

export function useFrameOrder(items: FrameItem[], selectionSerial: number): FrameOrder {
  const [sortMode, setSortMode] = useState<SortMode>('position')
  const [excludedIds, setExcludedIds] = useState<string[]>([])
  const [manualOrder, setManualOrder] = useState<string[]>([])

  // 썸네일이 늦게 와서 items 가 바뀌는 것은 선택 변경이 아니다 — 시리얼로만 되돌린다
  useEffect(() => {
    setManualOrder([])
    setExcludedIds([])
  }, [selectionSerial])

  // 기본은 정렬 결과, 손으로 옮긴 뒤에는 그 순서를 따른다
  const ordered = useMemo(() => {
    const sorted = sortItems(items, sortMode)
    if (manualOrder.length === 0) return sorted

    const byId = new Map(sorted.map((item) => [item.id, item]))
    const picked = manualOrder
      .map((id) => byId.get(id))
      .filter((item): item is FrameItem => item !== undefined)
    const rest = sorted.filter((item) => !manualOrder.includes(item.id))
    return [...picked, ...rest]
  }, [items, sortMode, manualOrder])

  const visible = useMemo(
    () => ordered.filter((item) => !excludedIds.includes(item.id)),
    [ordered, excludedIds]
  )
  const excluded = useMemo(
    () => ordered.filter((item) => excludedIds.includes(item.id)),
    [ordered, excludedIds]
  )

  const move = useCallback(
    (id: string, direction: -1 | 1): void => {
      const ids = visible.map((item) => item.id)
      const from = ids.indexOf(id)
      const to = from + direction
      if (from === -1 || to < 0 || to >= ids.length) return
      ;[ids[from], ids[to]] = [ids[to], ids[from]]
      setManualOrder([...ids, ...excludedIds])
    },
    [visible, excludedIds]
  )

  const reorder = useCallback(
    (id: string, toIndex: number): void => {
      const ids = visible.map((item) => item.id)
      const from = ids.indexOf(id)
      if (from === -1 || toIndex === from) return
      ids.splice(from, 1)
      ids.splice(toIndex, 0, id)
      setManualOrder([...ids, ...excludedIds])
    },
    [visible, excludedIds]
  )

  const sort = useCallback((mode: SortMode): void => {
    setSortMode(mode)
    setManualOrder([])
  }, [])

  const exclude = useCallback((id: string): void => {
    setExcludedIds((previous) => [...previous, id])
  }, [])

  const restore = useCallback((id: string): void => {
    setExcludedIds((previous) => previous.filter((other) => other !== id))
  }, [])

  const restoreAll = useCallback((): void => {
    setExcludedIds([])
  }, [])

  return {
    sortMode,
    ordered,
    visible,
    excluded,
    reordered: manualOrder.length > 0,
    sort,
    move,
    reorder,
    exclude,
    restore,
    restoreAll
  }
}
