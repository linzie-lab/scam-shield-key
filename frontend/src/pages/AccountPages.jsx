import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth.js'
import { fetchScanHistory, fetchScanStats } from '../lib/api.js'

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function classification(scan) {
  return scan.result_state === 'warning'
    ? { label: 'Warning signs found', icon: '⚠', className: 'status-warning' }
    : { label: 'No indicators found', icon: '✓', className: 'status-clear' }
}

function ScanRow({ scan, onDelete }) {
  const result = classification(scan)
  const warningSigns = Array.isArray(scan.warning_signs) ? scan.warning_signs : []

  return (
    <details className="scan-record">
      <summary className="scan-record-summary">
        <span className={`scan-status ${result.className}`}><span aria-hidden="true">{result.icon}</span>{result.label}</span>
        <time dateTime={scan.created_at}>{formatDate(scan.created_at)}</time>
      </summary>
      <p className="scan-preview">{scan.content_preview}</p>
      {warningSigns.length > 0 && (
        <ul className="record-warning-list">
          {warningSigns.map((sign) => <li key={sign}>{sign}</li>)}
        </ul>
      )}
      {onDelete && <button className="text-button delete-button" onClick={() => onDelete(scan)} type="button">Delete scan</button>}
    </details>
  )
}

function AccountContent({ eyebrow, title, description, children }) {
  return (
    <main className="account-area">
      <header className="page-heading">
        <p className="page-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </header>
      {children}
    </main>
  )
}

