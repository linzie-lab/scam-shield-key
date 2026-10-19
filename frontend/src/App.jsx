import { useEffect, useState } from 'react'
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { analyzeContent } from './lib/api.js'
import './App.css'

function ShieldMark({ small = false }) {
  return (
    <svg
      aria-hidden="true"
      className={small ? 'shield-mark shield-mark-small' : 'shield-mark'}
      viewBox="0 0 40 40"
      fill="none"
    >
      <path
        d="M20 3.5 34 9v10.4c0 8.4-5.8 14.7-14 17.1C11.8 34.1 6 27.8 6 19.4V9l14-5.5Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="m13.5 20.2 4.2 4.2 9-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Icon({ name, className = '' }) {
  const paths = {
    scan: <><path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4m12-5v4a1 1 0 0 1-1 1h-4" /><path d="m9 12 2 2 4-4" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.1 0l3-3A5 5 0 0 0 13 2.9l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7" /></>,
    alert: <><path d="m10.3 3.9-8 13.8A2 2 0 0 0 4 20.7h16a2 2 0 0 0 1.7-3l-8-13.8a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></>,
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" /><path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    key: <><circle cx="8" cy="15" r="4" /><path d="m10.8 12.2 7-7a2.1 2.1 0 0 1 3 3l-1.3 1.3-2-2-2 2 2 2-2 2" /></>,
    gift: <><rect x="3" y="8" width="18" height="13" rx="2" /><path d="M12 8v13M3 12h18M12 8H7.5a2.5 2.5 0 1 1 2.4-3.2L12 8Zm0 0h4.5a2.5 2.5 0 1 0-2.4-3.2L12 8Z" /></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 1 1 8 0v3m-4 4v3" /></>,
    shield: <><path d="M12 3 20 6v5.5c0 4.7-3.2 8.2-8 9.5-4.8-1.3-8-4.8-8-9.5V6l8-3Z" /><path d="m8.5 12 2.3 2.3 4.7-4.7" /></>,
  }

  return (
    <svg
      aria-hidden="true"
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  )
}

function getIndicatorIcon(id) {
  if (id === 'urgency') return 'clock'
  if (id === 'credentials' || id === 'account-verification' || id === 'sensitive-information') return 'key'
  if (id === 'payment') return 'gift'
  if (id === 'secrecy') return 'lock'
  if (id.startsWith('http-') || id.startsWith('short-link-') || id.startsWith('ip-link-')) return 'link'
  return 'alert'
}

function ScannerPage() {
  const [content, setContent] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [error, setError] = useState('')
  const [speechMessage, setSpeechMessage] = useState('')
  const [analyzing, setAnalyzing] = useState(false)

  useEffect(() => () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
  }, [])

  async function handleAnalyze(event) {
    event.preventDefault()
    const trimmedContent = content.trim()

    if (!trimmedContent) {
      setError('Paste a message or URL above to start your check.')
      setAnalysis(null)
      return
    }

    setError('')
    setSpeechMessage('')
    setAnalysis(null)
    setAnalyzing(true)
    let result
    try {
      result = await analyzeContent(trimmedContent)
      setAnalysis(result)
    } catch (analysisError) {
      setError(analysisError.message || 'The message could not be analyzed. Please try again.')
      return
    } finally {
      setAnalyzing(false)
    }

  }

  function handleClear() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    setContent('')
    setAnalysis(null)
    setError('')
    setSpeechMessage('')
  }

  function handleReadResults() {
    if (
      typeof window === 'undefined'
      || !window.speechSynthesis
      || typeof window.SpeechSynthesisUtterance !== 'function'
    ) {
      setSpeechMessage('Audio reading is unavailable in this browser. You can read the results and next step on screen.')
      return
    }

    const indicators = analysis.indicators
    const summary = `${analysis.explanation} Preliminary risk level: ${analysis.risk_level}.`
    const warnings = indicators.map(({ title }) => title).join('. ')
    const nextStep = `Recommended safety advice: ${analysis.safety_advice.join(' ')}`
    const spokenResults = [summary, warnings, nextStep].filter(Boolean).join(' ')

    try {
      window.speechSynthesis.cancel()
      const utterance = new window.SpeechSynthesisUtterance(spokenResults)
      utterance.onerror = () => {
        setSpeechMessage('Could not read the results aloud. You can read the summary and next step on screen.')
      }
      setSpeechMessage('')
      window.speechSynthesis.speak(utterance)
    } catch {
      setSpeechMessage('Could not read the results aloud. You can read the summary and next step on screen.')
    }
  }

  return (
    <main id="top">
        <section className="home-section" aria-labelledby="hero-title">
          <div className="intro">
            <div className="intro-copy">
              <p className="intro-eyebrow"><span /> YOUR MESSAGE SAFETY CHECK</p>
              <h1 id="hero-title">Protect yourself from<br /><span>scam messages.</span></h1>
              <p>Paste a message to check for common warning signs.</p>
            </div>
            <img className="hero-illustration" src="/privacy-shield.svg" alt="An illustrated shield protecting a message" />
          </div>

          <form className="analyzer-card" onSubmit={handleAnalyze} noValidate>
            <div className="input-heading">
              <span className="input-icon"><Icon name="link" /></span>
              <label htmlFor="content-input">Your message</label>
              <img className="message-illustration" src="/message-check.svg" alt="" aria-hidden="true" />
            </div>
            <textarea
              id="content-input"
              value={content}
              disabled={analyzing}
              onChange={(event) => {
                setContent(event.target.value)
                if (error) setError('')
              }}
              placeholder="Paste or type the suspicious message here..."
              rows="5"
              aria-describedby={error ? 'input-error' : undefined}
              aria-invalid={Boolean(error)}
            />
            {error && <p id="input-error" className="input-error" role="alert"><Icon name="alert" />{error}</p>}
            <div className="form-actions">
              <button className="analyze-button" disabled={analyzing} type="submit">
                {analyzing && <span className="loading-spinner" aria-hidden="true" />}
                <Icon name="scan" />{analyzing ? 'Analyzing…' : 'Analyze Message'}
              </button>
              <button className="clear-button" disabled={analyzing} type="button" onClick={handleClear}>Clear</button>
            </div>
            <p className="scan-availability">Free to use. Your message is not saved.</p>
          </form>

          <p className="demo-note"><Icon name="info" />Preliminary checks only. No live threat database lookup.</p>

          {analysis !== null && (
            <section className={`results-card ${analysis.indicators.length ? 'results-warning' : 'results-clear'}`} aria-labelledby="results-title" aria-live="polite">
              <div className="results-header">
                <span className="summary-icon">
                  <Icon name={analysis.indicators.length ? 'alert' : 'shield'} />
                </span>
                <div className="results-summary">
                  <p className="summary-label">{analysis.indicators.length ? 'PLEASE TAKE A CLOSER LOOK' : 'CHECK COMPLETE'}</p>
                  <h2 id="results-title">
                    {analysis.risk_level === 'high'
                      ? 'High risk indicators found'
                      : analysis.risk_level === 'suspicious'
                        ? 'Suspicious indicators found'
                        : analysis.indicators.length > 0
                          ? 'Some warning signs found'
                        : 'No scam indicators detected'}
                  </h2>
                  <p className="summary-description">
                    {analysis.explanation} Heuristic risk score: {analysis.risk_score}/100; this is not a probability or a guarantee.
                  </p>
                </div>
              </div>

              {analysis.indicators.length > 0 && (
                <>
                  <div className="warning-section">
                    <h3>What we noticed</h3>
                    <div className="warning-list">
                      {analysis.indicators.map((indicator) => (
                        <article className="warning-item" key={indicator.id}>
                          <span className="warning-bullet"><Icon name={getIndicatorIcon(indicator.id)} /></span>
                          <div className="warning-copy">
                            <h4>{indicator.title}</h4>
                            <p>{indicator.explanation}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>

                  <div className="next-step">
                    <span className="next-step-icon"><Icon name="shield" /></span>
                    <div>
                      <p className="next-step-label">WHAT TO DO NEXT</p>
                      <p>{analysis.safety_advice.join(' ')}</p>
                    </div>
                  </div>

                  <div className="more-details">
                    {analysis.indicators.map((indicator) => (
                      <details key={`details-${indicator.id}`}>
                        <summary>More about: {indicator.title}</summary>
                        <div className="detail-content">
                          <p><strong>Suggested action:</strong> {indicator.action}</p>
                        </div>
                      </details>
                    ))}
                  </div>
                </>
              )}

              <div className="result-actions">
                <button className="read-aloud-button" type="button" onClick={handleReadResults}>
                  <Icon name="spark" />Read results aloud
                </button>
                <p className="results-disclaimer">This preliminary check does not use live threat intelligence. No automated check can guarantee a message is safe.</p>
              </div>
              {speechMessage && <p className="speech-message" role="status">{speechMessage}</p>}
            </section>
          )}
        </section>
      </main>
  )
}

function SiteLayout() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <Link className="brand" to="/" aria-label="JuaScam home">
            <span className="brand-icon"><ShieldMark small /></span>
            <span className="brand-name">Jua<span>Scam</span></span>
          </Link>
          <p className="header-tagline">A little pause. A safer choice.</p>
        </div>
      </header>
      <Outlet />
      <footer className="site-footer">
        <div className="footer-inner">
          <span className="footer-shield"><ShieldMark small /></span>
          <p>JuaScam is a first check. Verify unexpected requests before acting.</p>
        </div>
      </footer>
    </div>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route element={<ScannerPage />} path="/" />
        <Route element={<Navigate replace to="/" />} path="*" />
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

export default App
