function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0
}

function hasMaxDecimals(num, maxDecimals) {
  if (typeof num !== 'number' || !Number.isFinite(num)) return false
  const factor = 10 ** maxDecimals
  return Number.isInteger(num * factor)
}

function validateSku(sku) {
  if (!isNonEmptyString(sku)) return 'sku is required'
  if (sku.length < 3 || sku.length > 32) return 'sku must be 3-32 characters long'
  if (!/^[A-Za-z0-9_-]+$/.test(sku)) {
    return 'sku may only contain letters, numbers, underscore, and hyphen'
  }
  return null
}

function validateName(name, required) {
  if (!isNonEmptyString(name)) {
    if (required) return 'name is required'
    return null
  }
  if (name.length < 1 || name.length > 120) {
    return 'name must be between 1 and 120 characters'
  }
  return null
}

function validateBaseCost(baseCost, required) {
  if (baseCost === undefined || baseCost === null) {
    return required ? 'baseCost is required' : null
  }
  const num = typeof baseCost === 'string' ? Number(baseCost) : baseCost
  if (Number.isNaN(num)) return 'baseCost must be a number'
  if (num < 0) return 'baseCost must be greater than or equal to 0'
  if (!hasMaxDecimals(num, 2)) return 'baseCost must have at most 2 decimal places'
  return null
}

function validateCurrency(currency, required) {
  if (!isNonEmptyString(currency)) {
    return required ? 'currency is required' : null
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    return 'currency must be exactly 3 uppercase letters'
  }
  return null
}

function validateTags(tags, required) {
  if (tags === undefined || tags === null) {
    return required ? 'tags is required' : null
  }
  if (!Array.isArray(tags)) return 'tags must be an array of strings'
  if (tags.length > 10) return 'tags must contain at most 10 items'
  for (const tag of tags) {
    if (typeof tag !== 'string') return 'each tag must be a string'
    if (tag.length < 1 || tag.length > 20) {
      return 'each tag must be between 1 and 20 characters'
    }
  }
  return null
}

function validateCreateProduct(body) {
  const errors = []

  const skuError = validateSku(body.sku)
  if (skuError) errors.push({ field: 'sku', message: skuError })

  const nameError = validateName(body.name, true)
  if (nameError) errors.push({ field: 'name', message: nameError })

  const baseCostError = validateBaseCost(body.baseCost, true)
  if (baseCostError) errors.push({ field: 'baseCost', message: baseCostError })

  const currencyError = validateCurrency(body.currency, true)
  if (currencyError) errors.push({ field: 'currency', message: currencyError })

  const tagsError = validateTags(body.tags, true)
  if (tagsError) errors.push({ field: 'tags', message: tagsError })

  return {
    valid: errors.length === 0,
    errors,
  }
}

function validatePatchProduct(body) {
  const hasAnyField =
    body.sku !== undefined ||
    body.name !== undefined ||
    body.baseCost !== undefined ||
    body.currency !== undefined ||
    body.tags !== undefined

  if (!hasAnyField) {
    return {
      valid: false,
      errors: [{ field: '_', message: 'At least one updatable field must be provided' }],
    }
  }

  const errors = []

  if (body.sku !== undefined) {
    const err = validateSku(body.sku)
    if (err) errors.push({ field: 'sku', message: err })
  }

  if (body.name !== undefined) {
    const err = validateName(body.name, false)
    if (err) errors.push({ field: 'name', message: err })
  }

  if (body.baseCost !== undefined) {
    const err = validateBaseCost(body.baseCost, false)
    if (err) errors.push({ field: 'baseCost', message: err })
  }

  if (body.currency !== undefined) {
    const err = validateCurrency(body.currency, false)
    if (err) errors.push({ field: 'currency', message: err })
  }

  if (body.tags !== undefined) {
    const err = validateTags(body.tags, false)
    if (err) errors.push({ field: 'tags', message: err })
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

function validateListQuery(query) {
  const errors = []

  let limit = 20
  if (query.limit !== undefined) {
    const n = Number(query.limit)
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      errors.push({ field: 'limit', message: 'limit must be an integer between 1 and 100' })
    } else {
      limit = n
    }
  }

  let offset = 0
  if (query.offset !== undefined) {
    const n = Number(query.offset)
    if (!Number.isInteger(n) || n < 0) {
      errors.push({ field: 'offset', message: 'offset must be an integer greater than or equal to 0' })
    } else {
      offset = n
    }
  }

  let search = undefined
  if (query.q !== undefined) {
    const q = String(query.q)
    if (q.length < 1 || q.length > 64) {
      errors.push({ field: 'q', message: 'q must be between 1 and 64 characters' })
    } else {
      search = q
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    limit,
    offset,
    search,
  }
}

module.exports = {
  validateCreateProduct,
  validatePatchProduct,
  validateListQuery,
}
