const axios = require('axios')
const pRetry = require('p-retry')

const RANDOM_NUMBER_API_URL =
  'http://www.randomnumberapi.com/api/v1.0/random?min=0&max=100&count=1'

async function fetchRandomNumberWithTimeout(timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  try {
    const response = await axios.get(RANDOM_NUMBER_API_URL, {
      signal: controller.signal,
      timeout: timeoutMs,
    })

    if (!Array.isArray(response.data) || response.data.length === 0) {
      const error = new Error('invalid_random_response')
      error.isRetryable = true
      throw error
    }

    return Number(response.data[0])
  } catch (err) {
    // Axios timeout / abort
    if (axios.isCancel(err) || err.code === 'ECONNABORTED') {
      const error = new Error('random_api_timeout')
      error.isRetryable = true
      throw error
    }

    // Retry on 429 or 5xx
    const status = err.response && err.response.status
    if (status === 429 || (typeof status === 'number' && status >= 500 && status < 600)) {
      err.isRetryable = true
      throw err
    }

    // For other 4xx errors, do not retry
    throw new pRetry.AbortError(err)
  } finally {
    clearTimeout(timeout)
  }
}

async function getPricingOnce() {
  const n = await fetchRandomNumberWithTimeout(1500)

  // Simulate latency based on the random number
  const extraDelayMs = 100 + (n % 400)
  await new Promise((resolve) => setTimeout(resolve, extraDelayMs))

  // Map random number to failure/success
  if (n < 40) {
    const error = new Error('pricing_check_failed')
    error.isRetryable = true
    throw error
  }

  // On success, return fixed markup and taxRate
  return {
    markup: 1.1,
    taxRate: 0.2,
  }
}

async function getPricingWithRetry() {
  try {
    return await pRetry(getPricingOnce, {
      retries: 4, // total attempts = 5
      factor: 2,
      minTimeout: 200,
      maxTimeout: 2000,
      randomize: true,
      onFailedAttempt: () => {
        // no-op; could log here
      },
    })
  } catch (err) {
    const finalError = err instanceof pRetry.AbortError ? err.originalError : err
    const wrapped = new Error('pricing_unavailable')
    wrapped.cause = finalError
    throw wrapped
  }
}

function computeFinalPrice(baseCost, pricing) {
  const cost = Number(baseCost)
  const final = cost * pricing.markup * (1 + pricing.taxRate)
  return Number(final.toFixed(2))
}

module.exports = {
  getPricingWithRetry,
  computeFinalPrice,
}
