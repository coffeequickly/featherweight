import { beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_SETTINGS } from '../src/lib/types'
import { exportFrame, forgetTextPlans } from '../src/main/exporter'
import { TextPlanCache } from '../src/main/textPlan'

const plan = () => ({
  originalIds: ['one', 'two'],
  cloneCount: 2,
  hidden: [0, 1],
  sources: [],
  fallbacks: []
})

describe('TextPlanCache', () => {
  it('reuses a plan only for the same original order and detached clone shape', () => {
    const cache = new TextPlanCache()
    const value = plan()
    cache.set('frame', value)

    expect(cache.get('frame', ['one', 'two'], 2)).toBe(value)
    expect(cache.get('frame', ['two', 'one'], 2)).toBeUndefined()
  })

  it('drops a stale plan permanently after a node-count mismatch', () => {
    const cache = new TextPlanCache()
    cache.set('frame', plan())

    expect(cache.get('frame', ['one', 'two'], 3)).toBeUndefined()
    expect(cache.get('frame', ['one', 'two'], 2)).toBeUndefined()
  })

  it('rejects an invalid hidden-node index instead of risking duplicate text', () => {
    const cache = new TextPlanCache()
    cache.set('frame', { ...plan(), hidden: [2] })

    expect(cache.get('frame', ['one', 'two'], 2)).toBeUndefined()
  })

  it('clears plans at an export boundary', () => {
    const cache = new TextPlanCache()
    cache.set('frame', plan())
    cache.clear()

    expect(cache.get('frame', ['one', 'two'], 2)).toBeUndefined()
  })
})

type FakeText = {
  id: string
  type: 'TEXT'
  name: string
  visible: boolean
  parent: FakeFrame | null
  characters: string
  exportAsync: () => Promise<string>
  getStyledTextSegments: () => Array<Record<string, unknown>>
}

type FakeFrame = {
  id: string
  type: 'FRAME'
  name: string
  visible: boolean
  removed: boolean
  parent: null
  children: FakeText[]
  clone: () => FakeFrame
  exportAsync: () => Promise<Uint8Array>
  findAll: () => []
  setPluginData: () => void
  remove: () => void
}

let svgExports = 0
let validations = 0
let cloneNumber = 0
let extraTextOnSecondClone = false
let visibleTextAtPdfExport = 0

function fakeText(id: string, characters = 'Hello'): FakeText {
  return {
    id,
    type: 'TEXT',
    name: id,
    visible: true,
    parent: null,
    characters,
    absoluteTransform: [
      [1, 0, 0],
      [0, 1, 0]
    ],
    absoluteBoundingBox: { x: 10, y: 10, width: 100, height: 20 },
    absoluteRenderBounds: { x: 10, y: 10, width: 100, height: 20 },
    fills: [{ type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0 } }],
    strokes: [],
    effects: [],
    textDecoration: 'NONE',
    isMask: false,
    blendMode: 'PASS_THROUGH',
    exportAsync: async () => {
      svgExports += 1
      return '<svg><text>Hello</text></svg>'
    },
    getStyledTextSegments: () => [
      {
        start: 0,
        end: characters.length,
        fontName: { family: 'Inter', style: 'Regular' },
        fontSize: 16,
        fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }],
        letterSpacing: { unit: 'PIXELS', value: 0 },
        textDecoration: 'NONE',
        textCase: 'ORIGINAL',
        hyperlink: null,
        openTypeFeatures: {},
        listOptions: { type: 'NONE' },
        indentation: 0
      }
    ]
  } as unknown as FakeText
}

function fakeFrame(id: string, textIds: string[]): FakeFrame {
  const frame = {
    id,
    type: 'FRAME',
    name: id,
    visible: true,
    removed: false,
    parent: null,
    children: textIds.map((textId) => fakeText(textId)),
    width: 200,
    height: 100,
    x: 0,
    y: 0,
    fills: [],
    clipsContent: false,
    layoutMode: 'NONE',
    absoluteTransform: [
      [1, 0, 0],
      [0, 1, 0]
    ],
    absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 100 },
    clone: () => {
      cloneNumber += 1
      const ids =
        extraTextOnSecondClone && cloneNumber === 2
          ? textIds.map((textId) => `clone-${textId}`).concat('clone-extra')
          : textIds.map((textId) => `clone-${textId}`)
      return fakeFrame(`clone-${cloneNumber}`, ids)
    },
    exportAsync: async () => {
      visibleTextAtPdfExport += frame.children.filter((text) => text.visible).length
      return new Uint8Array([1, 2, 3])
    },
    findAll: () => [],
    setPluginData: () => undefined,
    remove() {
      frame.removed = true
    }
  } as unknown as FakeFrame
  for (const text of frame.children) text.parent = frame
  return frame
}

beforeEach(() => {
  svgExports = 0
  validations = 0
  cloneNumber = 0
  extraTextOnSecondClone = false
  visibleTextAtPdfExport = 0
  forgetTextPlans()
})

async function runTwice(frame: FakeFrame, fitToSize = true): Promise<void> {
  Object.assign(globalThis, {
    figma: {
      mixed: Symbol('mixed'),
      getNodeByIdAsync: async () => frame,
      currentPage: { appendChild: () => undefined },
      clientStorage: { getAsync: async () => undefined, setAsync: async () => undefined }
    }
  })
  const context = {
    settings: { ...DEFAULT_SETTINGS, embedText: true, fitToSize },
    sendResizeRequest: () => undefined,
    sendResizeManyRequest: () => undefined,
    onImageProgress: () => undefined,
    validateText: async (sources: Array<{ nodeId: string }>) => {
      validations += 1
      return { eligible: sources.map((source) => source.nodeId), rejected: [] }
    },
    isCancelled: () => false
  }

  expect((await exportFrame(frame.id, 0, context)).ok).toBe(true)
  expect((await exportFrame(frame.id, 0, context)).ok).toBe(true)
}

describe('fit-to-size text plan integration', () => {
  it('extracts and validates once across repeated passes', async () => {
    await runTwice(fakeFrame('frame', ['text']))

    expect(svgExports).toBe(1)
    expect(validations).toBe(1)
    expect(visibleTextAtPdfExport).toBe(0)
  })

  it('falls back to complete extraction when the detached clone shape changes', async () => {
    extraTextOnSecondClone = true
    await runTwice(fakeFrame('frame', ['text']))

    expect(svgExports).toBe(3)
    expect(validations).toBe(2)
    expect(visibleTextAtPdfExport).toBe(0)
  })

  it('does not retain plans for ordinary one-pass exports', async () => {
    await runTwice(fakeFrame('frame', ['text']), false)

    expect(svgExports).toBe(2)
    expect(validations).toBe(2)
    expect(visibleTextAtPdfExport).toBe(0)
  })
})
