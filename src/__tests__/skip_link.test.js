// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import SkipLink from '../components/SkipLink.jsx'

const h = React.createElement

afterEach(() => { cleanup(); document.body.innerHTML = '' })

describe('components/SkipLink', () => {
  it('render anchor skip-link menuju #wfs-panel', () => {
    render(h(SkipLink))
    const link = screen.getByRole('link', { name: 'Lewati ke panel Chat' })
    expect(link.getAttribute('href')).toBe('#wfs-panel')
    expect(link.className).toContain('skip-link')
  })

  it('menerima fokus → class vis ditambah; blur → dihapus', () => {
    render(h(SkipLink))
    const link = screen.getByRole('link')
    fireEvent.focus(link)
    expect(link.className).toContain('vis')
    fireEvent.blur(link)
    expect(link.className).not.toContain('vis')
  })

  it('klik memindahkan fokus ke input chat saat panel sudah terbuka', () => {
    const ta = document.createElement('textarea')
    const panel = document.createElement('div')
    panel.id = 'wfs-panel'
    panel.appendChild(ta)
    document.body.appendChild(panel)
    render(h(SkipLink))
    fireEvent.click(screen.getByRole('link'))
    expect(document.activeElement).toBe(ta)
  })

  it('klik saat panel tertutup → tombol pembuka diklik lalu fokus ke input', () => {
    const btn = document.createElement('button')
    btn.setAttribute('aria-controls', 'wfs-panel')
    btn.addEventListener('click', () => {
      const p = document.createElement('div')
      p.id = 'wfs-panel'
      const input = document.createElement('textarea')
      p.appendChild(input)
      document.body.appendChild(p)
    })
    document.body.appendChild(btn)
    render(h(SkipLink))
    fireEvent.click(screen.getByRole('link'))
    expect(document.activeElement).toBe(document.querySelector('#wfs-panel textarea'))
  })
})
