import { useState, useEffect, useMemo } from 'react'
import { Clock, Layers, TrendingUp } from 'lucide-react'

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
                if (data.length > 0) setSelectedId(data[0].id)
            } catch (e) {
                console.error('Error fetching matches', e)
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
            .catch(e => console.error('Error fetching match odds', e))
            .finally(() => { if (!cancelled) setLoadingDetail(false) })
        return () => { cancelled = true }
    }, [selectedId])

    const selectedMatch = matches.find(m => m.id === selectedId)

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
            <div className="header-actions" style={{ marginBottom: '2rem' }}>
                <div>
                    <h1>Matches <span className="neon-cyan-text">&amp; Market Transparency</span></h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                        Full odds breakdown per bookmaker. Vig removed to show each book's fair probability estimate.
                        Sharp books are the reference for EV calculation.
                    </p>
                </div>
            </div>

            <div className="layout-grid">
                <div className="matches-list glass-card">
                    <h3 style={{ marginBottom: '1rem' }}>
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
                            <div className="glass-card" style={{ marginBottom: '1.5rem' }}>
                                <h2>
                                    {selectedMatch.home_team}{' '}
                                    <span style={{ color: 'var(--text-secondary)' }}>vs</span>{' '}
                                    {selectedMatch.away_team}
                                </h2>
                                <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem' }}>
                                    {new Date(selectedMatch.match_date?.split('.')[0]).toLocaleString()} · {selectedMatch.venue}
                                </p>
                                {detail.sharp_books && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Sharp reference books:</span>
                                        {detail.sharp_books.map(bk => (
                                            <span key={bk} className="book-pill book-pill-sharp">{bk}</span>
                                        ))}
                                    </div>
                                )}
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

    return (
        <div style={{ marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
            {/* Outcome header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 600 }}>{outcome.selection}</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                        {sharpPct !== null ? (
                            <>
                                Sharp consensus (devigged avg):&nbsp;
                                <span className="neon-cyan-text mono-text" style={{ fontWeight: 700 }}>{sharpPct.toFixed(2)}%</span>
                                &nbsp;· Best price:&nbsp;
                                <span style={{ color: 'var(--accent-primary)' }}>{outcome.best_price.toFixed(2)}</span>
                                &nbsp;@&nbsp;{outcome.best_book}
                            </>
                        ) : 'No sharp reference available'}
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <TrendingUp size={14} style={{ color: 'var(--accent-primary)' }} />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {outcome.books.filter(b => b.is_value_bet).length} value bet{outcome.books.filter(b => b.is_value_bet).length !== 1 ? 's' : ''} found
                    </span>
                </div>
            </div>

            {/* Methodology note */}
            <div className="methodology-note">
                <strong>How to read this table:</strong> Implied% = raw 1/odds (includes vig).
                Devigged% = implied ÷ overround (vig removed — this book's fair probability estimate).
                EV% = (sharp_prob × odds − 1) × 100. Green rows beat the sharp consensus.
            </div>

            {/* Book comparison table */}
            <div className="odds-table-wrap">
                <table className="odds-table">
                    <thead>
                        <tr>
                            <th>Bookmaker</th>
                            <th>Type</th>
                            <th className="num-col">Odds</th>
                            <th className="num-col">Vig</th>
                            <th className="num-col">Implied%</th>
                            <th className="num-col">Devigged%</th>
                            <th className="num-col">EV%</th>
                        </tr>
                    </thead>
                    <tbody>
                        {outcome.books.map((book, idx) => {
                            const vigPct = book.overround ? (book.overround - 1) * 100 : null
                            const impliedPct = book.implied_probability ? book.implied_probability * 100 : null
                            const deviggPct = book.devigged_probability ? book.devigged_probability * 100 : null
                            const isValue = book.is_value_bet
                            const sharpDiff = sharpPct !== null && deviggPct !== null ? deviggPct - sharpPct : null

                            return (
                                <tr
                                    key={idx}
                                    className={isValue ? 'row-value' : book.is_sharp ? 'row-sharp' : ''}
                                >
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span>{book.bookmaker}</span>
                                            {isValue && <span className="badge-value">+EV</span>}
                                        </div>
                                    </td>
                                    <td>
                                        <span className={book.is_sharp ? 'book-pill book-pill-sharp' : 'book-pill book-pill-rec'}>
                                            {book.is_sharp ? 'SHARP' : 'REC'}
                                        </span>
                                    </td>
                                    <td className="num-col mono-text" style={{ color: isValue ? 'var(--accent-primary)' : 'inherit', fontWeight: isValue ? 700 : 400 }}>
                                        {book.odds.toFixed(2)}
                                    </td>
                                    <td className="num-col" style={{ color: vigPct > 5 ? '#ff8866' : vigPct > 2 ? '#ffcc44' : '#88cc88' }}>
                                        {vigPct !== null ? `+${vigPct.toFixed(1)}%` : '—'}
                                    </td>
                                    <td className="num-col">
                                        {impliedPct !== null ? `${impliedPct.toFixed(2)}%` : '—'}
                                    </td>
                                    <td className="num-col mono-text">
                                        {deviggPct !== null ? (
                                            <span>
                                                {deviggPct.toFixed(2)}%
                                                {sharpDiff !== null && (
                                                    <span style={{ fontSize: '0.75rem', marginLeft: '4px', color: Math.abs(sharpDiff) < 0.5 ? 'var(--text-secondary)' : sharpDiff > 0 ? '#ff8866' : '#88cc88' }}>
                                                        ({sharpDiff > 0 ? '+' : ''}{sharpDiff.toFixed(1)}pp)
                                                    </span>
                                                )}
                                            </span>
                                        ) : '—'}
                                    </td>
                                    <td className="num-col mono-text" style={{ fontWeight: 600, color: book.ev_percentage > 0 ? '#00ff88' : 'var(--text-secondary)' }}>
                                        {book.ev_percentage > 0 ? '+' : ''}{book.ev_percentage?.toFixed(2)}%
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {/* Sharp consensus explainer row */}
            {sharpPct !== null && (
                <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                    <span>
                        Sharp consensus: <span className="neon-cyan-text mono-text">{sharpPct.toFixed(2)}%</span>
                    </span>
                    <span>
                        Fair decimal odds: <span className="mono-text">{(100 / sharpPct).toFixed(3)}</span>
                    </span>
                    <span>
                        Best available: <span className="mono-text" style={{ color: 'var(--accent-primary)' }}>{outcome.best_price.toFixed(2)}</span> @ {outcome.best_book}
                    </span>
                </div>
            )}
        </div>
    )
}
