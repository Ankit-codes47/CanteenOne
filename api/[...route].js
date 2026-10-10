import { app, connectDatabase } from '../server/src/app.js'

export default async function handler(req, res) {
  try {
    await connectDatabase()
    return app(req, res)
  } catch (error) {
    console.error(`CanteenOne API startup failed: ${error.message}`)
    return res.status(503).json({ error: 'The canteen service is temporarily unavailable.' })
  }
}
