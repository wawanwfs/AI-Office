export function createRenderLoop({ render, request = requestAnimationFrame, cancel = cancelAnimationFrame }) {
  let visible = false, hidden = false, reduced = false, disposed = false, frame = null
  const stop = () => { if (frame !== null) cancel(frame); frame = null }
  const tick = time => {
    frame = null
    if (disposed || !visible || hidden || reduced) return
    render(time)
    frame = request(tick)
  }
  const sync = () => {
    stop()
    if (disposed || !visible || hidden) return
    if (reduced) render(0)
    else frame = request(tick)
  }
  return {
    setVisible(value) { visible = value; sync() },
    setHidden(value) { hidden = value; sync() },
    setReduced(value) { reduced = value; sync() },
    invalidate() { if (!disposed && visible && !hidden && reduced) render(0) },
    dispose() { disposed = true; stop() },
  }
}
