import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import Budget from './pages/Budget'
import Dashboard from './pages/Dashboard'
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
          </div>
        </nav>
        <main className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/budget" element={<Budget />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
