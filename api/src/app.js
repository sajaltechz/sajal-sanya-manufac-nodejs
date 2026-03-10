const express = require('express')
const productsRouter = require('./routes/products')

function createApp() {
  const app = express()

  app.use(express.json())

  app.use(productsRouter)

  app.use((err, req, res, next) => {
    // Generic error handler
    // Validation and known errors should already be handled in routes.
    // Anything reaching here is treated as 500.
    // eslint-disable-next-line no-console
    console.error('Unexpected error:', err)
    res.status(500).json({
      error: 'internal_error',
      message: 'An unexpected error occurred',
    })
  })

  return app
}

module.exports = {
  createApp,
}

