import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
import { shops } from './data.js'
import { Account, Order, Payment, ProductStock, Review, Session } from './models.js'

const app = express()

const publicUser = (user) => ({ id: String(user._id), name: user.name, email: user.email, vendorId: user.vendorId || null, role: user.role, shopId: user.shopId || null })
const findShop = (shopId) => shops.find((item) => item.id === shopId)

function passwordParts(password) {
  const salt = randomBytes(16).toString('hex')
  return { salt, passwordHash: scryptSync(password, salt, 64).toString('hex') }
}
function passwordMatches(user, password) {
  const candidate = scryptSync(password, user.salt, 64)
  return timingSafeEqual(candidate, Buffer.from(user.passwordHash, 'hex'))
}
function orderJson(order) {
  return { ...order.toObject(), id: order.orderNo, createdAt: order.createdAt?.toISOString(), readyAt: order.readyAt?.toISOString(), deliveredAt: order.deliveredAt?.toISOString() || null }
}
async function createSession(account) {
  const token = randomBytes(32).toString('hex')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  await Session.create({ tokenHash, accountId: account._id, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) })
  return token
}
async function auth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Please sign in to continue.' })
  try {
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const session = await Session.findOne({ tokenHash, expiresAt: { $gt: new Date() } })
    const user = session && await Account.findById(session.accountId)
    if (!user) return res.status(401).json({ error: 'Please sign in to continue.' })
    req.user = user
    req.sessionTokenHash = tokenHash
    next()
  } catch (err) { next(err) }
}
function requireRole(role) {
  return (req, res, next) => req.user.role === role ? next() : res.status(403).json({ error: 'This account cannot access that page.' })
}
async function menuForShop(shop) {
  const stocks = await ProductStock.find({ shopId: shop.id }).lean()
  const stockById = new Map(stocks.map((item) => [item.productId, item.inStock]))
  return {
    ...shop,
    products: shop.products.map((product) => ({
      ...product,
      offlinePrice: product.price,
      price: Math.max(1, product.price - 1),
      inStock: stockById.get(product.id) ?? true,
    })),
  }
}
async function seedMongo() {
  const vendorSeeds = [
    { shopId: 'urban-vada-pav', name: 'Urban Vada Pav Vendor', email: 'urban@canteenone.demo', vendorId: 'CTN-URBAN-01', password: 'urban1234' },
    { shopId: 'm-coin', name: 'M.Coin Vendor', email: 'mcoin@canteenone.demo', vendorId: 'CTN-MCOIN-01', password: 'mcoin1234' },
    { shopId: 'chaigaram', name: 'Chaigaram Vendor', email: 'chaigaram@canteenone.demo', vendorId: 'CTN-CHAIGARAM-01', password: 'chaigaram1234' },
    { shopId: 'ke7', name: 'KE7 Vendor', email: 'ke7@canteenone.demo', vendorId: 'CTN-KE7-01', password: 'ke71234' },
    { shopId: 'mr-sandwich', name: 'Mr. Sandwich Vendor', email: 'sandwich@canteenone.demo', vendorId: 'CTN-SANDWICH-01', password: 'sandwich1234' },
  ]
  for (const seed of vendorSeeds) {
    const existing = await Account.findOne({ vendorId: seed.vendorId })
    if (!existing) {
      const hashed = passwordParts(seed.password)
      await Account.create({ name: seed.name, email: seed.email, vendorId: seed.vendorId, role: 'vendor', shopId: seed.shopId, ...hashed })
    }
  }
  for (const shop of shops) for (const product of shop.products) {
    await ProductStock.updateOne({ shopId: shop.id, productId: product.id }, { $setOnInsert: { inStock: true } }, { upsert: true })
    product.offlinePrice = product.price
  }
}

