import { describe, it, expect } from 'vitest'
import { configureManualChunks } from '../lib/chunk_strategy.js'

describe('configureManualChunks — strategi pemisahan vendor chunks', () => {
  it('mengelompokkan modul Three.js ke vendor-three', () => {
    expect(configureManualChunks('/project/node_modules/three/build/three.module.js')).toBe('vendor-three')
    expect(configureManualChunks('/app/node_modules/three/examples/jsm/controls/OrbitControls.js')).toBe('vendor-three')
    expect(configureManualChunks('C:\\project\\node_modules\\three\\src\\Three.js')).toBe('vendor-three')
  })

  it('mengelompokkan react, react-dom, dan scheduler ke vendor-react', () => {
    expect(configureManualChunks('/project/node_modules/react/index.js')).toBe('vendor-react')
    expect(configureManualChunks('/project/node_modules/react-dom/client.js')).toBe('vendor-react')
    expect(configureManualChunks('/project/node_modules/scheduler/index.js')).toBe('vendor-react')
  })

  it('mengembalikan undefined untuk kode internal aplikasi (OfficeScene, komponen, lib)', () => {
    expect(configureManualChunks('/project/src/scene/OfficeScene.js')).toBeUndefined()
    expect(configureManualChunks('/project/src/components/TaskBoard.jsx')).toBeUndefined()
    expect(configureManualChunks('/project/src/lib/api.js')).toBeUndefined()
  })

  it('menangani input tidak valid dengan aman (null, undefined, non-string)', () => {
    expect(configureManualChunks(null)).toBeUndefined()
    expect(configureManualChunks(undefined)).toBeUndefined()
    expect(configureManualChunks('')).toBeUndefined()
    expect(configureManualChunks(123)).toBeUndefined()
    expect(configureManualChunks({})).toBeUndefined()
  })
})
