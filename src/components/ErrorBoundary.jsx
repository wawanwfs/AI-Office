import React from 'react'

// ErrorBoundary: menangkap error render React (throw di komponen mana pun)
// agar satu komponen yang gagal tidak membuat SELURUH app blank (halaman putih
// tanpa pesan — pernah terjadi saat bug TDZ di WfsPanel, 2026-10-19).
// Scene 3D punya fallback error sendiri (App.jsx sceneErr), ini khusus React tree.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { err: null }
  }

  static getDerivedStateFromError(err) {
    return { err }
  }

  componentDidCatch(err, info) {
    // tampil di console untuk debugging, tapi UI tetap hidup
    console.error('[ErrorBoundary]', err, info && info.componentStack)
  }

  render() {
    if (this.state.err) {
      return (
        <div className="error-boundary" role="alert">
          <h1>Terjadi kesalahan tampilan</h1>
          <p>
            Bagian antarmuka mengalami error, tapi kantor 3D masih berjalan.
            Coba muat ulang halaman — jika berlanjut, lapor ke WFS Project.
          </p>
          <pre>{String(this.state.err && this.state.err.message || this.state.err)}</pre>
          <button onClick={() => { this.setState({ err: null }) }}>Coba lagi</button>
          <button onClick={() => location.reload()}>Muat ulang</button>
        </div>
      )
    }
    return this.props.children
  }
}
