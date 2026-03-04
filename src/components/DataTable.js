import React from 'react'

export default function DataTable({data}){
  const entries = Array.isArray(data) ? data : [data]

  const keys = ['hostname','host','port','name','severity','severity_num','cvss','cves','summary']

  return (
    <div className="data-table-root">
      <h2 className="dt-title">Findings</h2>
      <div className="dt-wrap">
        <table>
          <thead>
            <tr>
              {keys.map(k=> <th key={k}>{k}</th>)}
            </tr>
          </thead>
          <tbody>
            {entries.map((row,idx)=> (
              <tr key={idx}>
                {keys.map(k=> (
                  <td key={k}>{(row[k] && Array.isArray(row[k])) ? row[k].join(', ') : String(row[k] ?? '')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
