import dotenv from 'dotenv'
import concurrently from 'concurrently'
import { fileURLToPath } from 'node:url'
import net from 'node:net'

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) })

const commands = []
const mongoPort = 27017
const localMongoUri = `mongodb://127.0.0.1:${mongoPort}/canteenone`
process.env.CANTEENONE_LOCAL_MONGODB_URI = localMongoUri

function portIsOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port })
    socket.setTimeout(500)
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(false))
    socket.once('timeout', () => { socket.destroy(); resolve(false) })
  })
}

if (!(await portIsOpen(mongoPort))) {
  commands.push({ command: `mongod --quiet --dbpath ./.mongo-data --bind_ip 127.0.0.1 --port ${mongoPort}`, name: 'db' })
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
