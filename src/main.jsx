import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import Landing from './landing/Landing.jsx'
import ErrorBoundary from './components/ErrorBoundary'

// No App/OfficeScene, app stylesheet or data connection on the public entrance.
// Existing hash deep-links (notably #dashboard) retain their app semantics.
const isLanding = (window.location.pathname === '/' || window.location.pathname === '/index.html')
  && ['', '#choose', '#main-content'].includes(window.location.hash)
  && !new URLSearchParams(window.location.search).has('mode')
// Entry-point component is intentionally local to this single route boundary.
// eslint-disable-next-line react-refresh/only-export-components
const App = lazy(() => import('./App'))

if (!isLanding) import('./index.css')

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    {isLanding ? <Landing /> : (
      <Suspense fallback={<div className="landing-route-loading" role="status"><span>WFS HQ</span><span>Opening your workspace…</span></div>}>
        <App />
      </Suspense>
    )}
  </ErrorBoundary>
)
