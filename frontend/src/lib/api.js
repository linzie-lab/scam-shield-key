export async function analyzeContent(content) {
  let response
  try {
    response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
  } catch {
    throw new Error('Could not reach the scanner. Check that the Flask API is running and try again.')
  }

  let result
  try {
    result = await response.json()
  } catch {
    throw new Error('The scanner returned an unreadable response. Please try again.')
  }

  if (!response.ok) {
    throw new Error(result.error || 'The message could not be analyzed. Please try again.')
  }

  const validIndicators = Array.isArray(result.matched_indicators)
    && result.matched_indicators.every((indicator) => (
      indicator
      && typeof indicator.id === 'string'
      && typeof indicator.title === 'string'
      && typeof indicator.explanation === 'string'
      && typeof indicator.safety_advice === 'string'
      && Number.isFinite(indicator.points)
    ))
  const validRiskScore = Number.isFinite(result.risk_score)
    && result.risk_score >= 0
    && result.risk_score <= 100

  if (
    !validIndicators
    || !validRiskScore
    || !['low', 'suspicious', 'high'].includes(result.risk_category)
    || typeof result.explanation !== 'string'
    || !Array.isArray(result.safety_advice)
  ) {
    throw new Error('The scanner returned an unexpected result. Please try again.')
  }

  return {
    ...result,
    indicators: result.matched_indicators.map((indicator) => ({
      ...indicator,
      action: indicator.safety_advice,
    })),
    risk_level: result.risk_category,
  }
}

async function fetchApiJson(path) {
  let response
  try {
    response = await fetch(path)
  } catch {
    throw new Error('Could not reach the JuaScam API. Check that Flask is running and try again.')
  }

  let result
  try {
    result = await response.json()
  } catch {
    throw new Error('The JuaScam API returned an unreadable response.')
  }

  if (!response.ok) {
    throw new Error(result.error || 'The JuaScam API request failed.')
  }

  return result
}

export async function fetchScanStats() {
  const stats = await fetchApiJson('/api/stats')
  const categories = stats.by_risk_category
  if (
    !Number.isSafeInteger(stats.total_scans)
    || !categories
    || !['low', 'suspicious', 'high'].every((category) => Number.isSafeInteger(categories[category]))
  ) {
    throw new Error('The JuaScam API returned unexpected statistics.')
  }
  return stats
}

export async function fetchScanHistory(days = 7) {
  const result = await fetchApiJson(`/api/history?days=${encodeURIComponent(days)}`)
  if (
    !Array.isArray(result.history)
    || !result.history.every((day) => (
      typeof day.date === 'string'
      && Number.isSafeInteger(day.total_scans)
      && day.by_risk_category
      && ['low', 'suspicious', 'high'].every((category) => Number.isSafeInteger(day.by_risk_category[category]))
    ))
  ) {
    throw new Error('The JuaScam API returned unexpected aggregate history.')
  }
  return result
}