export function DashboardPage() {
  const { supabase, user, profile, profileError } = useAuth()
  const [stats, setStats] = useState({ total: 0, warnings: 0 })
  const [recentScans, setRecentScans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [communityStats, setCommunityStats] = useState(null)
  const [communityHistory, setCommunityHistory] = useState([])
  const [communityLoading, setCommunityLoading] = useState(true)
  const [communityError, setCommunityError] = useState('')

  useEffect(() => {
    let active = true
    async function loadDashboard() {
      setLoading(true)
      setError('')
      try {
        const [totalResult, warningsResult, recentResult] = await Promise.all([
          supabase.from('scan_history').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('scan_history').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('result_state', 'warning'),
          supabase.from('scan_history').select('id, content_preview, result_state, warning_signs, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
        ])
        if (!active) return
        const failure = totalResult.error || warningsResult.error || recentResult.error
        if (failure) setError('Your scan activity could not be loaded. Please try again.')
        else {
          setStats({ total: totalResult.count ?? 0, warnings: warningsResult.count ?? 0 })
          setRecentScans(recentResult.data ?? [])
        }
      } catch {
        if (active) setError('Your scan activity could not be loaded. Please try again.')
      } finally {
        if (active) setLoading(false)
      }
    }
    loadDashboard()
    return () => { active = false }
  }, [supabase, user.id])

  useEffect(() => {
    let active = true
    async function loadCommunityStats() {
      setCommunityLoading(true)
      setCommunityError('')
      try {
        const [nextStats, nextHistory] = await Promise.all([
          fetchScanStats(),
          fetchScanHistory(7),
        ])
        if (!active) return
        setCommunityStats(nextStats)
        setCommunityHistory(nextHistory.history)
      } catch (statsError) {
        if (active) setCommunityError(statsError.message || 'Community scan statistics could not be loaded.')
      } finally {
        if (active) setCommunityLoading(false)
      }
    }
    loadCommunityStats()
    return () => { active = false }
  }, [])

  const name = profile?.display_name || user.user_metadata?.display_name || user.email?.split('@')[0] || 'there'

  return (
    <AccountContent eyebrow="YOUR DASHBOARD" title={`Welcome, ${name}`} description="Your personal scan activity and shortcuts.">
      {profileError && <p className="form-message form-error" role="alert">{profileError}</p>}
      <div className="dashboard-actions">
        <Link className="primary-button button-link" to="/"><span aria-hidden="true">＋</span> Start a new scan</Link>
        <Link className="secondary-button button-link" to="/history">View scan history</Link>
      </div>
      {error && <p className="form-message form-error" role="alert">{error}</p>}
      <section className="stats-grid" aria-label="Saved scan summary">
        <article className="stat-card"><span>Total saved scans</span><strong>{loading ? '…' : stats.total}</strong></article>
        <article className="stat-card stat-alert"><span>Scans with warning signs</span><strong>{loading ? '…' : stats.warnings}</strong></article>
      </section>
      <section className="content-card" aria-labelledby="community-stats-title">
        <div className="card-heading">
          <div><p className="page-eyebrow">ANONYMOUS AGGREGATES</p><h2 id="community-stats-title">JuaScam scan statistics</h2></div>
          <span>Last 7 days</span>
        </div>
        <p className="summary-description">Daily totals only. Message text and account details are not stored in these statistics.</p>
        {communityLoading ? <p className="loading-message"><span className="loading-spinner" />Loading aggregate statistics…</p>
          : communityError ? <p className="form-message form-error" role="alert">{communityError}</p>
            : (
              <>
                <div className="stats-grid" aria-label="Anonymous scan statistics">
                  <article className="stat-card"><span>Total scans</span><strong>{communityStats.total_scans}</strong></article>
                  <article className="stat-card stat-alert"><span>High-risk scans</span><strong>{communityStats.by_risk_category.high}</strong></article>
                </div>
                {communityHistory.length > 0 && (
                  <ul className="record-warning-list">
                    {communityHistory.map((day) => (
                      <li key={day.date}>
                        {day.date}: {day.total_scans} {day.total_scans === 1 ? 'scan' : 'scans'}
                        {' '}({day.by_risk_category.low} low, {day.by_risk_category.suspicious} suspicious, {day.by_risk_category.high} high)
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
      </section>
      <section className="content-card">
        <div className="card-heading">
          <div><p className="page-eyebrow">RECENT ACTIVITY</p><h2>Recent scans</h2></div>
          <Link to="/history">See all</Link>
        </div>
        {loading ? <p className="loading-message"><span className="loading-spinner" />Loading your scans…</p>
          : recentScans.length ? <div className="scan-list">{recentScans.map((scan) => <ScanRow key={scan.id} scan={scan} />)}</div>
            : <div className="empty-history"><span aria-hidden="true">⌕</span><h3>No saved scans yet</h3><p>Your scans will appear here when you choose to save them.</p><Link to="/">Scan a message</Link></div>}
      </section>
      <div className="account-shortcuts">
        <Link to="/history">Scan History <span aria-hidden="true">→</span></Link>
        <Link to="/settings">Account Settings <span aria-hidden="true">→</span></Link>
      </div>
    </AccountContent>
  )
}

export function HistoryPage() {
  const { supabase, user } = useAuth()
  const [scans, setScans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [scanToDelete, setScanToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let active = true
    async function loadHistory() {
      try {
        const { data, error: fetchError } = await supabase.from('scan_history')
          .select('id, content_preview, result_state, warning_signs, created_at')
          .eq('user_id', user.id).order('created_at', { ascending: false })
        if (!active) return
        if (fetchError) setError('Your scan history could not be loaded. Please try again.')
        else setScans(data ?? [])
      } catch {
        if (active) setError('Your scan history could not be loaded. Please try again.')
      } finally {
        if (active) setLoading(false)
      }
    }
    loadHistory()
    return () => { active = false }
  }, [supabase, user.id])

  const visibleScans = useMemo(() => scans.filter((scan) => {
    const matchesFilter = filter === 'all' || scan.result_state === filter
    const matchesQuery = !query || `${scan.content_preview} ${(scan.warning_signs ?? []).join(' ')}`.toLowerCase().includes(query.toLowerCase())
    return matchesFilter && matchesQuery
  }), [scans, filter, query])

  async function confirmDelete() {
    if (!scanToDelete) return
    setDeleting(true)
    setError('')
    try {
      const { error: deleteError } = await supabase.from('scan_history').delete().eq('id', scanToDelete.id).eq('user_id', user.id)
      if (deleteError) setError('This scan could not be deleted. Please try again.')
      else setScans((current) => current.filter((scan) => scan.id !== scanToDelete.id))
    } catch {
      setError('This scan could not be deleted. Please try again.')
    } finally {
      setDeleting(false)
      setScanToDelete(null)
    }
  }

  return (
    <AccountContent eyebrow="YOUR ACCOUNT" title="Scan history" description="Only you can see the scans saved to your account.">
      <section className="content-card">
        <div className="history-tools">
          <label className="search-field">Search your saved scans<input onChange={(event) => setQuery(event.target.value)} placeholder="Search message text or warning signs" type="search" value={query} /></label>
          <label className="filter-field">Show<select onChange={(event) => setFilter(event.target.value)} value={filter}><option value="all">All results</option><option value="warning">Warning signs</option><option value="no_indicators">No indicators found</option></select></label>
        </div>
        {error && <p className="form-message form-error" role="alert">{error}</p>}
        {loading ? <p className="loading-message"><span className="loading-spinner" />Loading your scans…</p>
          : visibleScans.length ? <div className="scan-list">{visibleScans.map((scan) => <ScanRow key={scan.id} onDelete={setScanToDelete} scan={scan} />)}</div>
            : <div className="empty-history"><span aria-hidden="true">⌕</span><h2>{scans.length ? 'No matching scans' : 'No saved scans yet'}</h2><p>{scans.length ? 'Try a different search or filter.' : 'When you choose to save a scan, it will appear here.'}</p>{!scans.length && <Link to="/">Scan a message</Link>}</div>}
      </section>
      {scanToDelete && (
        <div className="modal-backdrop">
          <section aria-labelledby="delete-scan-title" aria-modal="true" className="confirm-dialog" role="alertdialog">
            <h2 id="delete-scan-title">Delete this saved scan?</h2>
            <p>This removes the scan from your account history. This action cannot be undone.</p>
            <div className="dialog-actions">
              <button className="secondary-button" disabled={deleting} onClick={() => setScanToDelete(null)} type="button">Cancel</button>
              <button className="danger-button" disabled={deleting} onClick={confirmDelete} type="button">{deleting ? 'Deleting…' : 'Delete scan'}</button>
            </div>
          </section>
        </div>
      )}
    </AccountContent>
  )
}

export function SettingsPage() {
  const { supabase, user, profile, setProfile } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState(null)
  const [newEmail, setNewEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [showDelete, setShowDelete] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function updateName(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    const nameToSave = (displayName ?? profile?.display_name ?? '').trim()
    if (nameToSave.length < 2) {
      setError('Enter a display name with at least 2 characters.')
      return
    }
    setBusy('name')
    try {
      const { data, error: updateError } = await supabase.from('profiles').update({ display_name: nameToSave }).eq('id', user.id).select('id, display_name, created_at').single()
      if (updateError) setError('Your display name could not be updated. Please try again.')
      else {
        setProfile(data)
        setDisplayName(data.display_name)
        setMessage('Your display name has been updated.')
      }
    } catch {
      setError('Your display name could not be updated. Please try again.')
    } finally {
      setBusy('')
    }
  }

  async function updateEmail(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    setBusy('email')
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email, password: emailPassword })
      if (verifyError) {
        setError('Your current password could not be verified.')
        return
      }
      const { error: updateError } = await supabase.auth.updateUser({ email: newEmail.trim() })
      if (updateError) setError('We could not start the email change. Please check the address and try again.')
      else {
        setMessage('Check your inbox to confirm the email address change.')
        setNewEmail('')
        setEmailPassword('')
      }
    } catch {
      setError('We could not start the email change. Please try again.')
    } finally {
      setBusy('')
    }
  }

  async function updatePassword(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    if (newPassword.length < 12) {
      setError('Use a new password with at least 12 characters.')
      return
    }
    setBusy('password')
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword })
      if (verifyError) {
        setError('Your current password could not be verified.')
        return
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) setError('Your password could not be updated. Please try again.')
      else {
        setMessage('Your password has been changed.')
        setCurrentPassword('')
        setNewPassword('')
      }
    } catch {
      setError('Your password could not be updated. Please try again.')
    } finally {
      setBusy('')
    }
  }

  async function deleteAccount(event) {
    event.preventDefault()
    setError('')
    if (deleteConfirmation !== 'DELETE') {
      setError('Type DELETE to confirm account removal.')
      return
    }
    setBusy('delete')
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email, password: deletePassword })
      if (verifyError) {
        setError('Your password could not be verified.')
        return
      }
      const { error: deletionError } = await supabase.functions.invoke('delete-account')
      if (deletionError) {
        setError('Your account could not be deleted. Please try again or contact support.')
        return
      }
      await supabase.auth.signOut({ scope: 'local' })
      navigate('/', { replace: true })
    } catch {
      setError('Your account could not be deleted. Please try again or contact support.')
    } finally {
      setBusy('')
    }
  }

  return (
    <AccountContent eyebrow="YOUR ACCOUNT" title="Account settings" description="Manage your account details and security.">
      {error && <p className="form-message form-error" role="alert">{error}</p>}
      {message && <p className="form-message form-success" role="status">{message}</p>}
      <section className="content-card settings-section">
        <div className="card-heading"><div><p className="page-eyebrow">PROFILE</p><h2>Display name</h2></div></div>
        <form className="account-form" onSubmit={updateName}>
          <label>Email address<input disabled readOnly type="email" value={user.email ?? ''} /></label>
          <label>Display name<input autoComplete="name" maxLength={80} minLength={2} onChange={(event) => setDisplayName(event.target.value)} required value={displayName ?? profile?.display_name ?? ''} /></label>
          <button className="secondary-button" disabled={busy === 'name'} type="submit">{busy === 'name' ? 'Saving…' : 'Save name'}</button>
        </form>
      </section>

      <section className="content-card settings-section">
        <div className="card-heading"><div><p className="page-eyebrow">EMAIL</p><h2>Change email address</h2></div></div>
        <form className="account-form" onSubmit={updateEmail}>
          <label>New email address<input autoComplete="email" onChange={(event) => setNewEmail(event.target.value)} required type="email" value={newEmail} /></label>
          <label>Current password<input autoComplete="current-password" onChange={(event) => setEmailPassword(event.target.value)} required type="password" value={emailPassword} /></label>
          <p className="field-hint">Confirm your password. A verification email will be sent before the change takes effect.</p>
          <button className="secondary-button" disabled={busy === 'email'} type="submit">{busy === 'email' ? 'Sending…' : 'Send confirmation'}</button>
        </form>
      </section>

      <section className="content-card settings-section">
        <div className="card-heading"><div><p className="page-eyebrow">SECURITY</p><h2>Change password</h2></div></div>
        <form className="account-form" onSubmit={updatePassword}>
          <label>Current password<input autoComplete="current-password" onChange={(event) => setCurrentPassword(event.target.value)} required type="password" value={currentPassword} /></label>
          <label>New password<input autoComplete="new-password" minLength={12} onChange={(event) => setNewPassword(event.target.value)} required type="password" value={newPassword} /></label>
          <p className="field-hint">You’ll need to confirm your current password. Use at least 12 characters for the new one.</p>
          <button className="secondary-button" disabled={busy === 'password'} type="submit">{busy === 'password' ? 'Updating…' : 'Update password'}</button>
        </form>
      </section>

      <section className="content-card danger-zone">
        <div><p className="page-eyebrow">PERMANENT ACTION</p><h2>Delete account</h2><p>Your account and saved scan history will be permanently removed.</p></div>
        <button className="danger-button" onClick={() => { setShowDelete(true); setError('') }} type="button">Delete my account</button>
      </section>

      {showDelete && (
        <div className="modal-backdrop">
          <section aria-labelledby="delete-account-title" aria-modal="true" className="confirm-dialog" role="alertdialog">
            <h2 id="delete-account-title">Permanently delete your account?</h2>
            <p>This also deletes your saved scan history. Enter your current password and type DELETE to confirm.</p>
            <form className="account-form" onSubmit={deleteAccount}>
              <label>Current password<input autoComplete="current-password" onChange={(event) => setDeletePassword(event.target.value)} required type="password" value={deletePassword} /></label>
              <label>Type DELETE to confirm<input onChange={(event) => setDeleteConfirmation(event.target.value)} required value={deleteConfirmation} /></label>
              {error && <p className="form-message form-error" role="alert">{error}</p>}
              <div className="dialog-actions">
                <button className="secondary-button" disabled={busy === 'delete'} onClick={() => setShowDelete(false)} type="button">Cancel</button>
                <button className="danger-button" disabled={busy === 'delete'} type="submit">{busy === 'delete' ? 'Deleting…' : 'Permanently delete'}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </AccountContent>
  )
}
