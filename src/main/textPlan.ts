import { Reason, TextRunSource } from '../lib/types'

export type TextPlan = {
  /** The original nodes must still appear in exactly this order before a plan can be reused. */
  originalIds: readonly string[]
  /** Detaching instances must produce the same text-node shape on every pass. */
  cloneCount: number
  hidden: readonly number[]
  sources: readonly TextRunSource[]
  fallbacks: ReadonlyArray<{ nodeId: string; reason: Reason }>
}

/**
 * Per-export text decisions for fit-to-size's repeated passes.
 *
 * A document edit or a different detach result must miss rather than draw cached text over glyphs that
 * were not hidden. The owner clears this cache at both boundaries of every export.
 */
export class TextPlanCache {
  private plans = new Map<string, TextPlan>()

  get(frameId: string, originalIds: readonly string[], cloneCount: number): TextPlan | undefined {
    const plan = this.plans.get(frameId)
    if (
      plan === undefined ||
      plan.cloneCount !== cloneCount ||
      plan.originalIds.length !== originalIds.length ||
      plan.originalIds.some((id, index) => id !== originalIds[index]) ||
      plan.hidden.some((index) => !Number.isInteger(index) || index < 0 || index >= cloneCount)
    ) {
      // Do not let a stale plan become reusable again on a later retry in the same export.
      this.plans.delete(frameId)
      return undefined
    }
    return plan
  }

  set(frameId: string, plan: TextPlan): void {
    this.plans.set(frameId, plan)
  }

  clear(): void {
    this.plans.clear()
  }
}
