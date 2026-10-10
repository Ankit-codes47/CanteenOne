import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { app, connectDatabase } from './app.js'

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) })
const port = Number(process.env.PORT || 4000)
connectDatabase().then(() => app.listen(port, () => console.log(`CanteenOne API listening at http://localhost:${port} (MongoDB connected)`))).catch((err) => {
  console.error(`Could not connect to MongoDB: ${err.message}`)
  process.exit(1)
})
