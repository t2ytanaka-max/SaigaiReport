import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { BrowserRouter } from 'react-router-dom'

// Force external browser if opened in LINE app
if (/Line/i.test(navigator.userAgent) && !window.location.search.includes('openExternalBrowser=1')) {
  // Add query param to force external browser
  const newUrl = new URL(window.location.href);
  newUrl.searchParams.set('openExternalBrowser', '1');
  window.location.href = newUrl.toString();
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
