import { useState, useEffect } from 'react'
import { useSettings, kellyStake } from '../useSettings'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

export default function Dashboard() {
    const settings = useSettings()
    const [stats, setStats] = useState({ total_ev_bets: 0, avg_ev_percentage: 0.0, total_matches_upcoming: 0 })
    const [evBets, setEvBets] = useState([])
    const [loading, setLoading] = useState(true)
    const [simulating, setSimulating] = useState(false)
    const [sortBy, setSortBy] = useState('ev_desc')

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
        const interval = setInterval(fetchData, 15000)
        return () => clearInterval(interval)
    }, [])

    const runSimulation = async () => {
        setSimulating(true)
        try {
            await fetch(`${API_BASE}/run-simulation`, { method: 'POST' })
            setTimeout(() => {
                fetchData()
                setSimulating(false)
            }, 2500)
        } catch (e) {
            console.error("Simulation failed", e)
            setSimulating(false)
        }
    }

    if (loading) {
        return (
            <div className="loader-container">
                <div className="loader-circle"></div>
                <p>Loading Quant Engine V2...</p>
            </div>
        )
    }

    // Apply user's threshold filter on top of the backend's value-bet flag.
    const filtered = evBets.filter(b => b.ev_percentage >= settings.minEV)

    const sortedBets = [...filtered].sort((a, b) => {
        if (sortBy === 'ev_desc') return b.ev_percentage - a.ev_percentage
        if (sortBy === 'odds_desc') return b.bookmaker_odds - a.bookmaker_odds
        if (sortBy === 'prob_desc') return b.model_probability - a.model_probability
        if (sortBy === 'stake_desc') {
            const aStake = kellyStake(a.model_probability, a.bookmaker_odds, settings.bankroll, settings.kellyMultiplier)
            const bStake = kellyStake(b.model_probability, b.bookmaker_odds, settings.bankroll, settings.kellyMultiplier)
            return bStake - aStake
        }
        return 0
    })

    return (
        <div>
            <div className="header-actions">
                <div>
                    <h1>+EV Identification <span className="neon-cyan-text">Live Feed V2</span></h1>
                    <p style={{ color: "var(--text-secondary)", marginTop: "0.5rem", maxWidth: '720px' }}>
                        Sharp-consensus methodology. Every AU/US bookmaker quote is scored against devigged prices
                        from Betfair Exchange, LowVig.ag, and BetOnline.ag. Showing edges above your {settings.minEV.toFixed(1)}% threshold.
                    </p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={runSimulation}
                    disabled={simulating}
                >
                    {simulating ? (
                        <><span className="spinner"></span> Refreshing Markets…</>
                    ) : (
                        '↻ Refresh Odds & EV'
                    )}
                </button>
            </div>

            <div className="stats-grid">
                <div className="glass-card">
                    <div className="stat-label">Edges Above Threshold</div>
                    <div className="stat-value neon-cyan-text">{filtered.length}</div>
                </div>
                <div className="glass-card">
                    <div className="stat-label">Average +EV (Shown)</div>
                    <div className="stat-value gradient-text">
                        +{filtered.length > 0 ? (filtered.reduce((s, b) => s + b.ev_percentage, 0) / filtered.length).toFixed(2) : '0.00'}%
                    </div>
                </div>
                <div className="glass-card">
                    <div className="stat-label">Upcoming Matches</div>
                    <div className="stat-value mono-text">{stats.total_matches_upcoming}</div>
                </div>
            </div>

            <div className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: "1.5rem", flexWrap: 'wrap', gap: '12px' }}>
                    <h3>Sharp-Edge Bets</h3>
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
                        <option value="stake_desc">Largest Kelly Stake</option>
                        <option value="prob_desc">Highest Sharp Probability</option>
                        <option value="odds_desc">Highest Odds</option>
                    </select>
                </div>

                <div className="ev-list">
                    {sortedBets.length === 0 ? (
                        <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            <p style={{ marginBottom: '8px' }}>No +EV bets above {settings.minEV.toFixed(1)}% threshold right now.</p>
                            <p style={{ fontSize: '0.85rem', maxWidth: '480px', margin: '0 auto', lineHeight: 1.5 }}>
                                In efficient markets this is the honest answer — sharp consensus often agrees with
                                recreational books. Try lowering the threshold in Settings, or check the Matches tab
                                to compare every book's current prices.
                            </p>
                        </div>
                    ) : (
                        sortedBets.map((bet) => {
                            const stake = kellyStake(bet.model_probability, bet.bookmaker_odds, settings.bankroll, settings.kellyMultiplier)
                            const impliedPct = (1 / bet.bookmaker_odds) * 100
                            const sharpPct = bet.model_probability * 100
                            return (
                                <div key={bet.id} className="ev-card">
                                    <div className="ev-match-info">
                                        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "4px" }}>
                                            {bet.home_team} vs {bet.away_team} · {new Date(bet.match_date?.split('.')[0]).toLocaleDateString()}
                                        </div>
                                        <div className="ev-market">{bet.market}</div>
                                        <div className="ev-match-title">{bet.selection}</div>
                                        <div className="ev-selection" style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                                            <span>Sharp: <strong>{sharpPct.toFixed(1)}%</strong></span>
                                            <span style={{ color: 'var(--text-secondary)' }}>Implied: {impliedPct.toFixed(1)}%</span>
                                            {stake > 0 && (
                                                <span style={{ color: '#8884d8' }}>Kelly: <strong>${stake.toFixed(2)}</strong></span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="ev-odds-col">
                                        <div className="ev-odds">{bet.bookmaker_odds.toFixed(2)}</div>
                                        <div className="ev-bookie">{bet.bookmaker}</div>
                                    </div>

                                    <div className="ev-percentage">
                                        +{bet.ev_percentage}%
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            </div>
        </div>
    )
}
