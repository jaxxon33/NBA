import { useState } from 'react'
import Dashboard from './components/Dashboard'
import Matches from './components/Matches'
import Settings from './components/Settings'

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-dot"></div>
          NBA Quant
        </div>

        <nav>
          <a
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            Dashboard Feed
          </a>
          <a
            className={`nav-item ${activeTab === 'matches' ? 'active' : ''}`}
            onClick={() => setActiveTab('matches')}
          >
            Matches & Probs
          </a>
          <a
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            Model Settings
          </a>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'matches' && (
          <Matches />
        )}
        {activeTab === 'settings' && (
          <Settings />
        )}
      </main>
    </div>
  )
}

export default App
