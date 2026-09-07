// 플러그인이 만든 임시 클론의 소유권 표식. (PRD §7.4-0, G4)
//
// 이름(`__sheaf_tmp__`)만으로는 "우리 것" 이라는 근거가 못 된다 — 사용자가 우연히 같은 이름을
// 붙인 프레임을 잔존 정리가 지워 버린다. pluginData 는 이 플러그인만 읽고 쓰므로 소유권 그 자체다.

import { TMP_MARK_KEY, TMP_NODE_NAME } from '../lib/types'

/** 클론을 우리 것으로 표시한다. 이름은 사람이 보라고, 표식은 코드가 보라고 붙인다. */
export function markTemporary(node: SceneNode): void {
  node.name = TMP_NODE_NAME
  node.setPluginData(TMP_MARK_KEY, '1')
}

export function isTemporary(node: BaseNode): boolean {
  return node.getPluginData(TMP_MARK_KEY) !== ''
}
