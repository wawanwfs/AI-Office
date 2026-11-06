// @vitest-environment jsdom
import { it, expect, vi } from 'vitest'

it('suspends animation offscreen, hidden, reduced-motion; releases its frame and listeners', async () => {
  const { createRenderLoop } = await import('../landing/renderLoop.js')
  const frames = new Map(); let id = 0
  const request = vi.fn(fn => { frames.set(++id, fn); return id })
  const cancel = vi.fn(key => frames.delete(key))
  const render = vi.fn()
  const loop = createRenderLoop({ render, request, cancel })
  loop.setVisible(true)
  expect(request).toHaveBeenCalledTimes(1)
  loop.setVisible(false)
  expect(frames.size).toBe(0)
  loop.setVisible(true)
  loop.setHidden(true)
  expect(frames.size).toBe(0)
  loop.setHidden(false)
  loop.setReduced(true)
  expect(frames.size).toBe(0)
  expect(render).toHaveBeenCalled()
  loop.setReduced(false)
  const callback = frames.values().next().value
  frames.clear(); callback(100)
  expect(render).toHaveBeenCalledWith(100)
  loop.dispose()
  expect(frames.size).toBe(0)
  loop.setVisible(true)
  expect(frames.size).toBe(0)
})
