import React from 'react'
import OrbitalSculpture from './OrbitalSculpture.jsx'
import './landing.css'

export default function Landing() {
  return (
    <main className="hq-landing" id="main-content">
      <header className="landing-header">
        <a className="landing-brand" href="/" aria-label="WFS HQ home"><span className="landing-monogram" aria-hidden="true">w.</span><span>WFS <b>HQ</b></span></a>
        <span className="landing-header-note">A place for human ambition.<br />A workspace for AI.</span>
        <a className="landing-header-link" href="#choose">Find your workspace <span aria-hidden="true">↗</span></a>
      </header>
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <p className="landing-eyebrow">HUMAN DIRECTION. ARTIFICIAL INTELLIGENCE.</p>
          <h1 id="landing-title">A new shape<br />of <em>work.</em></h1>
          <p className="landing-intro">Your ideas, with room to become real.<br />Direct your AI team. See the bigger picture.</p>
          <a className="landing-explore" href="#choose">Choose your workspace <span aria-hidden="true">↓</span></a>
        </div>
        <OrbitalSculpture />
        <div className="landing-art-caption"><span>THE ORBITAL COMMONS</span><span>A study in working together</span></div>
      </section>
      <section className="landing-choices" id="choose" aria-labelledby="landing-choose-title">
        <div className="landing-choice-heading"><p className="landing-eyebrow">YOUR WORKSPACE, YOUR PERSPECTIVE</p><h2 id="landing-choose-title">Two ways in.<br />One place to build.</h2></div>
        <a className="landing-choice landing-choice-dashboard" href="/app/?mode=dashboard" aria-label="Open dashboard">
          <span className="landing-choice-top"><span className="landing-choice-icon" aria-hidden="true">▤</span><span>FOCUS ON THE WORK</span><span className="landing-choice-arrow" aria-hidden="true">↗</span></span>
          <h3>Dashboard</h3><p>Tasks, conversations, and your team.<br />A clear view, without the 3D scene.</p><span className="landing-choice-action">Open dashboard <span aria-hidden="true">→</span></span>
        </a>
        <a className="landing-choice landing-choice-office" href="/app/?mode=office" aria-label="Enter full AI office">
          <span className="landing-choice-top"><span className="landing-choice-icon" aria-hidden="true">◇</span><span>STEP INTO THE SPACE</span><span className="landing-choice-arrow" aria-hidden="true">↗</span></span>
          <h3>Full AI Office</h3><p>Meet your team in a shared 3D workspace.<br />Explore the office. Follow the work.</p><span className="landing-choice-action">Enter full AI office <span aria-hidden="true">→</span></span>
        </a>
      </section>
      <footer className="landing-footer"><span>WFS PROJECT HQ</span><span>Built for ideas that need a team.</span><a href="#main-content">Back to top ↑</a></footer>
    </main>
  )
}
