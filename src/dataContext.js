import React, { createContext, useContext, useEffect, useState } from 'react'
import axios from 'axios'
import { generateMockDataForDemo } from './mockData'

// Historical report persistence: store recent reports in localStorage for 30-day retention
const LS_HISTORY_KEY = 'vd:reports'
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

function readHistoricalReports(){
  try{
    const raw = localStorage.getItem(LS_HISTORY_KEY)
    if(!raw) return []
    return JSON.parse(raw)
  }catch(e){ return [] }
}

function writeHistoricalReports(list){
  try{ localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(list)) }catch(e){}
}

function persistToHistory(payload){
  try{
    const now = Date.now()
    const id = `${now}-${Math.random().toString(36).slice(2,9)}`
    const item = { id, created_at: now, payload }
    const list = readHistoricalReports()
    list.unshift(item)
    // prune older than retention
    const cutoff = Date.now() - RETENTION_MS
    const pruned = list.filter(r => (r.created_at || 0) >= cutoff)
    writeHistoricalReports(pruned.slice(0, 500)) // cap at 500 entries
    return item
  }catch(e){ return null }
}

const DataContext = createContext(null)

export function DataProvider({ children }){
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [demoMode, setDemoMode] = useState(false)

  useEffect(()=>{
    let cancelled = false
    async function fetchData(){
      try{
        // Fetch from backend API with Redis caching
        // Backend handles all caching — we just call it directly
        const res = await axios.get('http://localhost:5000/api/findings', { timeout: 15000 })
        if(cancelled) return
        
        let payload = res.data
        if(payload && typeof payload.body === 'string'){
          try{ payload = JSON.parse(payload.body) }catch(e){ /* keep original */ }
        }

        // Normalize the API response into internal format
        // Converts various API shapes into: report_summary items + finding items
        if(Array.isArray(payload)){
          try{
            const transformed = []
            payload.forEach(rep => {
              const reportSummary = {
                item_type: 'report_summary',
                scan_start: rep.processed_timestamp || rep.sk || rep.scan_start || null,
                report_id: rep.pk || rep.id || null,
                total_high_severity_count: rep.total_high_severity_count || 0,
                raw: rep
              }
              transformed.push(reportSummary)
              const vulns = Array.isArray(rep.vulnerabilities) ? rep.vulnerabilities : []
              vulns.forEach(v=>{
                transformed.push({
                  item_type: 'finding',
                  name: v.vulnerability_name || v.name || 'Unnamed',
                  host: v.host || v.hostname || v.asset || 'unknown',
                  port: v.port || undefined,
                  severity: v.threat_level || v.severity || 'Unknown',
                  severity_num: (typeof v.cvss_severity === 'number') ? v.cvss_severity : (Number(v.cvss_severity) || 0),
                  cvss: v.cvss_severity || v.cvss || null,
                  cves: v.nvt_oid ? [v.nvt_oid] : (v.cves || []),
                  description: v.description || '',
                  reference: v.nvt_oid ? `nvt:${v.nvt_oid}` : v.reference || '',
                  raw: v
                })
              })
            })
            payload = transformed
          }catch(e){ /* fall back to original payload */ }
        }
        
        if(!cancelled) {
          setData(payload)
          setDemoMode(false)
          setError(null)
        }
        
        // Persist to history (30 days) — for Historical view
        try{ persistToHistory(payload) }catch(e){}
        
      }catch(err){ 
        // Graceful degradation: On backend error, use demo data
        if(!cancelled) {
          console.warn('Failed to fetch from backend, using demo data:', err.message)
          const mockPayload = generateMockDataForDemo()
          setData(mockPayload)
          setDemoMode(true)
          setError(null) // Don't show error, user sees demo mode instead
        }
      }finally{ 
        if(!cancelled) setLoading(false) 
      }
    }
    fetchData()
    return ()=>{ cancelled = true }
  },[])

  return (
    <DataContext.Provider value={{data, loading, error, demoMode}}>
      {children}
    </DataContext.Provider>
  )
}

export function useData(){
  return useContext(DataContext)
}

// Patching context
const PatchContext = createContext(null)

export function usePatchAndScan(){
  return useContext(PatchContext)
}

// Hook to use patching (exported for use in components)
export function createPatchingHook(){
  return ()=> {
    const [patchLoading, setPatchLoading] = useState(false)
    const [patchError, setPatchError] = useState(null)
    const [patchStatus, setPatchStatus] = useState(null)

    const triggerPatchAndScan = async (vmSelection = 'both') => {
      setPatchLoading(true)
      setPatchError(null)
      setPatchStatus(`🔄 Starting patch deployment for ${vmSelection}...\n`)

      try {
        // Step 1: Trigger patching API via backend
        setPatchStatus((prev) => prev + `📦 Calling patch API for ${vmSelection}...\n`)
        const patchRes = await axios.post('http://localhost:5000/patching/apply', {
          vms: vmSelection, // 'both', 'windows', or 'linux'
          timestamp: new Date().toISOString()
        }, { timeout: 30000 })

        setPatchStatus((prev) => prev + `✅ Patch API response received\n`)

        if (!patchRes.data || !patchRes.data.success) {
          throw new Error(patchRes.data?.message || 'Patching API failed')
        }

        // Step 2: Wait a bit for patches to apply
        setPatchStatus((prev) => prev + `⏳ Waiting for patches to apply (30 seconds)...\n`)
        await new Promise((resolve) => setTimeout(resolve, 30000))

        // Step 3: Trigger OpenVAS scan via backend
        setPatchStatus((prev) => prev + `🔍 Starting OpenVAS scan...\n`)
        const scanRes = await axios.post('http://localhost:5000/scanning/openvas-trigger', {
          target: vmSelection,
          timestamp: new Date().toISOString()
        }, { timeout: 10000 })

        if (!scanRes.data || !scanRes.data.success) {
          throw new Error(scanRes.data?.message || 'OpenVAS scan trigger failed')
        }

        setPatchStatus(
          (prev) =>
            prev +
            `✅ OpenVAS scan triggered successfully!\n\n` +
            `📊 Scan is running in the background. Results will appear in Overview shortly.\n` +
            `🔔 Check back in a few minutes to see updated findings.`
        )

        // Clear server-side Redis cache to ensure fresh data
        try {
          await axios.post('http://localhost:5000/cache/clear', {}, { timeout: 5000 })
        } catch (e) { /* ignore */ }
      } catch (err) {
        const errorMsg = err.response?.data?.message || err.message || 'Unknown error'
        setPatchError(errorMsg)
        setPatchStatus((prev) => prev + `❌ Error: ${errorMsg}\n`)
      } finally {
        setPatchLoading(false)
      }
    }

    return { triggerPatchAndScan, patchLoading, patchError, patchStatus }
  }
}

// Provider component wrapper
export function PatchingProvider({ children }) {
  const hook = createPatchingHook()()
  return (
    <PatchContext.Provider value={hook}>
      {children}
    </PatchContext.Provider>
  )
}
