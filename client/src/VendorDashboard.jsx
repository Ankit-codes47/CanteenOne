import { useCallback, useEffect, useState } from 'react'
import { Check, Clock3, RefreshCw, Store } from 'lucide-react'

const money = (amount) => `₹${Number(amount).toFixed(0)}`
const nextStatus = { new: 'accepted', accepted: 'preparing', preparing: 'ready', ready: 'delivered' }
const statusText = { new: 'New order', accepted: 'Accepted', preparing: 'Preparing', ready: 'Ready for pickup', delivered: 'Delivered' }
async function api(path, options, token) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options?.headers || {}) } })
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

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [orderData, shopData] = await Promise.all([api('/api/orders', {}, token), api(`/api/shops/${user.shopId}`, {}, token)])
      setOrders(orderData.orders)
      setShop(shopData.shop)
      setProducts(shopData.shop.products)
      setError('')
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [token, user.shopId])
  useEffect(() => { refresh() }, [refresh])

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

  const activeOrders = orders.filter((order) => order.status !== 'delivered')
  const delivered = orders.filter((order) => order.status === 'delivered')
  return <main className="vendor-page"><div className="vendor-heading"><div><span className="eyebrow muted">PRIVATE VENDOR WORKSPACE</span><h1>{shop?.emoji} {shop?.name || user.name}</h1><p>Only this canteen's orders and menu are shown in this account.</p></div><button className="secondary-button" onClick={refresh} disabled={loading}><RefreshCw size={15} /> Refresh</button></div>{error && <div className="global-error">{error}<button onClick={() => setError('')}>Dismiss</button></div>}<div className="vendor-stats"><div><strong>{activeOrders.length}</strong><span>Open orders</span></div><div><strong>{delivered.length}</strong><span>Delivered orders</span></div><div><strong>{products.filter((item) => item.inStock).length}/{products.length}</strong><span>Items in stock</span></div></div><section className="vendor-section"><div className="section-title"><div><span className="eyebrow muted">LIVE QUEUE</span><h2>Student orders</h2></div><span className="queue-note"><i /> Orders for {shop?.name}</span></div>{loading && !orders.length ? <div className="empty-message">Loading your orders…</div> : activeOrders.length ? <div className="vendor-order-grid">{activeOrders.map((order) => <article className="vendor-order" key={order.id}><div className="vendor-order-top"><span className={`status-pill status-${order.status}`}>{statusText[order.status]}</span><span><Clock3 size={13} /> {new Date(order.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></div><div className="vendor-token"><small>PICKUP TOKEN</small><strong>{order.token}</strong><span>Order #{order.id}</span></div><div className="vendor-customer"><span>Student</span><strong>{order.studentName}</strong></div><div className="vendor-lines">{order.items.map((item) => <div key={item.productId}><span><b>{item.quantity}×</b> {item.name}</span><span>{money(item.lineTotal)}</span></div>)}</div>{order.note && <p className="order-note">Note: {order.note}</p>}<div className="vendor-payment"><div><span>Payment receipt</span><b>{order.payment.receipt}</b></div><div><span>Paid</span><b>{money(order.payment.amount)}</b></div></div><div className="vendor-ready-time"><Clock3 size={14} /> Requested ready time: <strong>{new Date(order.readyAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</strong> ({order.readyInMinutes} min preorder)</div><button className="primary-button full" onClick={() => advance(order)}>{order.status === 'new' ? 'Accept order' : order.status === 'accepted' ? 'Start preparing' : order.status === 'preparing' ? 'Mark ready for pickup' : 'Complete pickup'} {order.status === 'ready' ? <Check size={15} /> : null}</button></article>)}</div> : <div className="empty-message vendor-empty"><Store size={24} /><strong>No new orders</strong><span>Student orders for your canteen will appear here.</span></div>}</section><section className="vendor-section stock-section"><div className="section-title"><div><span className="eyebrow muted">MENU CONTROL</span><h2>Stock availability</h2></div></div><div className="stock-list">{products.map((product) => <div className="stock-row" key={product.id}><span className="stock-product"><strong>{product.name}</strong><small>Online {money(product.price)} · counter {money(product.offlinePrice)} · {product.category}</small></span><button className={`stock-toggle ${product.inStock ? 'is-stocked' : ''}`} onClick={() => toggleStock(product)}><i /> {product.inStock ? 'In stock' : 'Sold out'}</button></div>)}</div></section></main>
}