app.use(cors())
app.use(express.json({ limit: '32kb' }))
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'CanteenOne API', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }))
app.get('/api/shops', async (_req, res, next) => {
  try { res.json({ shops: await Promise.all(shops.map(menuForShop)) }) } catch (err) { next(err) }
})
app.get('/api/shops/:shopId', async (req, res, next) => {
  try {
    const shop = findShop(req.params.shopId)
    if (!shop) return res.status(404).json({ error: 'Canteen not found.' })
    res.json({ shop: await menuForShop(shop) })
  } catch (err) { next(err) }
})
app.post('/api/auth/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body ?? {}
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) return res.status(400).json({ error: 'Enter your name (2–80 characters).' })
    if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' })
    if (typeof password !== 'string' || password.length < 8 || password.length > 100) return res.status(400).json({ error: 'Password must be at least 8 characters.' })
    const normalizedEmail = email.toLowerCase()
    if (await Account.exists({ email: normalizedEmail })) return res.status(409).json({ error: 'That email is already registered. Please sign in.' })
    const account = await Account.create({ name: name.trim(), email: normalizedEmail, role: 'student', ...passwordParts(password) })
    const token = await createSession(account)
    res.status(201).json({ token, user: publicUser(account) })
  } catch (err) { next(err) }
})
app.post('/api/auth/login', async (req, res, next) => {
  try {
    const identifier = String(req.body?.identifier || req.body?.email || '').trim()
    const user = await Account.findOne({ $or: [{ email: identifier.toLowerCase() }, { vendorId: identifier.toUpperCase() }] }).select('+passwordHash +salt')
    if (!user || typeof req.body?.password !== 'string' || !passwordMatches(user, req.body.password)) return res.status(401).json({ error: 'ID or password is incorrect.' })
    if (req.body?.role && user.role !== req.body.role) return res.status(403).json({ error: 'Use the correct sign-in page for this account.' })
    if (user.role === 'vendor' && !findShop(user.shopId)) return res.status(403).json({ error: 'This vendor account is not linked to an active canteen.' })
    const token = await createSession(user)
    res.json({ token, user: publicUser(user) })
  } catch (err) { next(err) }
})
app.get('/api/auth/me', auth, (req, res) => res.json({ user: publicUser(req.user) }))
app.post('/api/auth/logout', auth, async (req, res, next) => { try { await Session.deleteOne({ tokenHash: req.sessionTokenHash }); res.json({ ok: true }) } catch (err) { next(err) } })

// Presentation payment only. Replace with a real payment gateway before collecting money.
app.post('/api/payments/demo', auth, requireRole('student'), async (req, res, next) => {
  try {
    const amount = Number(req.body?.amount)
    const method = String(req.body?.method || 'upi')
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Invalid payment amount.' })
    if (!['upi', 'card', 'netbanking'].includes(method)) return res.status(400).json({ error: 'Choose a supported payment method.' })
    const payment = await Payment.create({ _id: `PAY-${randomUUID().slice(0, 8).toUpperCase()}`, studentId: req.user._id, amount, status: 'paid', mode: 'demo', method })
    res.status(201).json({ payment: { id: payment._id, amount: payment.amount, status: payment.status, mode: payment.mode, method: payment.method, paidAt: payment.createdAt } })
  } catch (err) { next(err) }
})
app.post('/api/orders', auth, requireRole('student'), async (req, res, next) => {
  try {
    const { shopId, note = '', items, readyInMinutes, paymentId } = req.body ?? {}
    const shop = findShop(shopId)
    if (!shop) return res.status(400).json({ error: 'Choose a valid canteen.' })
    if (typeof note !== 'string' || note.length > 120) return res.status(400).json({ error: 'Order notes must be 120 characters or fewer.' })
    if (![15, 30, 45].includes(Number(readyInMinutes))) return res.status(400).json({ error: 'Choose a ready time between 15 and 45 minutes.' })
    if (!Array.isArray(items) || items.length < 1 || items.length > 30) return res.status(400).json({ error: 'Add between 1 and 30 menu items.' })
    const lineItems = []
    for (const item of items) {
      const product = shop.products.find((entry) => entry.id === item.productId)
      if (!product) return res.status(400).json({ error: 'One selected item is not sold by this canteen.' })
      const stock = await ProductStock.findOne({ shopId, productId: product.id }).lean()
      if (stock && !stock.inStock) return res.status(409).json({ error: `${product.name} is currently out of stock.` })
      const quantity = Number(item.quantity)
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return res.status(400).json({ error: 'Item quantities must be between 1 and 20.' })
      const onlinePrice = Math.max(1, product.price - 1)
      lineItems.push({ productId: product.id, name: product.name, offlinePrice: product.price, unitPrice: onlinePrice, quantity, lineTotal: onlinePrice * quantity })
    }
    const total = lineItems.reduce((sum, item) => sum + item.lineTotal, 0)
    const payment = await Payment.findOneAndUpdate({ _id: paymentId, studentId: req.user._id, status: 'paid', used: false, amount: total }, { $set: { used: true } }, { new: true })
    if (!payment) return res.status(402).json({ error: 'Complete payment for this exact total before placing the order.' })
    const now = new Date()
    const orderNo = randomUUID().slice(0, 8).toUpperCase()
    const order = await Order.create({
      orderNo, token: `C1-${orderNo}`, shopId, shopName: shop.name, shopEmoji: shop.emoji, shopLogo: shop.logo,
      studentId: req.user._id, studentName: req.user.name, note: note.trim(), items: lineItems, total,
      savings: lineItems.reduce((sum, item) => sum + item.quantity, 0),
      payment: { receipt: payment._id, amount: payment.amount, status: payment.status, mode: payment.mode, method: payment.method, paidAt: payment.createdAt },
      readyInMinutes: Number(readyInMinutes), createdAt: now, readyAt: new Date(now.getTime() + Number(readyInMinutes) * 60_000), status: 'new',
    })
    res.status(201).json({ order: orderJson(order) })
  } catch (err) { next(err) }
})
app.get('/api/orders', auth, async (req, res, next) => {
  try {
    const filter = req.user.role === 'vendor' ? { shopId: req.user.shopId } : { studentId: req.user._id }
    const list = await Order.find(filter).sort({ createdAt: -1 }).lean()
    res.json({ orders: list.map((order) => ({ ...order, id: order.orderNo })) })
  } catch (err) { next(err) }
})
app.patch('/api/orders/:orderId/status', auth, requireRole('vendor'), async (req, res, next) => {
  try {
    const order = await Order.findOne({ orderNo: req.params.orderId, shopId: req.user.shopId })
    if (!order) return res.status(404).json({ error: 'Order not found for your canteen.' })
    const transitions = { new: 'accepted', accepted: 'preparing', preparing: 'ready', ready: 'delivered' }
    if (transitions[order.status] !== req.body?.status) return res.status(409).json({ error: 'Move this order to its next step in the queue.' })
    order.status = req.body.status
    if (order.status === 'delivered') order.deliveredAt = new Date()
    await order.save()
    res.json({ order: orderJson(order) })
  } catch (err) { next(err) }
})
app.patch('/api/vendor/products/:productId/stock', auth, requireRole('vendor'), async (req, res, next) => {
  try {
    const shop = findShop(req.user.shopId)
    const product = shop?.products.find((item) => item.id === req.params.productId)
    if (!product) return res.status(404).json({ error: 'Menu item not found for your canteen.' })
    if (typeof req.body?.inStock !== 'boolean') return res.status(400).json({ error: 'Choose whether this item is in stock.' })
    const stock = await ProductStock.findOneAndUpdate({ shopId: shop.id, productId: product.id }, { $set: { inStock: req.body.inStock } }, { new: true, upsert: true, setDefaultsOnInsert: true })
    res.json({ product: { ...product, offlinePrice: product.price, price: Math.max(1, product.price - 1), inStock: stock.inStock } })
  } catch (err) { next(err) }
})
app.get('/api/reviews', async (req, res, next) => {
  try {
    const { shopId, productId } = req.query
    if (!findShop(shopId)?.products.some((product) => product.id === productId)) return res.status(400).json({ error: 'Choose a valid menu item.' })
    const reviews = await Review.find({ shopId, productId }).sort({ createdAt: -1 }).lean()
    const average = reviews.length ? reviews.reduce((sum, item) => sum + item.rating, 0) / reviews.length : 0
    res.json({ reviews, count: reviews.length, average: Number(average.toFixed(1)) })
  } catch (err) { next(err) }
})
app.post('/api/reviews', auth, requireRole('student'), async (req, res, next) => {
  try {
    const { shopId, productId, rating, comment } = req.body ?? {}
    if (!findShop(shopId)?.products.some((product) => product.id === productId)) return res.status(400).json({ error: 'Choose a valid menu item.' })
    if (!Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5) return res.status(400).json({ error: 'Choose a rating from 1 to 5.' })
    if (typeof comment !== 'string' || comment.trim().length < 2 || comment.length > 500) return res.status(400).json({ error: 'Write a comment between 2 and 500 characters.' })
    const review = await Review.create({ shopId, productId, studentId: req.user._id, studentName: req.user.name, rating: Number(rating), comment: comment.trim() })
    res.status(201).json({ review })
  } catch (err) { next(err) }
})

