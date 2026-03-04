import React, { createContext, useContext, useEffect, useState } from 'react'
import axios from 'axios'

// Local persistence helper: store recent reports in localStorage under `vd:reports`.
const LS_KEY = 'vd:reports'
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const CACHE_KEY = 'vd:lastPayload'
const CACHE_TS = 'vd:lastFetch'
const ONE_DAY = 24 * 60 * 60 * 1000

function readLocalReports(){
  try{
    const raw = localStorage.getItem(LS_KEY)
    if(!raw) return []
    return JSON.parse(raw)
  }catch(e){ return [] }
}

function writeLocalReports(list){
  try{ localStorage.setItem(LS_KEY, JSON.stringify(list)) }catch(e){}
}

function persistToLocal(payload){
  try{
    const now = Date.now()
    const id = `${now}-${Math.random().toString(36).slice(2,9)}`
    const item = { id, created_at: now, payload }
    const list = readLocalReports()
    list.unshift(item)
    // prune older than retention
    const cutoff = Date.now() - RETENTION_MS
    const pruned = list.filter(r => (r.created_at || 0) >= cutoff)
    writeLocalReports(pruned.slice(0, 500)) // cap at 500 entries locally
    return item
  }catch(e){ return null }
}

const DataContext = createContext(null)

export function DataProvider({ children }){
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(()=>{
    let cancelled = false
    async function fetchData(){
      try{
        // Check cached payload and timestamp — if within 1 day, use cache
        const last = parseInt(localStorage.getItem(CACHE_TS) || '0', 10)
        const now = Date.now()
        if(last && (now - last) < ONE_DAY){
          const cachedRaw = localStorage.getItem(CACHE_KEY)
          if(cachedRaw){
            const cached = JSON.parse(cachedRaw)
            if(!cancelled){ setData(cached); setLoading(false); }
            return
          }
        }

        // Use a relative path so the dev server proxy (set in package.json) forwards the request
        const res = await axios.get('/testing/getdata')
        if(cancelled) return
        // API returns an envelope with `body` as a JSON string in sample
        let payload = res.data
        if(payload && typeof payload.body === 'string'){
          try{ payload = JSON.parse(payload.body) }catch(e){ /* keep original */ }
        }
        if(!cancelled) {
          setData(payload)
          // cache for 1 day
          try{ localStorage.setItem(CACHE_KEY, JSON.stringify(payload)); localStorage.setItem(CACHE_TS, String(Date.now())) }catch(e){}
        }
        // Persist locally (30 days retention) — primary persistence method
        try{ persistToLocal(payload) }catch(e){}
        // Also attempt server POST if available (best-effort, non-blocking)
        ;(async function postReport() {
          try { await axios.post('http://localhost:4000/api/reports', payload, { timeout: 3000 }) } catch (e) { /* ignore */ }
        })()
      }catch(err){ if(!cancelled) setError(err.message || 'Fetch error') }finally{ if(!cancelled) setLoading(false) }
    }
    fetchData()
    return ()=>{ cancelled = true }
  },[])

  return (
    <DataContext.Provider value={{data, loading, error}}>
      {children}
    </DataContext.Provider>
  )
}

export function useData(){
  return useContext(DataContext)
}
