import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts'
import { Activity, TrendingUp, TrendingDown, Clock } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

export default function Matches() {
    const [matches, setMatches] = useState([])
    const [selectedMatch, setSelectedMatch] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchMatches = async () => {
            try {
                const res = await fetch(`${API_BASE}/matches`)
                const data = await res.json()
                setMatches(data)
                if (data.length > 0) {
                    setSelectedMatch(data[0])
                }
            } catch (e) {
                console.error("Error fetching matches", e)
            } finally {
                setLoading(false)
            }
        }
        fetchMatches()
    }, [])

    // Generate some mock timeline data based on the selected match to show probability trends
    const getTrendData = (match) => {
        if (!match) return []

        let currentHomeProb = 50
        let currentAwayProb = 50
        const data = []

        const daysAgo = 7
        for (let i = daysAgo; i >= 0; i--) {
            // Random walk probability simulation
            currentHomeProb = currentHomeProb + (Math.random() * 10 - 5)
            // Clamp
            currentHomeProb = Math.max(10, Math.min(90, currentHomeProb))
            currentAwayProb = 100 - currentHomeProb

            data.push({
                day: i === 0 ? 'Today' : `${i}d ago`,
                [match.home_team]: Number(currentHomeProb.toFixed(1)),
                [match.away_team]: Number(currentAwayProb.toFixed(1)),
                homeOdds: Number((100 / currentHomeProb).toFixed(2)),
                awayOdds: Number((100 / currentAwayProb).toFixed(2))
            })
        }
        return data
    }

    const trendData = selectedMatch ? getTrendData(selectedMatch) : []

    if (loading) {
        return (
            <div className="loader-container">
                <div className="loader-circle"></div>
                <p>Loading Matches...</p>
            </div>
        )
    }

    return (
        <div className="matches-page">
            <div className="header-actions" style={{ marginBottom: "2rem" }}>
                <div>
                    <h1>Matches <span className="neon-cyan-text">& Probs</span></h1>
                    <p style={{ color: "var(--text-secondary)", marginTop: "0.5rem" }}>
                        Historical probability trends and line movement charts.
                    </p>
                </div>
            </div>

            <div className="layout-grid">
                {/* Match Selection Column */}
                <div className="matches-list glass-card">
                    <h3 style={{ marginBottom: "1rem" }}><Clock size={18} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} /> Upcoming Matches</h3>
                    <div className="matches-scroll">
                        {matches.length === 0 ? (
                            <p>No upcoming matches found.</p>
                        ) : (
                            matches.map(match => (
                                <div
                                    key={match.id}
                                    className={`match-item ${selectedMatch && selectedMatch.id === match.id ? 'active' : ''}`}
                                    onClick={() => setSelectedMatch(match)}
                                >
                                    <div className="match-teams">
                                        <span className="team">{match.home_team}</span>
                                        <span className="vs">vs</span>
                                        <span className="team">{match.away_team}</span>
                                    </div>
                                    <div className="match-venue">{new Date(match.match_date).toLocaleDateString()} &middot; {match.venue}</div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Match Data Column */}
                <div className="match-details">
                    {selectedMatch ? (
                        <>
                            <div className="glass-card" style={{ marginBottom: "1.5rem" }}>
                                <h2>{selectedMatch.home_team} <span style={{ color: "var(--text-secondary)" }}>vs</span> {selectedMatch.away_team}</h2>
                                <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
                                    Match Date: {new Date(selectedMatch.match_date).toLocaleDateString()} &middot; {selectedMatch.venue}
                                </p>

                                <h3 style={{ marginBottom: "1rem", display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Activity size={20} className="neon-cyan-text" />
                                    Model Implied Win Probability Trend
                                </h3>
                                <div style={{ height: "300px", width: "100%" }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="colorHome" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#00ff88" stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor="#00ff88" stopOpacity={0} />
                                                </linearGradient>
                                                <linearGradient id="colorAway" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#8884d8" stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <XAxis dataKey="day" stroke="var(--text-secondary)" />
                                            <YAxis stroke="var(--text-secondary)" unit="%" />
                                            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid #333', borderRadius: '8px' }}
                                                itemStyle={{ color: '#fff' }}
                                            />
                                            <Legend />
                                            <Area type="monotone" dataKey={selectedMatch.home_team} stroke="#00ff88" fillOpacity={1} fill="url(#colorHome)" />
                                            <Area type="monotone" dataKey={selectedMatch.away_team} stroke="#8884d8" fillOpacity={1} fill="url(#colorAway)" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div className="glass-card">
                                <h3 style={{ marginBottom: "1rem", display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <TrendingUp size={20} style={{ color: "#8884d8" }} />
                                    Bookmaker Odds Line Movement (H2H)
                                </h3>
                                <div style={{ height: "300px", width: "100%" }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                            <XAxis dataKey="day" stroke="var(--text-secondary)" />
                                            <YAxis stroke="var(--text-secondary)" domain={['dataMin - 0.5', 'dataMax + 0.5']} />
                                            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid #333', borderRadius: '8px' }}
                                                itemStyle={{ color: '#fff' }}
                                                formatter={(value) => `$${value}`}
                                            />
                                            <Legend />
                                            <Line type="monotone" name={`${selectedMatch.home_team} Odds`} dataKey="homeOdds" stroke="#00ff88" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                            <Line type="monotone" name={`${selectedMatch.away_team} Odds`} dataKey="awayOdds" stroke="#8884d8" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="glass-card empty-state">
                            <p>Select a match to view data.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
