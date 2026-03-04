import React from 'react'
import { DataProvider } from './dataContext'
import Dashboard from './components/Dashboard'

export default function App(){
  return (
    <DataProvider>
      <div className="app-root">
       <Dashboard />
      </div>
    </DataProvider>
  )
}
