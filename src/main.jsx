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

console.log("main.jsx: Execution started");
const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error("main.jsx: Root element not found!");
} else {
  try {
    console.log("main.jsx: Initializing React Root");
    // Show a temporary indicator in case React fails
    rootElement.innerHTML = '<div style="padding:20px; color:#666;">アプリを起動しています...</div>';
    
    createRoot(rootElement).render(
      <StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </StrictMode>,
    );
    console.log("main.jsx: React render called successfully");
  } catch (error) {
    console.error("main.jsx: Critical render error:", error);
    rootElement.innerHTML = '<div style="padding:20px; color:red;">エラーが発生しました: ' + error.message + '</div>';
  }
}
