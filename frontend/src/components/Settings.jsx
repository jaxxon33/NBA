import { useState } from 'react'
import { Sliders, DollarSign, Percent, Save, ShieldAlert, Info } from 'lucide-react'
import { useSettings, updateSettings } from '../useSettings'

export default function Settings() {
    const settings = useSettings()
    const [saved, setSaved] = useState(false)

    const setMinEV = (v) => updateSettings({ minEV: v })
    const setBankroll = (v) => updateSettings({ bankroll: v })
    const setKellyMultiplier = (v) => updateSettings({ kellyMultiplier: v })

    const handleSave = () => {
        // Values are already persisted on each change — confirm visually.
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
    }

    return (
        <div className="settings-page">
            <div className="header-actions" style={{ marginBottom: "2rem" }}>
                <div>
                    <h1>Model <span className="neon-cyan-text">Configuration</span></h1>
                    <p style={{ color: "var(--text-secondary)", marginTop: "0.5rem" }}>
                        Tune EV thresholds and bankroll-management strategy. Settings persist in this browser.
                    </p>
                </div>
                <button
                    className={`btn ${saved ? 'btn-success' : 'btn-primary'}`}
                    onClick={handleSave}
                    style={saved ? { background: 'var(--bg-tertiary)', color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)' } : {}}
                >
                    {saved ? '✓ Saved' : <><Save size={18} /> Confirm</>}
                </button>
            </div>

            <div className="glass-card" style={{ marginBottom: '1.5rem', borderLeft: '3px solid var(--accent-primary)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <Info size={20} className="neon-cyan-text" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                        <h3 style={{ marginBottom: '4px' }}>Methodology — V2</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5, margin: 0 }}>
                            Sharp-consensus model. The "true" probability for every outcome is computed from devigged
                            prices at sharp/low-vig books (Betfair Exchange, LowVig.ag, BetOnline.ag). Every other
                            bookmaker's offering is scored against that reference. For spreads/totals at unmatched
                            lines, NBA-specific half-point conversion adjusts the sharp probability accordingly.
                        </p>
                    </div>
                </div>
            </div>

            <div className="settings-grid">
                <div className="glass-card settings-card">
                    <div className="settings-card-header">
                        <div className="settings-icon-wrapper"><Percent size={20} className="neon-cyan-text" /></div>
                        <div>
                            <h3>Minimum +EV Threshold</h3>
                            <p className="setting-desc">Filter the Dashboard to bets exceeding this expected-value cutoff.</p>
                        </div>
                    </div>
                    <div className="setting-control">
                        <div className="slider-header">
                            <span>Threshold</span>
                            <span className="slider-value mono-text">+{settings.minEV.toFixed(1)}%</span>
                        </div>
                        <input
                            type="range"
                            min="0.1"
                            max="10.0"
                            step="0.1"
                            value={settings.minEV}
                            onChange={(e) => setMinEV(parseFloat(e.target.value))}
                            className="custom-slider"
                        />
                        <div className="slider-labels">
                            <span>0.1% (Volume)</span>
                            <span>10.0% (Conviction)</span>
                        </div>
                    </div>
                </div>

                <div className="glass-card settings-card">
                    <div className="settings-card-header">
                        <div className="settings-icon-wrapper"><DollarSign size={20} className="neon-cyan-text" /></div>
                        <div>
                            <h3>Total Bankroll</h3>
                            <p className="setting-desc">Drives the Kelly stake recommendation shown next to every bet.</p>
                        </div>
                    </div>
                    <div className="setting-control">
                        <div className="input-group">
                            <span className="input-prefix">$</span>
                            <input
                                type="number"
                                value={settings.bankroll}
                                onChange={(e) => setBankroll(Number(e.target.value))}
                                className="custom-input mono-text"
                            />
                        </div>
                    </div>
                </div>

                <div className="glass-card settings-card">
                    <div className="settings-card-header">
                        <div className="settings-icon-wrapper"><Sliders size={20} style={{ color: "#8884d8" }} /></div>
                        <div>
                            <h3>Kelly Multiplier</h3>
                            <p className="setting-desc">0.5 = Half Kelly (safer, recommended). 1.0 = Full Kelly (aggressive, variance-heavy).</p>
                        </div>
                    </div>
                    <div className="setting-control">
                        <div className="slider-header">
                            <span>Multiplier</span>
                            <span className="slider-value mono-text" style={{ color: '#8884d8' }}>{settings.kellyMultiplier.toFixed(2)}x</span>
                        </div>
                        <input
                            type="range"
                            min="0.1"
                            max="1.0"
                            step="0.05"
                            value={settings.kellyMultiplier}
                            onChange={(e) => setKellyMultiplier(parseFloat(e.target.value))}
                            className="custom-slider"
                            style={{ accentColor: '#8884d8' }}
                        />
                        <div className="slider-labels">
                            <span>0.1x (Conservative)</span>
                            <span>1.0x (Aggressive)</span>
                        </div>
                    </div>
                </div>

                <div className="glass-card settings-card warning-card">
                    <div className="settings-card-header" style={{ alignItems: 'flex-start' }}>
                        <div className="settings-icon-wrapper danger"><ShieldAlert size={20} style={{ color: "var(--accent-danger)" }} /></div>
                        <div>
                            <h3>Risk Disclaimer</h3>
                            <p className="setting-desc" style={{ marginTop: '0.4rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                Edges are estimated from current market prices, not guaranteed. The sharp-consensus
                                methodology produces small, real edges — not 30% returns. Bankroll management matters
                                more than any single bet. Bookmakers may limit accounts that consistently beat the
                                closing line.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