app.use((err, _req, res, _next) => {
  console.error(err)
  if (err?.code === 11000) return res.status(409).json({ error: 'That account already exists.' })
  res.status(500).json({ error: 'The server could not complete that request.' })
})

let databasePromise
export function connectDatabase() {
  if (!databasePromise) {
    const configuredUri = process.env.MONGODB_URI
    const uri = configuredUri || process.env.CANTEENONE_LOCAL_MONGODB_URI || 'mongodb://127.0.0.1:27017/canteenone'
    const useLocalFallback = Boolean(configuredUri?.startsWith('mongodb+srv://') && process.env.NODE_ENV !== 'production' && !process.env.VERCEL)
    databasePromise = mongoose.connect(uri, { serverSelectionTimeoutMS: 7000 }).catch(async (err) => {
      if (!useLocalFallback) throw err
      console.error(`MongoDB Atlas is unreachable in local development (${err.name}). Trying the local development database.`)
      await mongoose.connect(process.env.CANTEENONE_LOCAL_MONGODB_URI || 'mongodb://127.0.0.1:27017/canteenone', { serverSelectionTimeoutMS: 5000 })
      console.warn('Using local MongoDB for this run. Changes will not be saved to Atlas until Atlas allows this computer’s IP address.')
    }).then(seedMongo).catch((err) => { databasePromise = undefined; throw err })
  }
  return databasePromise
}

export { app }
