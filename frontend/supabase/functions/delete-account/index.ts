import { createClient } from 'jsr:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const allowedOrigin = Deno.env.get('APP_ORIGIN')

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Vary': 'Origin',
}

function respond(origin: string, status: number, message: string) {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: {
      ...jsonHeaders,
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  })
}

function getAuthTime(accessToken: string) {
  const encodedPayload = accessToken.split('.')[1]
  if (!encodedPayload) return null

  try {
    const base64 = encodedPayload.replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const claims = JSON.parse(new TextDecoder().decode(bytes))
    return typeof claims.auth_time === 'number' ? claims.auth_time : null
  } catch {
    return null
  }
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin')
  if (!origin || !allowedOrigin || origin !== allowedOrigin) {
    return new Response(JSON.stringify({ message: 'Request not allowed.' }), {
      status: 403,
      headers: jsonHeaders,
    })
  }

  if (request.method === 'OPTIONS') return respond(origin, 200, 'ok')
  if (request.method !== 'POST') return respond(origin, 405, 'Method not allowed.')

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return respond(origin, 500, 'Account deletion is not configured.')
  }

  const authorization = request.headers.get('authorization')
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!accessToken) return respond(origin, 401, 'Sign in is required.')

  try {
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return respond(origin, 401, 'Your session could not be verified.')

    const authTime = getAuthTime(accessToken)
    const now = Math.floor(Date.now() / 1000)
    if (authTime === null || authTime > now || now - authTime > 300) {
      return respond(origin, 403, 'Please sign in again before deleting your account.')
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id)
    if (deleteError) return respond(origin, 500, 'Your account could not be deleted.')

    return respond(origin, 200, 'Account deleted.')
  } catch {
    return respond(origin, 500, 'Your account could not be deleted.')
  }
})
