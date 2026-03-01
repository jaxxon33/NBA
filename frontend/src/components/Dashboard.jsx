import { useState, useEffect } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

export default function Dashboard() {
    const [stats, setStats] = useState({ total_ev_bets: 0, avg_ev_percentage: 0.0, total_matches_upcoming: 0 })
    const [evBets, setEvBets] = useState([])
    const [loading, setLoading] = useState(true)
    const [simulating, setSimulating] = useState(false)
    const [sortBy, setSortBy] = useState('ev_desc') // 'ev_desc', 'odds_desc', 'prob_desc'

    const fetchData = async () => {
        try {
            const statsRes = await fetch(`${API_BASE}/stats`)
            const statsData = await statsRes.json()
            setStats(statsData)

            const betsRes = await fetch(`${API_BASE}/bets/ev`)
            const betsData = await betsRes.json()
            setEvBets(betsData)
        } catch (e) {
            console.error("Error fetching data", e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
        // Poll for updates every 10 seconds
        const interval = setInterval(fetchData, 10000)
        return () => clearInterval(interval)
    }, [])

    const runSimulation = async () => {
        setSimulating(true)
        try {
            await fetch(`${API_BASE}/run-simulation`, { method: 'POST' })
            // Fake a loading state for UX
            setTimeout(() => {
                fetchData()
                setSimulating(false)
            }, 2000)
        } catch (e) {
            console.error("Simulation failed", e)
            setSimulating(false)
        }
    }

    if (loading) {
        return (
            <div className="loader-container">
                <div className="loader-circle"></div>
                <p>Loading Quant Engine...</p>
            </div>
        )
    }

    const sortedBets = [...evBets].sort((a, b) => {
        if (sortBy === 'ev_desc') return b.ev_percentage - a.ev_percentage
        if (sortBy === 'odds_desc') return b.bookmaker_odds - a.bookmaker_odds
        if (sortBy === 'prob_desc') return b.model_probability - a.model_probability
        return 0
    })

    return (
        <div>
            <div className="header-actions">
                <div>
                    <h1>+EV Identification <span className="neon-cyan-text">Live Feed</span></h1>
                    <p style={{ color: "var(--text-secondary)", marginTop: "0.5rem" }}>
                        Model tracking line movements across top Australian bookies.
                    </p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={runSimulation}
                    disabled={simulating}
                >
                    {simulating ? (
                        <><span className="spinner"></span> Running Monte Carlo...</>
                    ) : (
                        '▶ Run Simulation Matrix'
                    )}
                </button>
            </div>

            <div className="stats-grid">
                <div className="glass-card">
                    <div className="stat-label">Identified Value Bets</div>
                    <div className="stat-value neon-cyan-text">{stats.total_ev_bets}</div>
                </div>
                <div className="glass-card">
                    <div className="stat-label">Average +EV Yield</div>
                    <div className="stat-value gradient-text">+{stats.avg_ev_percentage}%</div>
                </div>
                <div className="glass-card">
                    <div className="stat-label">Upcoming Matches</div>
                    <div className="stat-value mono-text">{stats.total_matches_upcoming}</div>
                </div>
            </div>

            <div className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: "1.5rem" }}>
                    <h3>Sharps Action / Live +EV Bets</h3>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        style={{
                            background: 'var(--bg-tertiary)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-color)',
                            padding: '0.4rem 0.8rem',
                            borderRadius: '8px',
                            outline: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="ev_desc">Highest +EV First</option>
                        <option value="prob_desc">Highest Probability</option>
                        <option value="odds_desc">Highest Odds</option>
                    </select>
                </div>

                <div className="ev-list">
                    {sortedBets.length === 0 ? (
                        <p style={{ color: "var(--text-secondary)" }}>No +EV bets currently identified above the threshold.</p>
                    ) : (
                        sortedBets.map((bet) => (
                            <div key={bet.id} className="ev-card">
                                <div className="ev-match-info">
                                    <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "4px" }}>
                                        {bet.home_team} vs {bet.away_team} &middot; {new Date(bet.match_date).toLocaleDateString()}
                                    </div>
                                    <div className="ev-market">{bet.market}</div>
                                    <div className="ev-match-title">{bet.selection}</div>
                                    <div className="ev-selection">Model Prob: {(bet.model_probability * 100).toFixed(1)}% vs Implied: {((1 / bet.bookmaker_odds) * 100).toFixed(1)}%</div>
                                </div>

                                <div className="ev-odds-col">
                                    <div className="ev-odds">{bet.bookmaker_odds.toFixed(2)}</div>
                                    <div className="ev-bookie">{bet.bookmaker}</div>
                                </div>

                                <div className="ev-percentage">
                                    +{bet.ev_percentage}%
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}
