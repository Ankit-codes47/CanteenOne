import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Building2, Check, ChevronDown, ClipboardList, Clock3, CreditCard, LogIn, LogOut, Minus, Plus, Search, ShoppingBag, Smartphone, UtensilsCrossed, X } from 'lucide-react'

const money = (amount) => `₹${Number(amount).toFixed(0)}`
const statusNames = { new: 'Received', accepted: 'Paid · queued', preparing: 'Preparing', ready: 'Ready for pickup', delivered: 'Delivered' }
const initialScreen = () => 'home'

async function request(path, options = {}, token = localStorage.getItem('canteenone-token')) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(path, { ...options, headers })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.')
  return data
}

export default function App() {
  const [shops, setShops] = useState([])
  const [selectedShopId, setSelectedShopId] = useState(() => { const stored = localStorage.getItem('canteenone-shop') || ''; return ['urban-vada-pav', 'm-coin', 'chaigaram', 'ke7', 'mr-sandwich'].includes(stored) ? stored : '' })
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(localStorage.getItem('canteenone-token') || '')
  const [screen, setScreenState] = useState(initialScreen)
  function setScreen(next) {
    setScreenState(next)
    const path = next === 'auth' ? '/login' : next === 'orders' ? '/orders' : next === 'shop' ? '/shop' : '/' 
    if (window.location.pathname !== path) window.history.pushState({}, '', path)
  }
  const [authMode, setAuthMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [note, setNote] = useState('')
  const [readyInMinutes, setReadyInMinutes] = useState(15)
  const [paymentMethod, setPaymentMethod] = useState('upi')
  const [myOrders, setMyOrders] = useState([])
  const [orderNotice, setOrderNotice] = useState('')
  const knownStatuses = useRef(null)
  const [receipt, setReceipt] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [checkingSession, setCheckingSession] = useState(false)
  const [cartPulse, setCartPulse] = useState(false)

  useEffect(() => {
    const handlePopState = () => setScreenState(initialScreen())
    if (window.location.pathname.startsWith('/vendor')) window.location.replace('/vendor.html')
    window.addEventListener('popstate', handlePopState)
    const refreshShops = (showError = false) => request('/api/shops', {}, '').then(({ shops: data }) => setShops(data)).catch((err) => { if (showError) setError(err.message) })
    refreshShops(true)
    const shopTimer = window.setInterval(() => refreshShops(), 3000)
    if (token) request('/api/auth/me', {}, token).then(({ user: current }) => {
      if (current.role !== 'student') { localStorage.removeItem('canteenone-token'); setToken(''); return }
      setUser(current)
      setScreen('home')
    }).catch(() => { localStorage.removeItem('canteenone-token'); setToken('') })
    return () => { window.removeEventListener('popstate', handlePopState); window.clearInterval(shopTimer) }
  }, [])

  useEffect(() => {
    if (!token || user?.role !== 'student') return undefined
    let active = true
    const refreshOrders = async () => {
      try {
        const data = await request('/api/orders', {}, token)
        if (!active) return
        const nextOrders = data.orders || []
        const previous = knownStatuses.current
        if (previous) {
          const changed = nextOrders.find((order) => previous[order.id] && previous[order.id] !== order.status)
          if (changed) setOrderNotice(`${changed.shopName}: ${statusNames[changed.status] || changed.status}`)
        }
        knownStatuses.current = Object.fromEntries(nextOrders.map((order) => [order.id, order.status]))
        setMyOrders(nextOrders)
      } catch {}
    }
    refreshOrders()
    const timer = window.setInterval(refreshOrders, 3000)
    return () => { active = false; window.clearInterval(timer) }
  }, [token, user?.id, user?.role])
  useEffect(() => {
    if (!orderNotice) return undefined
    const timer = window.setTimeout(() => setOrderNotice(''), 7000)
    return () => window.clearTimeout(timer)
  }, [orderNotice])

  const selectedShop = shops.find((shop) => shop.id === selectedShopId)
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  const categories = useMemo(() => ['All', ...new Set((selectedShop?.products || []).map((product) => product.category))], [selectedShop])
  const visibleProducts = useMemo(() => (selectedShop?.products || []).filter((product) =>
    (category === 'All' || product.category === category) &&
    (!search || `${product.name} ${product.description}`.toLowerCase().includes(search.toLowerCase()))
  ), [selectedShop, category, search])

  async function chooseShop(shop) {
    setCheckingSession(true)
    setError('')
    let activeStudent = null
    const savedToken = localStorage.getItem('canteenone-token')
    if (savedToken) {
      try {
        const result = await request('/api/auth/me', {}, savedToken)
        if (result.user.role === 'student') {
          activeStudent = result.user
          setUser(result.user)
          setToken(savedToken)
        } else {
          localStorage.removeItem('canteenone-token')
          setToken('')
          setUser(null)
        }
      } catch {
        localStorage.removeItem('canteenone-token')
        setToken('')
        setUser(null)
      }
    }
    if (selectedShopId && selectedShopId !== shop.id) setCart([])
    setSelectedShopId(shop.id)
    setCategory('All')
    setSearch('')
    localStorage.setItem('canteenone-shop', shop.id)
    setAuthMode('login')
    setScreen(activeStudent ? 'shop' : 'auth')
    setCheckingSession(false)
  }

  async function submitAuth(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const path = authMode === 'register' ? '/api/auth/register' : '/api/auth/login'
      const body = authMode === 'register' ? { name, email, password } : { identifier: email, password, role: 'student' }
      const result = await request(path, { method: 'POST', body: JSON.stringify(body) }, '')
      localStorage.setItem('canteenone-token', result.token)
      setToken(result.token); setUser(result.user)
      setScreen(selectedShopId ? 'shop' : 'home')
      setPassword('')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function signOut() {
    try { await request('/api/auth/logout', { method: 'POST' }, token) } catch {}
    localStorage.removeItem('canteenone-token'); setToken(''); setUser(null); setCart([]); setScreen('home')
  }

  function addToCart(product) {
    if (!user) { setAuthMode('login'); setScreen('auth'); return false }
    if (!product.inStock) return false
    setCart((current) => {
      const found = current.find((item) => item.id === product.id)
      return found ? current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item) : [...current, { ...product, quantity: 1 }]
    })
    setCartPulse(true)
    window.setTimeout(() => setCartPulse(false), 520)
    return true
  }
  function changeQuantity(id, delta) {
    setCart((current) => current.map((item) => item.id === id ? { ...item, quantity: item.quantity + delta } : item).filter((item) => item.quantity > 0))
  }

  async function payAndPlaceOrder(event) {
    event.preventDefault()
    if (selectedShop?.isOpen === false) { setError('This canteen is currently closed to new orders.'); return }
    setBusy(true); setError('')
    try {
      const payment = await request('/api/payments/demo', { method: 'POST', body: JSON.stringify({ amount: subtotal, method: paymentMethod }) }, token)
      const created = await request('/api/orders', { method: 'POST', body: JSON.stringify({ shopId: selectedShopId, items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })), note, readyInMinutes, paymentId: payment.payment.id }) }, token)
      setReceipt(created.order); setCart([]); setNote(''); setCheckoutOpen(false); setCartOpen(false)
      await loadStudentOrders()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function loadStudentOrders() {
    try {
      const data = await request('/api/orders', {}, token)
      const nextOrders = data.orders || []
      const previous = knownStatuses.current
      if (previous) {
        const changed = nextOrders.find((order) => previous[order.id] && previous[order.id] !== order.status)
        if (changed) setOrderNotice(`${changed.shopName}: ${statusNames[changed.status] || changed.status}`)
      }
      knownStatuses.current = Object.fromEntries(nextOrders.map((order) => [order.id, order.status]))
      setMyOrders(nextOrders)
    } catch (err) { setError(err.message) }
  }
  async function openOrders() { await loadStudentOrders(); setScreen('orders') }

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => setScreen('home')}><span className="brand-mark"><UtensilsCrossed size={18} /></span><span>Canteen<span className="brand-light">One</span></span></button>
      {screen === 'shop' && selectedShop && <nav className="shop-nav"><button className="nav-active" onClick={() => setScreen('shop')}>Menu</button><button onClick={openOrders}>My orders</button><button onClick={() => document.querySelector('#menu')?.scrollIntoView({ behavior: 'smooth' })}>Offers</button></nav>}
      <div className="header-actions">
        {screen === 'shop' && selectedShop && <span className="campus-label"><MapPinIcon /> Campus pickup</span>}
        {user?.role === 'student' && screen === 'shop' && <><button className="orders-button" onClick={openOrders} aria-label="View my orders and feedback"><ClipboardOrdersIcon /><span>My orders</span>{myOrders.length > 0 && <b className="orders-count">{myOrders.length}</b>}</button><button className={`cart-button ${cartPulse ? 'cart-bump' : ''}`} onClick={() => setCartOpen(true)}><ShoppingBag size={17} /><span>Cart</span>{cartCount > 0 && <b className="cart-count">{cartCount}</b>}</button></>}
        {user && <button className="logout-button" onClick={signOut} title="Sign out"><LogOut size={16} /><span>Sign out</span></button>}
        {!user && <button className="login-button" aria-label="Student sign in or register" onClick={() => { setAuthMode('login'); setScreen('auth') }}><LogIn size={16} /> Sign in / Register</button>}
      </div>
    </header>

    {error && <div className="global-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={16} /></button></div>}
    {orderNotice && <div className="student-live-notice" role="status">{orderNotice}<button onClick={() => setOrderNotice('')} aria-label="Dismiss update">×</button></div>}

    {screen === 'home' && <main>
      <section className="welcome-hero"><div className="welcome-copy"><span className="eyebrow">YOUR CAMPUS FOOD, ALL IN ONE PLACE</span><h1>Lunch break?<br /><em>Handled.</em></h1><p>Choose your canteen, order ahead from class, and pick up when it suits you.</p><div className="hero-badges"><span><Clock3 size={15} /> Ready in 15–45 min</span><span><Check size={15} /> Pay online</span></div></div><div className="welcome-illustration"><div className="illustration-plate">🥗</div><span className="floating-food food-a">🥪</span><span className="floating-food food-b">☕</span><span className="floating-food food-c">🥞</span><div className="illustration-caption">Made for your campus day</div></div></section>
      <section className="canteen-picker"><div className="section-title"><div><span className="eyebrow muted">PICK A COUNTER</span><h2>Which canteen today?</h2><p>Tap a canteen to see its menu and order.</p></div><span className="shop-count">{shops.length} campus spots</span></div><div className="canteen-grid">{shops.map((shop) => <button className="canteen-tile" key={shop.id} disabled={checkingSession} onClick={() => chooseShop(shop)}><span className={`canteen-logo ${shop.theme}`}><img src={shop.logo} alt={`${shop.name} logo`} /></span><span className="canteen-tile-copy"><strong>{shop.name}</strong><small>{shop.description}</small><span className="tile-meta">★ {shop.rating} <i>·</i> {shop.eta} <i>·</i> <b className={shop.isOpen === false ? 'tile-closed' : 'tile-open'}>{shop.isOpen === false ? 'CLOSED' : 'OPEN'}</b></span></span><ArrowRight size={18} className="tile-arrow" /></button>)}</div></section>
      <section className="simple-steps"><span>01 <b>Choose your canteen</b></span><i /><span>02 <b>Order from class</b></span><i /><span>03 <b>Pick up with your token</b></span></section>
    </main>}

    {screen === 'auth' && <main className="auth-page"><button className="back-link" onClick={() => setScreen('home')}><ArrowLeft size={16} /> Back to canteens</button><div className="auth-card"><div className="auth-brand">{selectedShop ? <span className={`canteen-logo auth-logo ${selectedShop.theme}`}><img src={selectedShop.logo} alt={`${selectedShop.name} logo`} /></span> : <span className="brand-mark"><UtensilsCrossed size={18} /></span>}<div><span className="eyebrow muted">CANTEENONE ACCOUNT</span><h1>{selectedShop ? `Continue to ${selectedShop.name}` : 'Welcome back'}</h1></div></div><div className="mode-switch"><button className={authMode === 'login' ? 'active' : ''} onClick={() => { setAuthMode('login'); setError('') }}>Log in</button><button className={authMode === 'register' ? 'active' : ''} onClick={() => { setAuthMode('register'); setError('') }}>Create account</button></div><form className="auth-form" onSubmit={submitAuth}>{authMode === 'register' && <label>Your name<input autoComplete="name" required minLength="2" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" /></label>}<label>Email address<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label><label>Password<input type="password" autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /></label><button className="primary-button full" disabled={busy}>{busy ? 'Please wait…' : authMode === 'register' ? 'Create my account' : 'Continue'} <ArrowRight size={16} /></button></form><p className="secure-note">{selectedShop ? `After sign in, you will continue to ${selectedShop.name}.` : 'Create a student account to order from any campus canteen.'}</p></div></main>}


    {screen === 'shop' && selectedShop && <main className="shop-page"><div className="shop-cover"><button className="back-link" onClick={() => setScreen('home')}><ArrowLeft size={15} /> All canteens</button><div className="shop-cover-main"><span className={`canteen-logo big-logo ${selectedShop.theme}`}><img src={selectedShop.logo} alt={`${selectedShop.name} logo`} /></span><div><span className="eyebrow">CAMPUS CANTEEN</span><h1>{selectedShop.name}</h1><p>{selectedShop.description}</p><div className="shop-details"><span>★ {selectedShop.rating}</span><span>·</span><span><Clock3 size={14} /> {selectedShop.eta}</span><span>·</span><span>Preorder pickup</span></div></div></div><div className={`open-status ${selectedShop.isOpen === false ? 'is-closed' : ''}`}><i /> {selectedShop.isOpen === false ? 'CLOSED' : 'OPEN'}</div></div>{selectedShop.isOpen === false && <div className="closed-shop-message" role="status">This canteen is closed right now. You can browse its menu, but ordering is paused.</div>}<section id="menu" className="shop-menu"><div className="menu-toolbar"><div><span className="eyebrow muted">TODAY'S MENU</span><h2>Find your favourite</h2></div><label className="search-box"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search this menu" /></label></div><div className="menu-filters">{categories.map((item) => <button key={item} className={category === item ? 'filter-active' : ''} onClick={() => setCategory(item)}>{item}</button>)}<span><Clock3 size={14} /> Preorder 15–45 min ahead</span></div><div className="food-grid">{visibleProducts.map((product) => <FoodCard key={product.id} shopId={selectedShopId} product={product} token={token} user={user} shopOpen={selectedShop.isOpen !== false} onAdd={addToCart} onSignIn={() => { setAuthMode('login'); setScreen('auth') }} />)}</div>{visibleProducts.length === 0 && <div className="empty-message">{selectedShop.products.length === 0 ? `The ${selectedShop.name} menu is being added.` : 'No menu items match. Try a different search.'}</div>}</section></main>}

    {screen === 'orders' && <main className="student-orders"><button className="back-link" onClick={() => setScreen('shop')}><ArrowLeft size={15} /> Back to {selectedShop?.name || 'menu'}</button><div className="section-title"><div><span className="eyebrow muted">YOUR CANTEENONE</span><h2>My orders</h2><p>Keep your pickup tokens handy.</p></div><button className="secondary-button" onClick={loadStudentOrders}>Refresh</button></div>{myOrders.length ? <div className="my-order-list">{myOrders.map((order) => <OrderSummary key={order.id} order={order} token={token} onOpen={() => setReceipt(order)} />)}</div> : <div className="empty-message">Your orders will appear here after checkout.</div>}</main>}


    {cartOpen && <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setCartOpen(false)}><aside className="drawer"><div className="drawer-heading"><div><span className="eyebrow muted">{selectedShop?.name}</span><h2>Your order <span>({cartCount})</span></h2></div><button className="icon-button" onClick={() => setCartOpen(false)}><X /></button></div>{cart.length === 0 ? <div className="empty-message">Your cart is empty. Add something from the menu.</div> : <><div className="cart-items">{cart.map((item) => <div className="cart-item" key={item.id}><img src={item.image} alt="" /><div className="cart-item-info"><strong>{item.name}</strong><small>{money(item.price)} each</small><div className="quantity"><button onClick={() => changeQuantity(item.id, -1)}><Minus size={13} /></button><span>{item.quantity}</span><button onClick={() => changeQuantity(item.id, 1)}><Plus size={13} /></button></div></div><b>{money(item.price * item.quantity)}</b></div>)}</div><div className="cart-bottom"><div className="subtotal"><span>Total</span><strong>{money(subtotal)}</strong></div><small>Online payment · Choose pickup time at checkout</small><button className="primary-button full" disabled={selectedShop?.isOpen === false} onClick={() => { setCartOpen(false); setCheckoutOpen(true) }}>{selectedShop?.isOpen === false ? 'Canteen is closed' : 'Choose pickup time'} <ArrowRight size={16} /></button></div></>}</aside></div>}

    {checkoutOpen && <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setCheckoutOpen(false)}><div className="checkout-modal"><div className="drawer-heading"><div><span className="eyebrow muted">SECURE CHECKOUT · {selectedShop?.name}</span><h2>Review & pay</h2></div><button className="icon-button" onClick={() => setCheckoutOpen(false)} aria-label="Close checkout"><X /></button></div><form onSubmit={payAndPlaceOrder}><div className="checkout-step-title"><span>1</span><div><strong>Choose pickup time</strong><small>Order now, collect when you arrive</small></div></div><div className="time-options">{[15, 30, 45].map((minutes) => <button type="button" key={minutes} onClick={() => setReadyInMinutes(minutes)} className={readyInMinutes === minutes ? 'time-selected' : ''}><Clock3 size={17} /><b>{minutes} min</b><small>from payment</small></button>)}</div><label className="field-label">Note for the canteen <span>(optional)</span><textarea value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} placeholder="For example: no onions" /></label><div className="checkout-step-title payment-title"><span>2</span><div><strong>Payment method</strong><small>Choose how you would like to pay</small></div></div><div className="payment-methods"><button type="button" aria-pressed={paymentMethod === 'upi'} className={paymentMethod === 'upi' ? 'payment-method selected' : 'payment-method'} onClick={() => setPaymentMethod('upi')}><span className="payment-method-icon upi-icon"><Smartphone size={17}/></span><span><strong>UPI</strong><small>GPay · PhonePe · Paytm</small></span><i/></button><button type="button" aria-pressed={paymentMethod === 'card'} className={paymentMethod === 'card' ? 'payment-method selected' : 'payment-method'} onClick={() => setPaymentMethod('card')}><span className="payment-method-icon"><CreditCard size={17}/></span><span><strong>Credit or debit card</strong><small>Visa · Mastercard · RuPay</small></span><i/></button><button type="button" aria-pressed={paymentMethod === 'netbanking'} className={paymentMethod === 'netbanking' ? 'payment-method selected' : 'payment-method'} onClick={() => setPaymentMethod('netbanking')}><span className="payment-method-icon"><Building2 size={17}/></span><span><strong>Net banking</strong><small>All major banks</small></span><i/></button></div><div className="payment-demo-notice"><Check size={15}/><span><strong>Demo payment</strong> — this checkout previews the flow; it will not charge real money.</span></div><div className="checkout-total"><span>{cartCount} items · Total payable</span><strong>{money(subtotal)}</strong></div><button className="primary-button full pay-button" disabled={busy}>{busy ? 'Processing payment…' : `Pay ${money(subtotal)} securely`} <ArrowRight size={16} /></button><small className="checkout-terms">By continuing, you confirm your order with {selectedShop?.name}.</small></form></div></div>}

    {receipt && <div className="overlay receipt-overlay" onMouseDown={(e) => e.target === e.currentTarget && setReceipt(null)}><div className="receipt-card"><button className="icon-button receipt-close" onClick={() => setReceipt(null)}><X /></button><div className="paid-mark"><Check size={22} /></div><span className="eyebrow muted">PAYMENT COMPLETE · PICKUP TOKEN</span><h2>Your order is in!</h2><div className="token-banner">{receipt.shopLogo && <img className="receipt-shop-logo" src={receipt.shopLogo} alt={`${receipt.shopName} logo`} />}<span>{receipt.shopName}</span><strong>{receipt.token}</strong><small>Order number {receipt.id}</small></div><div className="receipt-lines">{receipt.items.map((item) => <div key={item.productId}><span>{item.quantity} × {item.name}</span><b>{money(item.lineTotal)}</b></div>)}</div><div className="receipt-meta"><div><span>Total paid</span><b>{money(receipt.total)}</b></div><div><span>Payment receipt</span><b>{receipt.payment.receipt}</b></div><div><span>Ready around</span><b>{new Date(receipt.readyAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {receipt.readyInMinutes} min</b></div></div><p className="token-tip">Show this token at the canteen counter when you pick up.</p><button className="primary-button full" onClick={() => { setReceipt(null); setScreen('orders') }}>View my orders <ArrowRight size={15} /></button></div></div>}
    <BbdCorner />
  </div>
}

function BbdCorner() { return <div className="bbd-corner"><img src="/logos/bbd.jpg" alt="BBD" /></div> }

function FoodCard({ shopId, product, token, user, shopOpen, onAdd, onSignIn }) {
  const [expanded, setExpanded] = useState(false)
  const [reviews, setReviews] = useState([])
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [justAdded, setJustAdded] = useState(false)
  function handleAdd() {
    if (!shopOpen || !onAdd(product)) return
    setJustAdded(true)
    window.setTimeout(() => setJustAdded(false), 800)
  }
  async function loadReviews() {
    try {
      const data = await request(`/api/reviews?shopId=${encodeURIComponent(shopId)}&productId=${encodeURIComponent(product.id)}`, {}, '')
      setReviews(data.reviews)
    } catch (err) { setError(err.message) }
  }
  async function submitReview(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await request('/api/reviews', { method: 'POST', body: JSON.stringify({ shopId, productId: product.id, rating, comment }) }, token)
      setComment(''); await loadReviews()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <article className="food-card"><div className="food-image"><img src={product.image} alt={product.name} /><span className="food-category">{product.category}</span></div><div className="food-info"><div className="food-name-price"><h3>{product.name}</h3><b>{money(product.price)}</b></div><div className="price-caption"><del>{money(product.offlinePrice)}</del><span>online price · save ₹1</span></div><p>{product.description}</p><div className="food-actions"><span className={product.inStock ? 'available' : 'unavailable'}>{product.inStock ? '● In stock' : '● Sold out'}</span><button className={justAdded ? 'added' : ''} disabled={!product.inStock || !shopOpen} onClick={handleAdd}>{justAdded ? <><Check size={15} /> Added</> : <><Plus size={15} /> {shopOpen ? 'Add' : 'Closed'}</>}</button></div><button className="reviews-toggle" onClick={async () => { const next = !expanded; setExpanded(next); if (next) await loadReviews() }}>{expanded ? 'Hide comments' : `Comments & ratings${reviews.length ? ` (${reviews.length})` : ''}`} <span>★</span></button>{expanded && <div className="reviews-panel"><div className="review-list">{reviews.length ? reviews.map((review) => <div className="review-entry" key={review._id}><div><strong>{review.studentName}</strong><span>{'★'.repeat(review.rating)}{'☆'.repeat(5-review.rating)}</span></div><p>{review.comment}</p></div>) : <p className="no-reviews">No comments yet. Share the first one.</p>}</div>{user?.role === 'student' ? <form className="review-form" onSubmit={submitReview}><label>Rate it <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>{[5,4,3,2,1].map((value) => <option value={value} key={value}>{value} stars</option>)}</select></label><textarea required minLength="2" maxLength="500" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="How was this food?"/><button disabled={busy}>{busy ? 'Posting…' : 'Post comment'}</button></form> : <button className="review-signin" onClick={onSignIn}>Sign in to leave a comment</button>}{error && <p className="review-error">{error}</p>}</div>}</div></article>
}
function OrderSummary({ order, token, onOpen }) {
  const [expanded, setExpanded] = useState(false)
  return <article className="order-card"><button className="order-summary" onClick={() => setExpanded((open) => !open)} aria-expanded={expanded}><span className="order-shop-icon">{order.shopLogo ? <img src={order.shopLogo} alt="" /> : order.shopEmoji}</span><span className="order-summary-main"><strong>{order.shopName}</strong><small>{order.items.map((item) => `${item.quantity} × ${item.name}`).join(', ')}</small><small>Ready at {new Date(order.readyAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {statusNames[order.status]}</small></span><span className="order-token-mini">{order.token}<small>Tap for details</small></span></button>{expanded && <div className="order-detail"><div className="order-detail-head"><div><span>Order {order.id}</span><strong>{money(order.total)} paid · {order.payment?.method?.toUpperCase() || 'ONLINE'}</strong></div><button className="secondary-button" onClick={onOpen}>View receipt</button></div><OrderTracking status={order.status} /><div className="order-feedback-list"><strong className="feedback-title">How was your food?</strong>{order.items.map((item) => <OrderFeedback key={item.productId} item={item} shopId={order.shopId} token={token} />)}</div></div>}</article>
}

function OrderTracking({ status }) {
  const steps = [['accepted', 'Paid'], ['preparing', 'Preparing'], ['ready', 'Ready'], ['delivered', 'Picked up']]
  const current = Math.max(0, steps.findIndex(([key]) => key === status))
  return <div className="order-tracking" aria-label={`Order status: ${statusNames[status] || status}`}>{steps.map(([key, label], index) => <div className={`tracking-step ${index <= current ? 'tracking-done' : ''} ${key === status ? 'tracking-current' : ''}`} key={key}><i>{index < current ? '✓' : index + 1}</i><span>{label}</span></div>)}</div>
}

function OrderFeedback({ item, shopId, token }) {
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await request('/api/reviews', { method: 'POST', body: JSON.stringify({ shopId, productId: item.productId, rating, comment }) }, token)
      setSent(true); setOpen(false)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <div className="order-feedback"><div className="order-feedback-row"><span>{item.name}</span>{sent ? <b className="feedback-thanks">Thanks for your feedback ✓</b> : <button className="feedback-link" onClick={() => setOpen((value) => !value)}>{open ? 'Cancel' : 'Rate item'}</button>}</div>{open && !sent && <form className="order-feedback-form" onSubmit={submit}><label>Rating<select value={rating} onChange={(e) => setRating(Number(e.target.value))}>{[5,4,3,2,1].map((value) => <option key={value} value={value}>{value} {value === 1 ? 'star' : 'stars'}</option>)}</select></label><textarea required minLength="2" maxLength="500" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Tell us what you thought"/><button disabled={busy}>{busy ? 'Sending…' : 'Submit feedback'}</button>{error && <small className="review-error">{error}</small>}</form>}</div>
}
function ClipboardOrdersIcon() { return <ClipboardList size={16} /> }
function MapPinIcon() { return <span className="pin-dot">●</span> }
