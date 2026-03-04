import React from 'react'
import { Bar, Pie } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend } from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

function getArray(data){
  return Array.isArray(data) ? data : [data]
}

function cvssDistribution(arr){
  // bucket by severity_num rounded to integer
  const buckets = { '0-1':0,'1-3':0,'3-5':0,'5-7':0,'7-10':0 }
  arr.forEach(item=>{
    const v = Number(item.severity_num ?? item.cvss_num ?? item.cvss ?? 0)
    if(v<=1) buckets['0-1']++
    else if(v<=3) buckets['1-3']++
    else if(v<=5) buckets['3-5']++
    else if(v<=7) buckets['5-7']++
    else buckets['7-10']++
  })
  return buckets
}

function topHosts(arr, limit=5){
  const counts = {}
  arr.forEach(item=>{ const h = item.hostname || item.host || item.target_name || 'unknown'; counts[h]=(counts[h]||0)+1 })
  return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,limit)
}

export default function Charts({data}){
  const arr = getArray(data)
  if(arr.length===0) return null

  const dist = cvssDistribution(arr)
  const distLabels = Object.keys(dist)
  const distValues = Object.values(dist)

  const severityCounts = {
    low: arr.filter(x=> (x.severity_num ?? x.cvss_num ?? 0) < 4).length,
    medium: arr.filter(x=> (x.severity_num ?? x.cvss_num ?? 0) >=4 && (x.severity_num ?? x.cvss_num ?? 0) <7).length,
    high: arr.filter(x=> (x.severity_num ?? x.cvss_num ?? 0) >=7).length,
  }

  const hosts = topHosts(arr)

  const barData = {
    labels: distLabels,
    datasets: [{ label: 'Findings', data: distValues, backgroundColor: ['#ff7a59','#ffb86b','#ffd166','#6fcf97','#6f42c1'] }]
  }

  const pieData = {
    labels: ['Low','Medium','High'],
    datasets: [{ data: [severityCounts.low, severityCounts.medium, severityCounts.high], backgroundColor: ['#6fcf97','#ffd166','#ff7a59'] }]
  }

  return (
    <div className="chart-grid">
      <div className="card chart-card">
        <h3 className="card-title">CVSS Distribution</h3>
        <Bar data={barData} />
      </div>
      <div className="card chart-card">
        <h3 className="card-title">Severity Breakdown</h3>
        <Pie data={pieData} />
      </div>
      <div className="card full-row">
        <h3 className="card-title">Top Hosts</h3>
        <ul className="hosts-list">
          {hosts.map(([h,c])=> (
            <li key={h} className="hosts-item">{h} <span className="host-count">{c} findings</span></li>
          ))}
        </ul>
      </div>
    </div>
  )
}
