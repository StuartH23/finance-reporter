import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import Budget from './pages/Budget'
import Dashboard from './pages/Dashboard'
import Subscriptions from './pages/Subscriptions'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <nav className="sidebar">
          <h1 className="logo">Finance Report Generator</h1>
          <div className="nav-links">
            <NavLink to="/" end>
              Profit and Loss Report
            </NavLink>
            <NavLink to="/budget">Budget</NavLink>
            <NavLink to="/subscriptions">Subscriptions</NavLink>
          </div>
        </nav>
        <main className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/budget" element={<Budget />} />
            <Route path="/subscriptions" element={<Subscriptions />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
