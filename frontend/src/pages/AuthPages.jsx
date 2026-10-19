import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth.js'

function friendlyError(error) {
  const message = error?.message?.toLowerCase() ?? ''
  if (message.includes('invalid login credentials')) return 'The email or password does not match. Check them and try again.'
  if (message.includes('already registered') || message.includes('already been registered')) return 'There is already an account with that email. Try signing in instead.'
  if (message.includes('password')) return 'Choose a stronger password that meets the password requirements.'
  if (message.includes('rate limit') || message.includes('too many')) return 'There have been too many attempts. Please wait a while and try again.'
  return 'We could not complete that request. Please check your details and try again.'
}

function ConfigurationNotice() {
  return (
    <div className="notice-card" role="status">
      <h2>Account setup is not finished</h2>
      <p>Connect a Supabase project by adding its URL and public anon key to <code>frontend/.env.local</code>. Public scanning still works without signing in.</p>
      <p>Never put a Supabase service-role key in this frontend.</p>
    </div>
  )
}

function AuthFrame({ eyebrow, title, description, children, footer }) {
  return (
    <main className="account-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <p className="auth-eyebrow">{eyebrow}</p>
        <h1 id="auth-title">{title}</h1>
        <p className="auth-description">{description}</p>
        {children}
        {footer && <div className="auth-footer">{footer}</div>}
      </section>
    </main>
  )
}

export function AuthPage({ mode }) {
  const { supabase, configured } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const isRegister = mode === 'register'
  const title = isRegister ? 'Create your account' : 'Welcome back'

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!configured) return
    if (isRegister && displayName.trim().length < 2) {
      setError('Enter a name with at least 2 characters.')
      return
    }
    if (password.length < 12) {
      setError('Use a password with at least 12 characters.')
      return
    }

    setSubmitting(true)
    try {
      if (isRegister) {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: displayName.trim() },
            emailRedirectTo: `${window.location.origin}/dashboard`,
          },
        })
        if (authError) throw authError
        if (data.session) navigate('/dashboard', { replace: true })
        else setSuccess('Account created. Check your email for a verification link before signing in.')
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (authError) throw authError
        navigate('/dashboard', { replace: true })
      }
    } catch (authError) {
      setError(friendlyError(authError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthFrame
      eyebrow={isRegister ? 'GET STARTED' : 'YOUR ACCOUNT'}
      title={title}
      description={isRegister ? 'Create an account to keep your scan history in one place.' : 'Sign in to view your saved scans and account.'}
      footer={isRegister
        ? <>Already have an account? <Link to="/login">Sign in</Link></>
        : <>New to JuaScam? <Link to="/register">Create an account</Link></>}
    >
      {!configured ? <ConfigurationNotice /> : (
        <form className="account-form" onSubmit={handleSubmit}>
          {isRegister && (
            <label>
              Display name
              <input
                autoComplete="name"
                maxLength={80}
                minLength={2}
                onChange={(event) => setDisplayName(event.target.value)}
                required
                value={displayName}
              />
            </label>
          )}
          <label>
            Email address
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            Password
            <span className="password-control">
              <input
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                minLength={12}
                onChange={(event) => setPassword(event.target.value)}
                required
                type={passwordVisible ? 'text' : 'password'}
                value={password}
              />
              <button
                aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                className="password-toggle"
                onClick={() => setPasswordVisible((visible) => !visible)}
                type="button"
              >
                {passwordVisible ? 'Hide' : 'Show'}
              </button>
            </span>
            {isRegister && <span className="field-hint">Use at least 12 characters.</span>}
          </label>
          {error && <p className="form-message form-error" role="alert">{error}</p>}
          {success && <p className="form-message form-success" role="status">{success}</p>}
          <button className="primary-button" disabled={submitting} type="submit">
            {submitting && <span className="loading-spinner" aria-hidden="true" />}
            {submitting ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
          </button>
          {!isRegister && <Link className="form-link" to="/forgot-password">Forgot your password?</Link>}
        </form>
      )}
    </AuthFrame>
  )
}

export function ForgotPasswordPage() {
  const { supabase, configured } = useAuth()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')
    if (!configured) return

    setSubmitting(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (resetError) throw resetError
      setSuccess('If an account uses that email, password-reset instructions will arrive shortly.')
    } catch {
      setError('We could not request a password reset right now. Please try again later.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthFrame eyebrow="ACCOUNT RECOVERY" title="Reset your password" description="Enter the email address linked to your account.">
      {!configured ? <ConfigurationNotice /> : (
        <form className="account-form" onSubmit={handleSubmit}>
          <label>Email address<input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
          {error && <p className="form-message form-error" role="alert">{error}</p>}
          {success && <p className="form-message form-success" role="status">{success}</p>}
          <button className="primary-button" disabled={submitting} type="submit">{submitting ? 'Sending…' : 'Send reset link'}</button>
          <Link className="form-link" to="/login">Back to sign in</Link>
        </form>
      )}
    </AuthFrame>
  )
}

export function ResetPasswordPage() {
  const { supabase, configured } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')
    if (!configured) return
    if (password.length < 12) {
      setError('Use a password with at least 12 characters.')
      return
    }

    setSubmitting(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      setSuccess('Your password was updated.')
      window.setTimeout(() => navigate('/dashboard', { replace: true }), 900)
    } catch {
      setError('The reset link may have expired. Request a new password-reset email and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthFrame eyebrow="ACCOUNT RECOVERY" title="Choose a new password" description="Create a new password for your account.">
      {!configured ? <ConfigurationNotice /> : (
        <form className="account-form" onSubmit={handleSubmit}>
          <label>
            New password
            <span className="password-control">
              <input autoComplete="new-password" minLength={12} onChange={(event) => setPassword(event.target.value)} required type={passwordVisible ? 'text' : 'password'} value={password} />
              <button aria-label={passwordVisible ? 'Hide password' : 'Show password'} className="password-toggle" onClick={() => setPasswordVisible((visible) => !visible)} type="button">{passwordVisible ? 'Hide' : 'Show'}</button>
            </span>
            <span className="field-hint">Use at least 12 characters.</span>
          </label>
          {error && <p className="form-message form-error" role="alert">{error}</p>}
          {success && <p className="form-message form-success" role="status">{success}</p>}
          <button className="primary-button" disabled={submitting} type="submit">{submitting ? 'Saving…' : 'Update password'}</button>
        </form>
      )}
    </AuthFrame>
  )
}
