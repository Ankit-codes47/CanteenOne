import React from 'react'
import { createRoot } from 'react-dom/client'
import VendorApp from './VendorApp.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(<React.StrictMode><VendorApp /></React.StrictMode>)
