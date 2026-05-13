import { useState, useEffect } from 'react'

const STORAGE_KEY = 'nba-quant-settings-v2'

const DEFAULTS = {
    minEV: 1.0,
    bankroll: 1000,
    kellyMultiplier: 0.5,
}

const readStored = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return DEFAULTS
        const parsed = JSON.parse(raw)
        return { ...DEFAULTS, ...parsed }
    } catch {
        return DEFAULTS
    }
}

// Tiny pub/sub so all components stay in sync within a single tab.
const listeners = new Set()
let current = readStored()

const notify = () => {
    for (const l of listeners) l(current)
}

export const updateSettings = (patch) => {
    current = { ...current, ...patch }
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
    } catch {
        // ignore quota errors
    }
    notify()
}

export const useSettings = () => {
    const [state, setState] = useState(current)
    useEffect(() => {
        const handler = (next) => setState(next)
        listeners.add(handler)
        return () => listeners.delete(handler)
    }, [])
    return state
}

export const kellyStake = (modelProbability, decimalOdds, bankroll, multiplier) => {
    const b = decimalOdds - 1
    if (b <= 0) return 0
    const p = modelProbability
    const q = 1 - p
    const fraction = (b * p - q) / b
    if (fraction <= 0) return 0
    return Math.round(fraction * multiplier * bankroll * 100) / 100
}
