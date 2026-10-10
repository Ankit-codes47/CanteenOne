import { useEffect, useState } from 'react'
import { ArrowRight, LogOut, Store, UtensilsCrossed } from 'lucide-react'
import VendorDashboard from './VendorDashboard.jsx'

const tokenKey = 'canteenone-vendor-token'
async function request(path, options = {}, token = localStorage.getItem(tokenKey)) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(path, { ...options, headers })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Could not complete sign in.')
  return data
}

export default function VendorApp() {
  const [token, setToken] = useState(localStorage.getItem(tokenKey) || '')
  const [user, setUser] = useState(null)
  const [vendorId, setVendorId] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    request('/api/auth/me', {}, token).then(({ user: current }) => {
      if (current.role !== 'vendor') throw new Error('Please use a vendor account to open this workspace.')
      setUser(current)
    }).catch((err) => { localStorage.removeItem(tokenKey); setToken(''); setError(err.message) })
  }, [])

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const result = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ identifier: vendorId, password, role: 'vendor' }) }, '')
      localStorage.setItem(tokenKey, result.token)
      setToken(result.token); setUser(result.user); setPassword('')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function signOut() {
    try { await request('/api/auth/logout', { method: 'POST' }, token) } catch {}
    localStorage.removeItem(tokenKey); setToken(''); setUser(null)
  }

  return <div className="app-shell vendor-app-shell">
    <header className="topbar vendor-topbar">
      <a className="brand" href="/vendor.html"><span className="brand-mark"><UtensilsCrossed size={18} /></span><span>Canteen<span className="brand-light">One</span> <small className="vendor-brand-label">VENDOR</small></span></a>
      {user && <div className="header-actions"><span className="account-chip"><Store size={15} /> {user.name}</span><button className="logout-button" onClick={signOut}><LogOut size={16} /><span>Sign out</span></button></div>}
    </header>
    {!user ? <main className="auth-page vendor-auth-page"><div className="auth-card"><div className="auth-brand"><span className="brand-mark"><Store size={18} /></span><div><span className="eyebrow muted">PRIVATE VENDOR WORKSPACE</span><h1>Vendor sign in</h1></div></div><p className="vendor-login-intro">This secure workspace is for canteen vendors. Student accounts use the CanteenOne student website.</p>{error && <div className="global-error" role="alert">{error}</div>}<form className="auth-form" onSubmit={submit}><label>Vendor ID<input type="text" autoComplete="username" required value={vendorId} onChange={(event) => setVendorId(event.target.value)} placeholder="Your canteen vendor ID" /></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your vendor password" /></label><button className="primary-button full" disabled={busy}>{busy ? 'Please wait…' : 'Open vendor workspace'} <ArrowRight size={16} /></button></form><p className="secure-note">This account only shows orders and stock for its assigned canteen.</p></div></main> : <VendorDashboard user={user} token={token} />}
    <BbdCorner />
  </div>
}

function BbdCorner() { return <div className="bbd-corner"><img src="/logos/bbd.jpg" alt="BBD" /></div> }
