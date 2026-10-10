import dotenv from 'dotenv'
import concurrently from 'concurrently'
import { fileURLToPath } from 'node:url'

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) })

const commands = []
if (!process.env.MONGODB_URI) {
  commands.push({ command: 'mongod --dbpath ./.mongo-data --bind_ip 127.0.0.1', name: 'db' })
}
commands.push(
  { command: 'npm run dev -w server', name: 'api' },
  { command: 'npm run dev -w client', name: 'web' },
)

const { result } = concurrently(commands, {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  prefix: 'name',
  killOthersOn: ['failure'],
})
result.catch(() => process.exitCode = 1)
