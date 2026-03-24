import React, { createContext, useContext, useEffect, useState } from 'react'
import axios from 'axios'
import { generateMockDataForDemo } from './mockData'

const DataContext = createContext(null)

// API Base URL - Redis-backed backend is REQUIRED
const API_BASE_URL = 'http://localhost:3005'

export function DataProvider({ children }){
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [demoMode, setDemoMode] = useState(false)

  useEffect(()=>{
    let cancelled = false
    async function fetchData(){
      try{
        // Fetch from Redis-backed backend API
        // The backend checks Redis cache first, then hits AWS on miss
        console.log('📡 Fetching vulnerability findings from backend API...')
        const res = await axios.get(`${API_BASE_URL}/api/findings`, { timeout: 15000 })
        if(cancelled) return

        // Process response
        let payload = res.data
        if(payload && typeof payload.body === 'string'){
          try{ payload = JSON.parse(payload.body) }catch(e){ /* keep original */ }
        }

        // Normalize the API shape: if payload is an array of report objects with `vulnerabilities`,
        // transform to the internal format: array with a report_summary item and finding items.
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
          console.log(`✅ Loaded ${payload.filter(x => x.item_type === 'finding').length} findings from backend`)
        }
      }catch(err){ 
        // On API error, use fallback mock data
        if(!cancelled) {
          console.warn('⚠️ Backend API error, using demo data:', err.message)
          console.warn('Make sure Redis and backend server are running:')
          console.warn('  Redis:   docker compose up -d')
          console.warn('  Backend: npm run server')
          const mockPayload = generateMockDataForDemo()
          setData(mockPayload)
          setDemoMode(true)
          setError(null) // Don't show error since we have fallback data
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
        // Step 1: Trigger patching API via backend (clears Redis cache)
        setPatchStatus((prev) => prev + `📦 Calling patching API for ${vmSelection}...\n`)
        const patchRes = await axios.post(`${API_BASE_URL}/patching/apply`, {
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

        // Step 3: Trigger OpenVAS scan via backend (clears Redis cache)
        setPatchStatus((prev) => prev + `🔍 Starting OpenVAS scan...\n`)
        const scanRes = await axios.post(`${API_BASE_URL}/scanning/openvas-trigger`, {
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
            `📊 Scan running in backend. Results will appear in Overview shortly.\n` +
            `🔔 Redis cache has been cleared automatically. Check back to see updated findings.`
        )
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
