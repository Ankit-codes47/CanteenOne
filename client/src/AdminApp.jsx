import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, LogOut, MessageSquareText, Search, ShieldCheck, Star, Store } from 'lucide-react'

const tokenKey = 'canteenone-admin-token'
async function request(path, options = {}, token = localStorage.getItem(tokenKey)) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(path, { ...options, headers })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Could not complete the request.')
  return data
}

export default function AdminApp() {
  const [token, setToken] = useState(localStorage.getItem(tokenKey) || '')
  const [admin, setAdmin] = useState(null)
  const [adminId, setAdminId] = useState('')
  const [password, setPassword] = useState('')
  const [reviews, setReviews] = useState([])
  const [shops, setShops] = useState([])
  const [selectedShopId, setSelectedShopId] = useState('')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!token) return
    request('/api/auth/me', {}, token).then(({ user }) => {
      if (user.role !== 'admin') throw new Error('This account does not have administrator access.')
      setAdmin(user)
    }).catch((err) => { localStorage.removeItem(tokenKey); setToken(''); setError(err.message) })
  }, [])
  useEffect(() => {
    if (!admin || !token) return
    let live = true
    const load = async () => {
      try { const result = await request('/api/admin/reviews', {}, token); if (live) { setReviews(result.reviews); setError('') } }
      catch (err) { if (live) setError(err.message) }
      finally { if (live) setLoading(false) }
    }
    setLoading(true); load()
    const timer = window.setInterval(load, 10000)
    return () => { live = false; window.clearInterval(timer) }
  }, [admin, token])
  useEffect(() => {
    if (!admin) return
    let live = true
    request('/api/shops', {}, '').then(({ shops: result }) => { if (live) setShops(result) }).catch(() => {})
    return () => { live = false }
  }, [admin])

  async function signIn(event) {
    event.preventDefault(); setLoading(true); setError('')
    try {
      const result = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ identifier: adminId, password, role: 'admin' }) }, '')
      localStorage.setItem(tokenKey, result.token); setToken(result.token); setAdmin(result.user); setPassword('')
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }
  async function signOut() {
    try { await request('/api/auth/logout', { method: 'POST' }, token) } catch {}
    localStorage.removeItem(tokenKey); setToken(''); setAdmin(null); setReviews([])
  }
  const selectedShop = shops.find((shop) => shop.id === selectedShopId)
  const filtered = useMemo(() => reviews.filter((review) => (!selectedShopId || review.shopId === selectedShopId) && `${review.shopName} ${review.productName} ${review.studentName} ${review.comment}`.toLowerCase().includes(query.toLowerCase())), [reviews, query, selectedShopId])

  return <div className="app-shell admin-app-shell">
    <header className="topbar admin-topbar"><a className="brand" href="/admin.html"><span className="brand-mark"><ShieldCheck size={18} /></span><span>Canteen<span className="brand-light">One</span> <small className="vendor-brand-label">ADMIN</small></span></a>{admin && <div className="header-actions"><span className="account-chip"><ShieldCheck size={15} /> {admin.name}</span><button className="logout-button" onClick={signOut}><LogOut size={16} /><span>Sign out</span></button></div>}</header>
    {error && <div className="global-error" role="alert">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
    {!admin ? <main className="auth-page"><div className="auth-card"><div className="auth-brand"><span className="brand-mark"><ShieldCheck size={18} /></span><div><span className="eyebrow muted">PRIVATE ADMIN PORTAL</span><h1>Administrator sign in</h1></div></div><p className="admin-intro">This separate workspace is limited to viewing customer reviews for campus shops and products.</p><form className="auth-form" onSubmit={signIn}><label>Admin login ID<input type="text" autoComplete="username" required value={adminId} onChange={(event) => setAdminId(event.target.value)} placeholder="CTN-ADMIN-01" /></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Admin password" /></label><button className="primary-button full" disabled={loading}>{loading ? 'Please wait…' : 'Sign in to admin portal'}</button></form><p className="secure-note">Admin credentials are configured by the project owner.</p></div></main> : <main className="admin-page"><div className="admin-page-heading"><div><span className="eyebrow muted">PRIVATE ADMIN PORTAL · REVIEWS ONLY</span><h1>Customer feedback</h1><p>{selectedShop ? `All reviews for ${selectedShop.name}.` : 'Review comments by canteen and product. This portal does not show orders or payment data.'}</p></div><div className="admin-review-count"><MessageSquareText size={18} /><strong>{filtered.length}</strong><span>{selectedShop ? 'shop reviews' : 'reviews'}</span></div></div><section className="admin-shop-picker" aria-label="Filter reviews by shop"><div className="admin-shop-picker-heading"><div><span className="eyebrow muted">BROWSE BY CANTEEN</span><h2><Store size={16} /> Select a shop to see its reviews</h2></div>{selectedShopId && <button className="admin-all-shops" onClick={() => setSelectedShopId('')}><ArrowLeft size={14} /> All shops</button>}</div><div className="admin-shop-grid"><button className={`admin-shop-tile ${!selectedShopId ? 'selected' : ''}`} onClick={() => setSelectedShopId('')} aria-pressed={!selectedShopId}><span className="admin-shop-logo all-shops-logo"><Store size={23} /></span><span><strong>All shops</strong><small>{reviews.length} reviews</small></span></button>{shops.map((shop) => { const count = reviews.filter((review) => review.shopId === shop.id).length; return <button className={`admin-shop-tile ${selectedShopId === shop.id ? 'selected' : ''}`} key={shop.id} onClick={() => { setSelectedShopId(shop.id); setQuery('') }} aria-pressed={selectedShopId === shop.id}><span className="admin-shop-logo"><img src={shop.logo} alt="" /></span><span><strong>{shop.name}</strong><small>{count} {count === 1 ? 'review' : 'reviews'}</small></span></button> })}</div></section><label className="admin-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${selectedShop ? selectedShop.name : 'shops'}, products, customers or comments`} /></label>{loading && !reviews.length ? <div className="empty-message">Loading reviews…</div> : filtered.length ? <div className="admin-review-list">{filtered.map((review) => <article className="admin-review-card" key={review.id}><div className="admin-review-card-top"><span><strong>{review.shopName}</strong><i>·</i>{review.productName}</span><time>{new Date(review.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</time></div><div className="admin-review-rating" aria-label={`${review.rating} out of 5 stars`}><span>{Array.from({ length: 5 }, (_, index) => <Star size={14} key={index} fill={index < review.rating ? 'currentColor' : 'none'} />)}</span><small>by {review.studentName}</small></div><p>{review.comment}</p></article>)}</div> : <div className="empty-message admin-empty"><MessageSquareText size={24} /><strong>No reviews found</strong><span>{query ? 'Try another search.' : selectedShop ? `No reviews have been submitted for ${selectedShop.name} yet.` : 'Customer product and shop reviews will appear here.'}</span></div>}</main>}
  </div>
}
