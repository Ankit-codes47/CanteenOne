import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHash, createHmac } from 'node:crypto'
import { shops } from './data.js'
import { Account, MenuItem, Order, Payment, ProductStock, Review, Session, ShopState } from './models.js'

const app = express()

const publicUser = (user) => ({ id: String(user._id), name: user.name, email: user.email, vendorId: user.vendorId || null, adminId: user.adminId || null, role: user.role, shopId: user.shopId || null })
const findShop = (shopId) => shops.find((item) => item.id === shopId)
async function findProductForShop(shopId, productId) {
  const saved = await MenuItem.findOne({ shopId, productId }).lean()
  if (saved?.isDeleted) return null
  const original = findShop(shopId)?.products.find((item) => item.id === productId)
  return original || (saved && !saved.isDeleted ? saved : null)
}
function razorpayCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  return keyId && keySecret ? { keyId, keySecret } : null
}
async function razorpayRequest(path, { method = 'GET', body } = {}) {
  const credentials = razorpayCredentials()
  if (!credentials) throw Object.assign(new Error('Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to the server environment.'), { status: 503 })
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString('base64')}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(data.error?.description || 'Razorpay could not process the payment request.'), { status: response.status >= 500 ? 502 : 400 })
  return data
}
function secureStringEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}
async function createOrderFromCapturedPayment(payment, razorpayPayment) {
  const previous = await Order.findOne({ 'payment.receipt': razorpayPayment.id })
  if (previous) return previous
  const checkout = payment.checkoutData
  if (!checkout || !Array.isArray(checkout.items) || !checkout.items.length) throw Object.assign(new Error('The saved checkout details are missing.'), { status: 409 })
  if (razorpayPayment.order_id !== payment.razorpayOrderId || razorpayPayment.amount !== Math.round(payment.amount * 100) || razorpayPayment.currency !== payment.currency) {
    throw Object.assign(new Error('The captured payment does not match this order.'), { status: 409 })
  }
  const paidAt = razorpayPayment.created_at ? new Date(razorpayPayment.created_at * 1000) : new Date()
  await Payment.updateOne({ _id: payment._id }, { $set: { status: 'paid', razorpayPaymentId: razorpayPayment.id, method: razorpayPayment.method || '', used: true } })
  const orderNo = randomUUID().slice(0, 8).toUpperCase()
  try {
    return await Order.create({
      orderNo, token: `C1-${orderNo}`, shopId: checkout.shopId, shopName: checkout.shopName,
      shopEmoji: checkout.shopEmoji, shopLogo: checkout.shopLogo, studentId: payment.studentId,
      studentName: checkout.studentName, note: checkout.note, items: checkout.items, total: payment.amount,
      savings: checkout.items.reduce((sum, item) => sum + item.quantity, 0),
      payment: { receipt: razorpayPayment.id, amount: payment.amount, status: 'captured', mode: 'razorpay', method: razorpayPayment.method || '', paidAt },
      readyInMinutes: checkout.readyInMinutes, createdAt: paidAt,
      readyAt: new Date(paidAt.getTime() + checkout.readyInMinutes * 60_000), status: 'accepted',
    })
  } catch (err) {
    if (err?.code === 11000) {
      const duplicate = await Order.findOne({ 'payment.receipt': razorpayPayment.id })
      if (duplicate) return duplicate
    }
    throw err
  }
}
function indiaDayBounds(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const part = (type) => parts.find((item) => item.type === type).value
  const start = new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00+05:30`)
  return { $gte: start, $lt: new Date(start.getTime() + 24 * 60 * 60 * 1000) }
}

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
async function menuForShop(shop, sharedData = null) {
  const [stocks, savedItems, state] = sharedData
    ? [sharedData.stocks.filter((item) => item.shopId === shop.id), sharedData.savedItems.filter((item) => item.shopId === shop.id), sharedData.states.find((item) => item.shopId === shop.id)]
    : await Promise.all([
      ProductStock.find({ shopId: shop.id }).lean(),
      MenuItem.find({ shopId: shop.id }).lean(),
      ShopState.findOne({ shopId: shop.id }).lean(),
    ])
  const stockById = new Map(stocks.map((item) => [item.productId, item.inStock]))
  const hiddenIds = new Set(savedItems.filter((item) => item.isDeleted).map((item) => item.productId))
  const addedItems = savedItems.filter((item) => !item.isDeleted).map(({ _id, __v, shopId, productId, ...item }) => ({ ...item, id: productId }))
  const products = [...shop.products.filter((item) => !hiddenIds.has(item.id)), ...addedItems]
  return {
    ...shop,
    isOpen: state?.isOpen ?? true,
    products: products.map((product) => ({
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
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase() || 'admin@canteenone.local'
  const adminPassword = process.env.ADMIN_PASSWORD
  if (adminPassword) vendorSeeds.push({ name: process.env.ADMIN_NAME || 'CanteenOne Admin', email: adminEmail, adminId: process.env.ADMIN_ID?.trim().toUpperCase() || 'CTN-ADMIN-01', password: adminPassword, role: 'admin' })
  const accountOps = vendorSeeds.map((seed) => {
    const { salt, passwordHash } = passwordParts(seed.password)
    const account = { name: seed.name, email: seed.email, role: seed.role || 'vendor', salt, passwordHash }
    if (seed.vendorId) Object.assign(account, { vendorId: seed.vendorId, shopId: seed.shopId })
    const filter = seed.vendorId ? { vendorId: seed.vendorId } : { email: seed.email }
    const update = { $setOnInsert: account }
    if (seed.adminId) update.$set = { adminId: seed.adminId }
    return { updateOne: { filter, update, upsert: true } }
  })
  const stateOps = shops.map((shop) => ({ updateOne: { filter: { shopId: shop.id }, update: { $setOnInsert: { shopId: shop.id, isOpen: true } }, upsert: true } }))
  const stockOps = shops.flatMap((shop) => shop.products.map((product) => {
    product.offlinePrice = product.price
    return { updateOne: { filter: { shopId: shop.id, productId: product.id }, update: { $setOnInsert: { shopId: shop.id, productId: product.id, inStock: true } }, upsert: true } }
  }))
  await Promise.all([Account.bulkWrite(accountOps), ShopState.bulkWrite(stateOps), ProductStock.bulkWrite(stockOps)])
}

app.use(cors())
app.post('/api/webhooks/razorpay', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res, next) => {
  try {
    await connectDatabase()
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET
    if (!webhookSecret) return res.status(503).json({ error: 'Razorpay webhook is not configured.' })
    const signature = req.headers['x-razorpay-signature']
    const expected = createHmac('sha256', webhookSecret).update(req.body).digest('hex')
    if (!secureStringEqual(signature, expected)) return res.status(400).json({ error: 'Invalid webhook signature.' })
    const event = JSON.parse(req.body.toString('utf8'))
    if (event.event === 'payment.captured') {
      const paid = event.payload?.payment?.entity
      const payment = paid?.order_id && await Payment.findOne({ razorpayOrderId: paid.order_id })
      if (payment) await createOrderFromCapturedPayment(payment, paid)
    }
    res.json({ ok: true })
  } catch (err) { next(err) }
})
app.use(express.json({ limit: '32kb' }))
app.use(async (_req, _res, next) => {
  try {
    await connectDatabase()
    next()
  } catch (err) {
    next(err)
  }
})
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'CanteenOne API', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }))
app.get('/api/shops', async (_req, res, next) => {
  try {
    const [stocks, savedItems, states] = await Promise.all([ProductStock.find().lean(), MenuItem.find().lean(), ShopState.find().lean()])
    const sharedData = { stocks, savedItems, states }
    res.json({ shops: await Promise.all(shops.map((shop) => menuForShop(shop, sharedData))) })
  } catch (err) { next(err) }
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
    const user = await Account.findOne({ $or: [{ email: identifier.toLowerCase() }, { vendorId: identifier.toUpperCase() }, { adminId: identifier.toUpperCase() }] }).select('+passwordHash +salt')
    if (!user || typeof req.body?.password !== 'string' || !passwordMatches(user, req.body.password)) return res.status(401).json({ error: 'ID or password is incorrect.' })
    if (req.body?.role && user.role !== req.body.role) return res.status(403).json({ error: 'Use the correct sign-in page for this account.' })
    if (user.role === 'vendor' && !findShop(user.shopId)) return res.status(403).json({ error: 'This vendor account is not linked to an active canteen.' })
    const token = await createSession(user)
    res.json({ token, user: publicUser(user) })
  } catch (err) { next(err) }
})
app.get('/api/auth/me', auth, (req, res) => res.json({ user: publicUser(req.user) }))
app.post('/api/auth/logout', auth, async (req, res, next) => { try { await Session.deleteOne({ tokenHash: req.sessionTokenHash }); res.json({ ok: true }) } catch (err) { next(err) } })

app.post('/api/payments/razorpay/order', auth, requireRole('student'), async (req, res, next) => {
  try {
    const { shopId, items, note = '', readyInMinutes } = req.body ?? {}
    const baseShop = findShop(shopId)
    if (!baseShop) return res.status(400).json({ error: 'Choose a valid canteen.' })
    const shop = await menuForShop(baseShop)
    if (!shop.isOpen) return res.status(409).json({ error: 'This canteen is currently closed to new orders.' })
    if (typeof note !== 'string' || note.length > 120) return res.status(400).json({ error: 'Order notes must be 120 characters or fewer.' })
    if (![15, 30, 45].includes(Number(readyInMinutes))) return res.status(400).json({ error: 'Choose a ready time between 15 and 45 minutes.' })
    if (!Array.isArray(items) || items.length < 1 || items.length > 30) return res.status(400).json({ error: 'Add between 1 and 30 menu items.' })
    const lineItems = []
    for (const item of items) {
      const product = shop.products.find((entry) => entry.id === item.productId)
      if (!product) return res.status(400).json({ error: 'One selected item is not sold by this canteen.' })
      if (!product.inStock) return res.status(409).json({ error: `${product.name} is currently out of stock.` })
      const quantity = Number(item.quantity)
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return res.status(400).json({ error: 'Item quantities must be between 1 and 20.' })
      lineItems.push({ productId: product.id, name: product.name, offlinePrice: product.offlinePrice, unitPrice: product.price, quantity, lineTotal: product.price * quantity })
    }
    const amount = lineItems.reduce((sum, item) => sum + item.lineTotal, 0)
    if (!Number.isSafeInteger(amount) || amount < 1) return res.status(400).json({ error: 'The order total is invalid.' })
    const gatewayOrder = await razorpayRequest('orders', { method: 'POST', body: {
      amount: amount * 100, currency: 'INR', receipt: `C1-${randomUUID().replaceAll('-', '').slice(0, 20)}`,
      notes: { studentId: String(req.user._id), shopId },
    } })
    const payment = await Payment.create({ _id: `PAY-${randomUUID().slice(0, 8).toUpperCase()}`, studentId: req.user._id, amount, currency: 'INR', status: 'created', mode: 'razorpay', razorpayOrderId: gatewayOrder.id, checkoutData: {
      shopId, shopName: shop.name, shopEmoji: shop.emoji, shopLogo: shop.logo,
      studentName: req.user.name, note: note.trim(), items: lineItems, readyInMinutes: Number(readyInMinutes),
    } })
    res.status(201).json({ keyId: razorpayCredentials()?.keyId, amount: gatewayOrder.amount, currency: gatewayOrder.currency, razorpayOrderId: gatewayOrder.id, paymentId: payment._id, merchantName: 'CanteenOne', shopName: shop.name, student: { name: req.user.name, email: req.user.email } })
  } catch (err) { next(err) }
})
app.post('/api/payments/razorpay/verify', auth, requireRole('student'), async (req, res, next) => {
  try {
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body ?? {}
    if (typeof orderId !== 'string' || typeof paymentId !== 'string' || typeof signature !== 'string') return res.status(400).json({ error: 'Razorpay did not return complete payment details.' })
    const payment = await Payment.findOne({ razorpayOrderId: orderId, studentId: req.user._id, mode: 'razorpay' })
    if (!payment) return res.status(404).json({ error: 'Checkout session not found. Please start checkout again.' })
    const { keySecret } = razorpayCredentials() || {}
    if (!keySecret) return res.status(503).json({ error: 'Razorpay is not configured.' })
    const expected = createHmac('sha256', keySecret).update(`${payment.razorpayOrderId}|${paymentId}`).digest('hex')
    if (!secureStringEqual(signature, expected)) return res.status(400).json({ error: 'Payment verification failed. No order was placed.' })
    let gatewayPayment = await razorpayRequest(`payments/${encodeURIComponent(paymentId)}`)
    if (gatewayPayment.order_id !== payment.razorpayOrderId || gatewayPayment.amount !== Math.round(payment.amount * 100) || gatewayPayment.currency !== payment.currency) return res.status(400).json({ error: 'The payment details do not match your cart.' })
    if (gatewayPayment.status === 'authorized') gatewayPayment = await razorpayRequest(`payments/${encodeURIComponent(paymentId)}/capture`, { method: 'POST', body: { amount: gatewayPayment.amount, currency: gatewayPayment.currency } })
    if (gatewayPayment.status !== 'captured') return res.status(402).json({ error: 'Payment has not been captured. Please check your payment status before retrying.' })
    const order = await createOrderFromCapturedPayment(payment, gatewayPayment)
    res.json({ order: orderJson(order) })
  } catch (err) { next(err) }
})
app.get('/api/orders', auth, async (req, res, next) => {
  try {
    const filter = req.user.role === 'vendor'
      ? { shopId: req.user.shopId, createdAt: indiaDayBounds() }
      : { studentId: req.user._id }
    const list = await Order.find(filter).sort({ createdAt: -1 }).lean()
    res.json({ orders: list.map((order) => ({ ...order, id: order.orderNo })) })
  } catch (err) { next(err) }
})
app.patch('/api/orders/:orderId/status', auth, requireRole('vendor'), async (req, res, next) => {
  try {
    const order = await Order.findOne({ orderNo: req.params.orderId, shopId: req.user.shopId })
    if (!order) return res.status(404).json({ error: 'Order not found for your canteen.' })
    const transitions = { new: 'preparing', accepted: 'preparing', preparing: 'ready', ready: 'delivered' }
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
    const product = shop && await findProductForShop(shop.id, req.params.productId)
    if (!shop || !product) return res.status(404).json({ error: 'Menu item not found for your canteen.' })
    if (typeof req.body?.inStock !== 'boolean') return res.status(400).json({ error: 'Choose whether this item is in stock.' })
    const stock = await ProductStock.findOneAndUpdate({ shopId: shop.id, productId: product.id }, { $set: { inStock: req.body.inStock } }, { new: true, upsert: true, setDefaultsOnInsert: true })
    res.json({ product: { ...product, offlinePrice: product.price, price: Math.max(1, product.price - 1), inStock: stock.inStock } })
  } catch (err) { next(err) }
})
app.patch('/api/vendor/shop/status', auth, requireRole('vendor'), async (req, res, next) => {
  try {
    if (typeof req.body?.isOpen !== 'boolean') return res.status(400).json({ error: 'Choose whether your canteen is open.' })
    const state = await ShopState.findOneAndUpdate({ shopId: req.user.shopId }, { $set: { isOpen: req.body.isOpen } }, { new: true, upsert: true, setDefaultsOnInsert: true })
    res.json({ isOpen: state.isOpen })
  } catch (err) { next(err) }
})
app.post('/api/vendor/cloudinary-signature', auth, requireRole('vendor'), (_req, res) => {
  const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = process.env
  if (!cloudName || !apiKey || !apiSecret) return res.status(503).json({ error: 'Cloudinary is not configured yet. Add its credentials to the server environment.' })
  const timestamp = Math.floor(Date.now() / 1000)
  const folder = `canteenone/${_req.user.shopId}`
  const signature = createHash('sha1').update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`).digest('hex')
  res.json({ cloudName, apiKey, timestamp, folder, signature })
})
app.post('/api/vendor/products', auth, requireRole('vendor'), async (req, res, next) => {
  try {
    const { name, description = '', category, price, image, prepTime = 10 } = req.body ?? {}
    const cleanName = typeof name === 'string' ? name.trim() : ''
    const cleanCategory = typeof category === 'string' ? category.trim() : ''
    const offlinePrice = Number(price)
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME
    if (cleanName.length < 2 || cleanName.length > 90) return res.status(400).json({ error: 'Enter a product name from 2 to 90 characters.' })
    if (!cleanCategory || cleanCategory.length > 40) return res.status(400).json({ error: 'Enter a category up to 40 characters.' })
    if (!Number.isInteger(offlinePrice) || offlinePrice < 2 || offlinePrice > 10000) return res.status(400).json({ error: 'Enter an offline price of ₹2 or more.' })
    if (typeof description !== 'string' || description.length > 240) return res.status(400).json({ error: 'Description must be 240 characters or fewer.' })
    if (!cloudName || typeof image !== 'string' || !image.startsWith(`https://res.cloudinary.com/${cloudName}/image/upload/`)) return res.status(400).json({ error: 'Upload a product image to this CanteenOne Cloudinary account.' })
    const prep = Number(prepTime)
    if (!Number.isInteger(prep) || prep < 1 || prep > 120) return res.status(400).json({ error: 'Preparation time must be between 1 and 120 minutes.' })
    const productId = `vendor-${randomUUID()}`
    const item = await MenuItem.create({ shopId: req.user.shopId, productId, name: cleanName, description: description.trim(), category: cleanCategory, price: offlinePrice, image, prepTime: prep, badge: 'NEW' })
    const stock = await ProductStock.create({ shopId: req.user.shopId, productId, inStock: true })
    res.status(201).json({ product: { id: item.productId, name: item.name, description: item.description, category: item.category, offlinePrice: item.price, price: Math.max(1, item.price - 1), image: item.image, prepTime: item.prepTime, badge: item.badge, inStock: stock.inStock } })
  } catch (err) { next(err) }
})
app.delete('/api/vendor/products/:productId', auth, requireRole('vendor'), async (req, res, next) => {
  try {
    const shop = findShop(req.user.shopId)
    const productId = req.params.productId
    const original = shop?.products.find((item) => item.id === productId)
    if (!shop) return res.status(404).json({ error: 'Canteen not found.' })
    if (original) {
      await MenuItem.findOneAndUpdate({ shopId: shop.id, productId }, { $set: { isDeleted: true }, $setOnInsert: { name: original.name, description: original.description || '', category: original.category, price: original.price, image: original.image } }, { upsert: true, new: true })
    } else {
      const deleted = await MenuItem.deleteOne({ shopId: shop.id, productId, isDeleted: false })
      if (!deleted.deletedCount) return res.status(404).json({ error: 'Menu item not found for your canteen.' })
    }
    await ProductStock.deleteOne({ shopId: shop.id, productId })
    res.json({ ok: true, productId })
  } catch (err) { next(err) }
})
app.get('/api/admin/reviews', auth, requireRole('admin'), async (_req, res, next) => {
  try {
    const [reviews, savedItems] = await Promise.all([Review.find().sort({ createdAt: -1 }).limit(300).lean(), MenuItem.find({ isDeleted: false }).lean()])
    const productsByKey = new Map()
    for (const shop of shops) for (const product of shop.products) productsByKey.set(`${shop.id}:${product.id}`, product.name)
    for (const product of savedItems) productsByKey.set(`${product.shopId}:${product.productId}`, product.name)
    const result = reviews.map((review) => ({
      id: String(review._id), shopId: review.shopId, shopName: findShop(review.shopId)?.name || review.shopId,
      productName: productsByKey.get(`${review.shopId}:${review.productId}`) || review.productId,
      studentName: review.studentName, rating: review.rating, comment: review.comment, createdAt: review.createdAt,
    }))
    res.json({ reviews: result })
  } catch (err) { next(err) }
})

