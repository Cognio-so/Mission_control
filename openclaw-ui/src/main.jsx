import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { MissionProvider } from './store/mission.jsx'
import { LoginGate } from './components/auth/LoginGate.jsx'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <LoginGate>
        <MissionProvider>
          <App />
        </MissionProvider>
      </LoginGate>
    </BrowserRouter>
  </React.StrictMode>,
)
