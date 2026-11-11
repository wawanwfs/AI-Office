import React, { useEffect, useRef, useState } from 'react'
import { createRenderLoop } from './renderLoop.js'
import {
  PEARL_LIGHT, PEARL_MID, PEARL_DEEP, PEARL_EDGE,
  BRASS_LIGHT, BRASS_DEEP, BRASS_MID, RING_SHADOW, RING_DEEP,
} from '../lib/ui_palette.js'

// Self-contained illustration. It is not a preview or import of OfficeScene.
export default function OrbitalSculpture() {
  const host = useRef(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const element = host.current
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    let dead = false, renderer, scene, loop, observer, resizeObserver
    let release = () => {}
    const loseContext = event => {
      event.preventDefault()
      loop?.dispose()
      if (!dead) setReady(false)
    }
    const visibility = () => loop?.setHidden(document.hidden)
    const motion = () => loop?.setReduced(media.matches)
    // Reduced motion uses the full, static vector artwork and needs no WebGL download.
    if (media.matches || !window.WebGLRenderingContext) return
    import('three').then(THREE => {
      if (dead) return
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35))
        renderer.setClearColor(0x000000, 0)
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.toneMapping = THREE.ACESFilmicToneMapping
        scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80)
        camera.position.set(0, 1.3, 13)
        camera.lookAt(0, 0, 0)
        scene.add(new THREE.HemisphereLight(0xffffff, 0x385479, 3.1))
        const key = new THREE.DirectionalLight(0xfff2d7, 4.0)
        key.position.set(-3, 5, 6); scene.add(key)
        const fill = new THREE.DirectionalLight(0x9bbcff, 2.0)
        fill.position.set(4, -1, 2); scene.add(fill)
        const sculpture = new THREE.Group()
        sculpture.rotation.set(0.28, -0.32, -0.25)
        scene.add(sculpture)
        const pearl = new THREE.MeshStandardMaterial({ color: 0xc7d8e5, metalness: 0.5, roughness: 0.27 })
        const blue = new THREE.MeshStandardMaterial({ color: 0x3c638a, metalness: 0.6, roughness: 0.32 })
        const brass = new THREE.MeshStandardMaterial({ color: 0xd9ab67, metalness: 0.65, roughness: 0.29 })
        const ringGeometry = (outer, inner, depth) => {
          const shape = new THREE.Shape()
          shape.absarc(0, 0, outer, 0, Math.PI * 2, false)
          const hole = new THREE.Path()
          hole.absarc(0, 0, inner, 0, Math.PI * 2, true)
          shape.holes.push(hole)
          const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.035, bevelThickness: 0.035, curveSegments: 64 })
          geo.translate(0, 0, -depth / 2)
          return geo
        }
        const outer = new THREE.Mesh(ringGeometry(2.85, 2.3, 0.27), pearl)
        outer.rotation.x = 0.78; sculpture.add(outer)
        const orbit = new THREE.Mesh(ringGeometry(2.55, 2.39, 0.16), brass)
        orbit.rotation.set(-0.64, 0.75, 0.35); sculpture.add(orbit)
        const inner = new THREE.Mesh(ringGeometry(1.8, 1.22, 0.38), blue)
        inner.rotation.set(1.32, -0.3, 0.1); sculpture.add(inner)
        const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.84, 1), pearl)
        core.rotation.z = 0.25; sculpture.add(core)
        const columns = new THREE.InstancedMesh(new THREE.BoxGeometry(0.10, 0.45, 0.18), pearl, 32)
        const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), position = new THREE.Vector3(), scale = new THREE.Vector3(1, 1, 1)
        for (let i = 0; i < 32; i++) {
          const angle = i / 32 * Math.PI * 2
          position.set(Math.cos(angle) * 2.57, Math.sin(angle) * 2.57, 0.35)
          quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle - Math.PI / 2)
          matrix.compose(position, quaternion, scale); columns.setMatrixAt(i, matrix)
        }
        outer.add(columns)
        const satellite = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), brass)
        satellite.position.set(2.4, 1.25, 0.7); sculpture.add(satellite)
        renderer.domElement.setAttribute('aria-hidden', 'true')
        renderer.domElement.addEventListener('webglcontextlost', loseContext)
        element.appendChild(renderer.domElement)
        let previous = 0, phase = 0
        const draw = time => {
          // Cap animation at 30fps; no catch-up jumps when returning to a tab.
          if (time && time - previous < 32) return
          phase += time ? Math.min((time - previous) / 1000, 0.04) : 0
          previous = time
          sculpture.rotation.y = -0.32 + Math.sin(phase * 0.16) * 0.24
          sculpture.position.y = Math.sin(phase * 0.45) * 0.09
          renderer.render(scene, camera)
        }
        loop = createRenderLoop({ render: draw })
        const resize = () => {
          const width = element.clientWidth, height = element.clientHeight
          if (!width || !height) return
          renderer.setSize(width, height)
          camera.aspect = width / height
          camera.position.z = camera.aspect < 0.9 ? 16 : 13
          camera.updateProjectionMatrix()
          loop.invalidate()
        }
        resizeObserver = new ResizeObserver(resize); resizeObserver.observe(element); resize()
        observer = new IntersectionObserver(entries => loop.setVisible(entries[0].isIntersecting), { threshold: 0.01 })
        observer.observe(element)
        loop.setReduced(media.matches); loop.setHidden(document.hidden)
        document.addEventListener('visibilitychange', visibility)
        media.addEventListener('change', motion)
        setReady(true)
      } catch {
        // DOM artwork and navigation remain usable if context allocation fails.
        renderer?.dispose()
        renderer?.domElement.remove()
      }
    }).catch(() => { /* Offline chunk failure leaves the static artwork intact. */ })
    release = () => {
      loop?.dispose(); observer?.disconnect(); resizeObserver?.disconnect()
      document.removeEventListener('visibilitychange', visibility)
      media.removeEventListener('change', motion)
      const geometries = new Set(), materials = new Set()
      scene?.traverse(object => {
        if (object.geometry) geometries.add(object.geometry)
        if (object.material) materials.add(object.material)
        if (object.isInstancedMesh) object.dispose()
      })
      geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose())
      renderer?.domElement.removeEventListener('webglcontextlost', loseContext)
      renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove()
    }
    return () => { dead = true; release() }
  }, [])
  return (
    <div ref={host} className={`landing-sculpture${ready ? ' is-webgl' : ''}`} role="img" aria-label="Orbital Commons: interlocking architectural rings around a shared centre">
      <svg className="landing-sculpture-fallback" viewBox="0 0 720 660" aria-hidden="true">
        <defs>
          <linearGradient id="orbital-pearl" x1="0" y1="0" x2="1" y2="1"><stop stopColor={PEARL_LIGHT} /><stop offset=".45" stopColor={PEARL_MID} /><stop offset="1" stopColor={PEARL_DEEP} /></linearGradient>
          <linearGradient id="orbital-brass"><stop stopColor={BRASS_LIGHT} /><stop offset=".5" stopColor={BRASS_DEEP} /><stop offset="1" stopColor={BRASS_MID} /></linearGradient>
        </defs>
        <g transform="translate(360 320) rotate(-24)">
          <ellipse cy="12" rx="244" ry="161" fill="none" stroke={RING_SHADOW} strokeWidth="43" />
          <ellipse rx="244" ry="161" fill="none" stroke="url(#orbital-pearl)" strokeWidth="38" />
          <ellipse rx="183" ry="111" transform="rotate(72)" fill="none" stroke={RING_DEEP} strokeWidth="42" />
          <path d="M-66-23 0-79 69-25 47 57-35 68-66-23" fill="url(#orbital-pearl)" /><path d="m0-79 9 88 60-34M9 9l38 48M9 9l-44 59M9 9l-75-32" fill="none" stroke={PEARL_EDGE} strokeWidth="1" />
          <ellipse rx="268" ry="102" transform="rotate(-49)" fill="none" stroke="url(#orbital-brass)" strokeWidth="12" />
          <circle cx="233" cy="-101" r="15" fill="url(#orbital-brass)" />
        </g>
      </svg>
      <span className="landing-sculpture-floor" aria-hidden="true" />
    </div>
  )
}