app.get('/api/reviews', async (req, res, next) => {
  try {
    const { shopId, productId } = req.query
    if (!await findProductForShop(shopId, productId)) return res.status(400).json({ error: 'Choose a valid menu item.' })
    const reviews = await Review.find({ shopId, productId }).sort({ createdAt: -1 }).lean()
    const average = reviews.length ? reviews.reduce((sum, item) => sum + item.rating, 0) / reviews.length : 0
    res.json({ reviews, count: reviews.length, average: Number(average.toFixed(1)) })
  } catch (err) { next(err) }
})
app.post('/api/reviews', auth, requireRole('student'), async (req, res, next) => {
  try {
    const { shopId, productId, rating, comment } = req.body ?? {}
    if (!await findProductForShop(shopId, productId)) return res.status(400).json({ error: 'Choose a valid menu item.' })
    if (!Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5) return res.status(400).json({ error: 'Choose a rating from 1 to 5.' })
    if (typeof comment !== 'string' || comment.trim().length < 2 || comment.length > 500) return res.status(400).json({ error: 'Write a comment between 2 and 500 characters.' })
    const review = await Review.create({ shopId, productId, studentId: req.user._id, studentName: req.user.name, rating: Number(rating), comment: comment.trim() })
    res.status(201).json({ review })
  } catch (err) { next(err) }
})

app.use((err, _req, res, _next) => {
  console.error(err)
  if (err?.code === 11000) return res.status(409).json({ error: 'That account already exists.' })
  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600 ? err.status : 500
  const message = status === 500 ? 'The server could not complete that request.' : err.message
  res.status(status).json({ error: message })
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

export default app;
