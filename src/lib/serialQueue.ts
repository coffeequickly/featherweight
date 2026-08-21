// 읽고→고치고→쓰는 작업을 한 줄로 세운다. Figma·DOM 의존 금지.
//
// clientStorage 에는 트랜잭션이 없다. 인덱스를 읽어서 고쳐 쓰는 동안 다른 저장이 끼어들면
// 먼저 쓴 항목이 사라진다(폰트 4개를 한꺼번에 넣을 때 첫 번째가 없어지던 버그).

export type SerialQueue = <T>(task: () => Promise<T>) => Promise<T>

/**
 * 넘긴 순서대로 하나씩 실행한다. 앞 작업이 실패해도 뒤 작업은 계속 돌고,
 * 각 호출자는 자기 작업의 결과(또는 에러)만 받는다.
 */
export function createSerialQueue(): SerialQueue {
  let tail: Promise<unknown> = Promise.resolve()

  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task)
    tail = run.catch(() => undefined)
    return run
  }
}
