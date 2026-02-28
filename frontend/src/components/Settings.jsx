import { useState } from 'react'
import { Sliders, DollarSign, Percent, Save, ShieldAlert } from 'lucide-react'

export default function Settings() {
    const [minEV, setMinEV] = useState(5.0)
    const [bankroll, setBankroll] = useState(1000)
    const [kellyMultiplier, setKellyMultiplier] = useState(0.5)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)

    const handleSave = () => {
        setSaving(true)
        setTimeout(() => {
            setSaving(false)
            setSaved(true)
            setTimeout(() => setSaved(false), 3000)
        }, 800)
    }

    return (
        <div className="settings-page">
            <div className="header-actions" style={{ marginBottom: "2rem" }}>
                <div>
                    <h1>Model <span className="neon-cyan-text">Configuration</span></h1>
                    <p style={{ color: "var(--text-secondary)", marginTop: "0.5rem" }}>
                        Tune the algorithm's thresholds and your bankroll management strategy.
                    </p>
                </div>
                <button
                    className={`btn ${saved ? 'btn-success' : 'btn-primary'}`}
                    onClick={handleSave}
                    disabled={saving || saved}
                    style={saved ? { background: 'var(--bg-tertiary)', color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)' } : {}}
                >
                    {saving ? <span className="spinner"></span> : saved ? '✓ Saved Defaults' : <><Save size={18} /> Save Settings</>}
                </button>
            </div>

            <div className="settings-grid">
                {/* EV Threshold Setting */}
                <div className="glass-card settings-card">
                    <div className="settings-card-header">
                        <div className="settings-icon-wrapper"><Percent size={20} className="neon-cyan-text" /></div>
                        <div>
                            <h3>Minimum +EV Threshold</h3>
                            <p className="setting-desc">The algorithm will only flag bets with an Expected Value higher than this percentage.</p>
                        </div>
                    </div>
                    <div className="setting-control">
                        <div className="slider-header">
                            <span>Threshold</span>
                            <span className="slider-value mono-text">+{minEV.toFixed(1)}%</span>
                        </div>
                        <input
                            type="range"
                            min="0.1"
                            max="15.0"
                            step="0.1"
                            value={minEV}
                            onChange={(e) => setMinEV(parseFloat(e.target.value))}
                            className="custom-slider"
                        />
                        <div className="slider-labels">
                            <span>0.1% (High Volume)</span>
                            <span>15.0% (High Conviction)</span>
                        </div>
                    </div>
                </div>

                {/* Bankroll Setting */}
                <div className="glass-card settings-card">
                    <div className="settings-card-header">
                        <div className="settings-icon-wrapper"><DollarSign size={20} className="neon-cyan-text" /></div>
                        <div>
                            <h3>Total Bankroll Sizing</h3>
                            <p className="setting-desc">Set your total allocated bankroll to calculate recommended stake sizes using the Kelly Criterion.</p>
                        </div>
                    </div>
                    <div className="setting-control">
                        <div className="input-group">
                            <span className="input-prefix">$</span>
                            <input
                                type="number"
                                value={bankroll}
                                onChange={(e) => setBankroll(Number(e.target.value))}
                                className="custom-input mono-text"
                            />
                        </div>
                    </div>
                </div>

                {/* Fractional Kelly */}
                <div className="glass-card settings-card">
                    <div className="settings-card-header">
                        <div className="settings-icon-wrapper"><Sliders size={20} style={{ color: "#8884d8" }} /></div>
                        <div>
                            <h3>Kelly Criterion Multiplier</h3>
                            <p className="setting-desc">Adjust the aggressiveness of bet sizing. 0.5 = Half Kelly (Safer), 1.0 = Full Kelly (Aggressive).</p>
                        </div>
                    </div>
                    <div className="setting-control">
                        <div className="slider-header">
                            <span>Multiplier</span>
                            <span className="slider-value mono-text" style={{ color: '#8884d8' }}>{kellyMultiplier.toFixed(2)}x</span>
                        </div>
                        <input
                            type="range"
                            min="0.1"
                            max="1.0"
                            step="0.05"
                            value={kellyMultiplier}
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

                {/* Warning Card */}
                <div className="glass-card settings-card warning-card">
                    <div className="settings-card-header" style={{ alignItems: 'flex-start' }}>
                        <div className="settings-icon-wrapper danger"><ShieldAlert size={20} style={{ color: "var(--accent-danger)" }} /></div>
                        <div>
                            <h3>Risk Disclaimer</h3>
                            <p className="setting-desc" style={{ marginTop: '0.4rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                The NBA quant model identifies edges based on historical data and real-time market lines. It does not guarantee profit.
                                Always ensure you adhere to strict bankroll management and never wager more than your specified bankroll limit.
                                In US markets, bookmakers may limit accounts that consistently beat the closing line.
                            </p>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    )
}
