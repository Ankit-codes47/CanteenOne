import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, Check, Clock3, ImagePlus, Plus, RefreshCw, Store, Trash2 } from 'lucide-react'

const money = (amount) => `₹${Number(amount).toFixed(0)}`
const nextStatus = { new: 'preparing', accepted: 'preparing', preparing: 'ready', ready: 'delivered' }
const statusText = { new: 'Order received', accepted: 'Paid · queued', preparing: 'Preparing', ready: 'Ready for pickup', delivered: 'Delivered' }

async function api(path, options = {}, token) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) } })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Request failed.')
  return data
}

export default function VendorDashboard({ user, token }) {
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [shop, setShop] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState({ name: '', description: '', category: 'Snacks', price: '', prepTime: '10', image: null })
  const seenOrders = useRef(null)
  const requestActive = useRef(false)
  const menuImageInput = useRef(null)

  const refresh = useCallback(async (showSpinner = true) => {
    if (requestActive.current) return
    requestActive.current = true
    if (showSpinner) setLoading(true)
    try {
      const [orderData, shopData] = await Promise.all([api('/api/orders', {}, token), api(`/api/shops/${user.shopId}`, {}, token)])
      const nextOrders = orderData.orders || []
      if (seenOrders.current) {
        const known = new Set(seenOrders.current)
        const arrivals = nextOrders.filter((order) => !known.has(order.id))
        if (arrivals.length) {
          const message = arrivals.length === 1 ? `New paid order from ${arrivals[0].studentName}` : `${arrivals.length} new paid orders received`
          setNotice(message)
          if ('Notification' in window && Notification.permission === 'granted') new Notification('CanteenOne · New order', { body: message })
        }
      }
      seenOrders.current = nextOrders.map((order) => order.id)
      setOrders(nextOrders)
      setShop(shopData.shop)
      setProducts(shopData.shop.products)
      setError('')
    } catch (err) { setError(err.message) } finally { requestActive.current = false; setLoading(false) }
  }, [token, user.shopId])

  useEffect(() => {
    refresh()
    const timer = window.setInterval(() => refresh(false), 3000)
    return () => window.clearInterval(timer)
  }, [refresh])
  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(''), 6500)
    return () => window.clearTimeout(timer)
  }, [notice])

  async function advance(order) {
    try {
      const data = await api(`/api/orders/${order.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus[order.status] }) }, token)
      setOrders((current) => current.map((item) => item.id === order.id ? data.order : item))
      setError('')
    } catch (err) { setError(err.message) }
  }
  async function toggleStock(product) {
    try {
      const data = await api(`/api/vendor/products/${product.id}/stock`, { method: 'PATCH', body: JSON.stringify({ inStock: !product.inStock }) }, token)
      setProducts((current) => current.map((item) => item.id === product.id ? data.product : item))
      setError('')
    } catch (err) { setError(err.message) }
  }
  async function toggleShop() {
    try {
      const data = await api('/api/vendor/shop/status', { method: 'PATCH', body: JSON.stringify({ isOpen: !shop.isOpen }) }, token)
      setShop((current) => ({ ...current, isOpen: data.isOpen }))
      setError('')
    } catch (err) { setError(err.message) }
  }
  async function addProduct(event) {
    event.preventDefault()
    if (!form.image) { setError('Choose a product image first.'); return }
    if (!form.image.type.startsWith('image/')) { setError('Choose an image file.'); return }
    if (form.image.size > 8 * 1024 * 1024) { setError('Choose an image smaller than 8 MB.'); return }
    setSaving(true); setError('')
    try {
      const signed = await api('/api/vendor/cloudinary-signature', { method: 'POST', body: JSON.stringify({}) }, token)
      const upload = new FormData()
      upload.append('file', form.image)
      upload.append('api_key', signed.apiKey)
      upload.append('timestamp', String(signed.timestamp))
      upload.append('folder', signed.folder)
      upload.append('signature', signed.signature)
      const response = await fetch(`https://api.cloudinary.com/v1_1/${signed.cloudName}/image/upload`, { method: 'POST', body: upload })
      const imageData = await response.json()
      if (!response.ok) throw new Error(imageData.error?.message || 'Cloudinary image upload failed.')
      await api('/api/vendor/products', { method: 'POST', body: JSON.stringify({ name: form.name, description: form.description, category: form.category, price: form.price, prepTime: form.prepTime, image: imageData.secure_url }) }, token)
      setForm({ name: '', description: '', category: 'Snacks', price: '', prepTime: '10', image: null })
      if (menuImageInput.current) menuImageInput.current.value = ''
      await refresh(false)
      setNotice('Menu item added and available to students.')
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }
  async function deleteProduct(product) {
    if (!window.confirm(`Remove ${product.name} from your menu?`)) return
    try {
      await api(`/api/vendor/products/${encodeURIComponent(product.id)}`, { method: 'DELETE' }, token)
      setProducts((current) => current.filter((item) => item.id !== product.id))
      setError('')
    } catch (err) { setError(err.message) }
  }

  const activeOrders = orders.filter((order) => order.status !== 'delivered')
  const delivered = orders.filter((order) => order.status === 'delivered')
  return <main className="vendor-page">
    {notice && <div className="vendor-live-notice" role="status"><Bell size={16} /> {notice}<button onClick={() => setNotice('')} aria-label="Dismiss notification">×</button></div>}
    <div className="vendor-heading"><div><span className="eyebrow muted">PRIVATE VENDOR WORKSPACE · TODAY</span><h1>{shop?.emoji} {shop?.name || user.name}</h1><p>Today's orders update automatically. Menu and availability changes appear on the student site within seconds.</p></div><div className="vendor-header-controls"><span className={`shop-state-pill ${shop?.isOpen ? 'shop-open' : 'shop-closed'}`}><i /> {shop?.isOpen ? 'Open to orders' : 'Closed to orders'}</span><button className={`shop-toggle-button ${shop?.isOpen ? 'close-shop' : 'open-shop'}`} onClick={toggleShop} disabled={!shop}>{shop?.isOpen ? 'Close shop' : 'Open shop'}</button><button className="secondary-button" onClick={() => refresh()} disabled={loading}><RefreshCw size={15} /> Refresh</button></div></div>
    {error && <div className="global-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss">Dismiss</button></div>}
    <div className="vendor-stats"><div><strong>{activeOrders.length}</strong><span>Open orders today</span></div><div><strong>{delivered.length}</strong><span>Delivered today</span></div><div><strong>{products.filter((item) => item.inStock).length}/{products.length}</strong><span>Items in stock</span></div></div>
    <section className="vendor-section"><div className="section-title"><div><span className="eyebrow muted">LIVE QUEUE · AUTO UPDATES</span><h2>Today's student orders</h2></div><span className="queue-note"><i /> Orders for {shop?.name}</span></div>{loading && !orders.length ? <div className="empty-message">Loading today's orders…</div> : activeOrders.length ? <div className="vendor-order-grid">{activeOrders.map((order) => <article className="vendor-order" key={order.id}><div className="vendor-order-top"><span className={`status-pill status-${order.status}`}>{statusText[order.status]}</span><span><Clock3 size={13} /> {new Date(order.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span></div><div className="vendor-token"><small>PICKUP TOKEN</small><strong>{order.token}</strong><span>Order #{order.id}</span></div><div className="vendor-customer"><span>Student</span><strong>{order.studentName}</strong></div><div className="vendor-lines">{order.items.map((item) => <div key={item.productId}><span><b>{item.quantity}×</b> {item.name}</span><span>{money(item.lineTotal)}</span></div>)}</div>{order.note && <p className="order-note">Note: {order.note}</p>}<div className="vendor-payment"><div><span>Payment receipt</span><b>{order.payment.receipt}</b></div><div><span>Paid</span><b>{money(order.payment.amount)}</b></div></div><div className="vendor-ready-time"><Clock3 size={14} /> Requested ready time: <strong>{new Date(order.readyAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</strong> ({order.readyInMinutes} min preorder)</div><button className="primary-button full" onClick={() => advance(order)}>{order.status === 'preparing' ? 'Mark ready for pickup' : order.status === 'ready' ? 'Mark delivered' : 'Start preparing'} {order.status === 'ready' || order.status === 'preparing' ? <Check size={15} /> : null}</button></article>)}</div> : <div className="empty-message vendor-empty"><Store size={24} /><strong>No new orders today</strong><span>Paid student orders will appear here automatically.</span></div>}</section>
    <section className="vendor-section stock-section"><div className="section-title"><div><span className="eyebrow muted">MENU CONTROL</span><h2>Stock availability</h2></div></div><div className="stock-list">{products.map((product) => <div className="stock-row" key={product.id}><span className="stock-product"><strong>{product.name}</strong><small>Online {money(product.price)} · counter {money(product.offlinePrice)} · {product.category}</small></span><button className={`stock-toggle ${product.inStock ? 'is-stocked' : ''}`} onClick={() => toggleStock(product)}><i /> {product.inStock ? 'In stock' : 'Sold out'}</button></div>)}</div></section>
    <section className="vendor-section menu-manage-section"><div className="section-title"><div><span className="eyebrow muted">MENU CONTROL</span><h2>Add a menu item</h2><p>Upload a real product photo; it will be stored in Cloudinary.</p></div></div><form className="menu-create-form" onSubmit={addProduct}><label>Product name<input required minLength="2" maxLength="90" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Paneer roll" /></label><label>Category<input required maxLength="40" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Snacks, Drinks…" /></label><label>Counter price (₹)<input required type="number" min="2" max="10000" step="1" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} placeholder="50" /></label><label>Prep minutes<input required type="number" min="1" max="120" value={form.prepTime} onChange={(event) => setForm({ ...form, prepTime: event.target.value })} /></label><label className="menu-description-field">Description<textarea maxLength="240" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Describe this item" /></label><label className="menu-image-field"><ImagePlus size={17} /> Product image<input ref={menuImageInput} required type="file" accept="image/*" onChange={(event) => setForm({ ...form, image: event.target.files?.[0] || null })} /><small>{form.image?.name || 'Choose JPG, PNG or WebP (max 8 MB)'}</small></label><button className="primary-button menu-add-button" disabled={saving || !shop?.isOpen}><Plus size={16} /> {saving ? 'Uploading…' : 'Add to menu'}</button></form></section>
    <section className="vendor-section"><div className="section-title"><div><span className="eyebrow muted">YOUR CURRENT MENU</span><h2>Manage products</h2></div><span className="shop-count">{products.length} items</span></div><div className="vendor-product-grid">{products.map((product) => <article className="vendor-product-card" key={product.id}><img src={product.image} alt={product.name} /><div className="vendor-product-info"><strong>{product.name}</strong><small>{money(product.price)} online · {money(product.offlinePrice)} counter</small><div><button className={`stock-toggle ${product.inStock ? 'is-stocked' : ''}`} onClick={() => toggleStock(product)}><i />{product.inStock ? 'In stock' : 'Sold out'}</button><button className="remove-product-button" onClick={() => deleteProduct(product)} aria-label={`Delete ${product.name}`}><Trash2 size={15} /> Remove</button></div></div></article>)}</div></section>
  </main>
}
