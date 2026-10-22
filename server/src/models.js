import mongoose from 'mongoose'

const accountSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, unique: true, sparse: true, trim: true },
  vendorId: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
  adminId: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  salt: { type: String, required: true, select: false },
  role: { type: String, enum: ['student', 'vendor', 'admin'], required: true },
  shopId: { type: String, default: null },
}, { timestamps: true })

const stockSchema = new mongoose.Schema({
  shopId: { type: String, required: true },
  productId: { type: String, required: true },
  inStock: { type: Boolean, default: true },
}, { timestamps: true })
stockSchema.index({ shopId: 1, productId: 1 }, { unique: true })


const menuItemSchema = new mongoose.Schema({
  shopId: { type: String, required: true },
  productId: { type: String, required: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  category: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 2 },
  image: { type: String, required: true },
  prepTime: { type: Number, default: 10 },
  badge: { type: String, default: 'NEW' },
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true })
menuItemSchema.index({ shopId: 1, productId: 1 }, { unique: true })

const shopStateSchema = new mongoose.Schema({
  shopId: { type: String, required: true, unique: true },
  isOpen: { type: Boolean, default: true },
}, { timestamps: true })

const paymentSchema = new mongoose.Schema({
  _id: { type: String },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  status: { type: String, enum: ['created', 'paid', 'failed'], default: 'created' },
  used: { type: Boolean, default: false },
  mode: { type: String, enum: ['demo', 'razorpay'], default: 'razorpay' },
  method: { type: String, default: '' },
  razorpayOrderId: { type: String, unique: true, sparse: true },
  razorpayPaymentId: { type: String, unique: true, sparse: true },
  checkoutData: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true })

const orderSchema = new mongoose.Schema({
  orderNo: { type: String, required: true, unique: true },
  token: { type: String, required: true, unique: true },
  shopId: { type: String, required: true, index: true },
  shopName: { type: String, required: true },
  shopEmoji: { type: String, default: '🍽️' },
  shopLogo: { type: String, default: '' },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true, index: true },
  studentName: { type: String, required: true },
  note: { type: String, default: '' },
  items: [{ productId: String, name: String, offlinePrice: Number, unitPrice: Number, quantity: Number, lineTotal: Number }],
  total: { type: Number, required: true },
  savings: { type: Number, required: true },
  payment: { receipt: String, amount: Number, status: String, mode: String, method: String, paidAt: Date },
  readyInMinutes: { type: Number, enum: [15, 30, 45], required: true },
  readyAt: { type: Date, required: true },
  status: { type: String, enum: ['new', 'accepted', 'preparing', 'ready', 'delivered'], default: 'new', index: true },
  deliveredAt: { type: Date, default: null },
}, { timestamps: true })
orderSchema.index({ shopId: 1, createdAt: -1 })
orderSchema.index({ studentId: 1, createdAt: -1 })
orderSchema.index({ 'payment.receipt': 1 }, { unique: true, sparse: true })

const reviewSchema = new mongoose.Schema({
  shopId: { type: String, required: true, index: true },
  productId: { type: String, required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  studentName: { type: String, required: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String, trim: true, minlength: 2, maxlength: 500, required: true },
}, { timestamps: true })

const sessionSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true, index: true },
  expiresAt: { type: Date, required: true, expires: 0 },
}, { timestamps: true })

export const Account = mongoose.model('Account', accountSchema)
export const ProductStock = mongoose.model('ProductStock', stockSchema)
export const MenuItem = mongoose.model('MenuItem', menuItemSchema)
export const ShopState = mongoose.model('ShopState', shopStateSchema)
export const Payment = mongoose.model('Payment', paymentSchema)
export const Order = mongoose.model('Order', orderSchema)
export const Review = mongoose.model('Review', reviewSchema)
export const Session = mongoose.model('Session', sessionSchema)
