import { useCallback, useEffect, useMemo, useState } from 'react'
import { AuthContext } from './AuthContext.js'
import { supabase } from '../lib/supabase.js'

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(Boolean(supabase))
  const [profileState, setProfileState] = useState({ userId: null, profile: null, error: '' })
  const [sessionError, setSessionError] = useState('')
  const userId = session?.user?.id
  const profile = profileState.userId === userId ? profileState.profile : null
  const profileError = sessionError || (profileState.userId === userId ? profileState.error : '')

  useEffect(() => {
    if (!supabase) return undefined

    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setAuthLoading(false)
    })

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!active) return
        if (error) setSessionError('We could not restore your account session. Please sign in again.')
        setSession(data?.session ?? null)
        setAuthLoading(false)
      })
      .catch(() => {
        if (!active) return
        setSessionError('We could not restore your account session. Please sign in again.')
        setAuthLoading(false)
      })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!supabase || !userId) return undefined

    let active = true
    supabase
      .from('profiles')
      .select('id, display_name, created_at')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        setProfileState({
          userId,
          profile: data ?? null,
          error: error ? 'Your profile could not be loaded. Please refresh and try again.' : '',
        })
      })
      .catch(() => {
        if (!active) return
        setProfileState({ userId, profile: null, error: 'Your profile could not be loaded. Please refresh and try again.' })
      })

    return () => {
      active = false
    }
  }, [userId])

  const updateProfile = useCallback((nextProfile) => {
    if (userId) setProfileState({ userId, profile: nextProfile, error: '' })
  }, [userId])

  const value = useMemo(() => ({
    supabase,
    session,
    user: session?.user ?? null,
    profile,
    profileError,
    authLoading,
    configured: Boolean(supabase),
    setProfile: updateProfile,
  }), [session, profile, profileError, authLoading, updateProfile])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
