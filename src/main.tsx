import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AgendaMEBNA from './AgendaMebna.jsx' // Traemos el nuevo sistema

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AgendaMEBNA />
  </StrictMode>,
)
