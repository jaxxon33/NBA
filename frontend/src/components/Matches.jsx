import { useState, useEffect, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts'
import { Activity, Award, Clock, Layers } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

export default function Matches() {
    const [matches, setMatches] = useState([])
    const [selectedId, setSelectedId] = useState(null)
    const [detail, setDetail] = useState(null)
    const [loading, setLoading] = useState(true)
    const [loadingDetail, setLoadingDetail] = useState(false)

    useEffect(() => {
        const fetchMatches = async () => {
            try {
                const res = await fetch(`${API_BASE}/matches`)
                const data = await res.json()
                setMatches(data)
                if (data.length > 0) {
                    setSelectedId(data[0].id)
                }
            } catch (e) {
                console.error("Error fetching matches", e)
            } finally {
                setLoading(false)
            }
        }
        fetchMatches()
    }, [])

    useEffect(() => {
        if (!selectedId) return
        let cancelled = false
        setLoadingDetail(true)
        fetch(`${API_BASE}/matches/${selectedId}/odds`)
            .then(r => r.json())
            .then(d => { if (!cancelled) setDetail(d) })
            .catch(e => console.error("Error fetching match odds", e))
            .finally(() => { if (!cancelled) setLoadingDetail(false) })
        return () => { cancelled = true }
    }, [selectedId])

    const selectedMatch = matches.find(m => m.id === selectedId)

    // Group outcomes by market for tidy presentation.
    const groupedOutcomes = useMemo(() => {
        if (!detail?.outcomes) return {}
        const out = {}
        for (const o of detail.outcomes) {
            if (!out[o.market]) out[o.market] = []
            out[o.market].push(o)
        }
        return out
    }, [detail])

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
                    <h1>Matches <span className="neon-cyan-text">& Market Spread</span></h1>
                    <p style={{ color: "var(--text-secondary)", marginTop: "0.5rem" }}>
                        Real bookmaker prices for each market. Sharp consensus probability highlighted; best available price flagged per outcome.
                    </p>
                </div>
            </div>

            <div className="layout-grid">
                <div className="matches-list glass-card">
                    <h3 style={{ marginBottom: "1rem" }}>
                        <Clock size={18} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
                        Upcoming Matches
                    </h3>
                    <div className="matches-scroll">
                        {matches.length === 0 ? (
                            <p>No upcoming matches found.</p>
                        ) : (
                            matches.map(match => (
                                <div
                                    key={match.id}
                                    className={`match-item ${selectedId === match.id ? 'active' : ''}`}
                                    onClick={() => setSelectedId(match.id)}
                                >
                                    <div className="match-teams">
                                        <span className="team">{match.home_team}</span>
                                        <span className="vs">vs</span>
                                        <span className="team">{match.away_team}</span>
                                    </div>
                                    <div className="match-venue">
                                        {new Date(match.match_date?.split('.')[0]).toLocaleDateString()} · {match.venue}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="match-details">
                    {!selectedMatch ? (
                        <div className="glass-card empty-state"><p>Select a match to view data.</p></div>
                    ) : loadingDetail || !detail ? (
                        <div className="glass-card empty-state">
                            <div className="loader-circle" style={{ margin: '0 auto 12px' }}></div>
                            <p>Loading current odds…</p>
                        </div>
                    ) : (
                        <>
                            <div className="glass-card" style={{ marginBottom: "1.5rem" }}>
                                <h2>{selectedMatch.home_team} <span style={{ color: "var(--text-secondary)" }}>vs</span> {selectedMatch.away_team}</h2>
                                <p style={{ color: "var(--text-secondary)", marginBottom: 0 }}>
                                    {new Date(selectedMatch.match_date?.split('.')[0]).toLocaleString()} · {selectedMatch.venue}
                                </p>
                            </div>

                            {Object.keys(groupedOutcomes).length === 0 ? (
                                <div className="glass-card">
                                    <p style={{ color: 'var(--text-secondary)' }}>
                                        No odds recorded yet. Run a simulation from the Dashboard to fetch markets.
                                    </p>
                                </div>
                            ) : (
                                <MarketSections grouped={groupedOutcomes} />
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

function MarketSections({ grouped }) {
    const marketOrder = ['h2h', 'spreads', 'totals']
    const marketLabels = { h2h: 'Head-to-Head', spreads: 'Spreads', totals: 'Totals' }

    const sortedMarkets = Object.keys(grouped).sort((a, b) => {
        const ai = marketOrder.indexOf(a)
        const bi = marketOrder.indexOf(b)
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })

    return (
        <>
            {sortedMarkets.map(market => (
                <div key={market} className="glass-card" style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Layers size={18} className="neon-cyan-text" />
                        {marketLabels[market] || market.toUpperCase()}
                    </h3>
                    {grouped[market].map(outcome => (
                        <OutcomeBlock key={outcome.selection} outcome={outcome} />
                    ))}
                </div>
            ))}
        </>
    )
}

function OutcomeBlock({ outcome }) {
    const sharpPct = outcome.sharp_probability ? outcome.sharp_probability * 100 : null
    const chartData = outcome.books.map(b => ({
        bookmaker: b.bookmaker,
        odds: b.odds,
        impliedPct: b.implied_probability ? b.implied_probability * 100 : 0,
        evPct: b.ev_percentage,
        isValue: b.is_value_bet,
    }))

    return (
        <div style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{outcome.selection}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {sharpPct !== null ? (
                            <>Sharp consensus: <span className="neon-cyan-text mono-text">{sharpPct.toFixed(1)}%</span></>
                        ) : 'No sharp reference'}
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <Award size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />
                        Best price
                    </div>
                    <div className="mono-text" style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--accent-primary)' }}>
                        {outcome.best_price.toFixed(2)}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{outcome.best_book}</div>
                </div>
            </div>

            <div style={{ height: Math.max(60, chartData.length * 22), width: '100%' }}>
                <ResponsiveContainer>
                    <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 50, left: 70, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" horizontal={false} />
                        <XAxis type="number" stroke="var(--text-secondary)" tick={{ fontSize: 11 }} domain={[0, 'dataMax + 5']} unit="%" />
                        <YAxis type="category" dataKey="bookmaker" stroke="var(--text-secondary)" tick={{ fontSize: 11 }} width={70} />
                        <Tooltip
                            contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid #333', borderRadius: '8px', fontSize: '0.85rem' }}
                            formatter={(value, name, props) => {
                                if (name === 'impliedPct') {
                                    return [
                                        `${value.toFixed(1)}% (odds ${props.payload.odds.toFixed(2)}, EV ${props.payload.evPct > 0 ? '+' : ''}${props.payload.evPct}%)`,
                                        'Implied'
                                    ]
                                }
                                return [value, name]
                            }}
                        />
                        {sharpPct !== null && (
                            <ReferenceLine x={sharpPct} stroke="#00ff88" strokeDasharray="4 2" label={{ value: 'Sharp', fill: '#00ff88', fontSize: 11, position: 'top' }} />
                        )}
                        <Bar dataKey="impliedPct" radius={[0, 4, 4, 0]}>
                            {chartData.map((entry, idx) => (
                                <Cell
                                    key={idx}
                                    fill={entry.isValue ? '#00ff88' : entry.evPct > 0 ? '#5fc88d' : '#5a5a8a'}
                                    opacity={entry.isValue ? 1 : 0.65}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}
