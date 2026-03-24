import React from 'react'
import { DataProvider, PatchingProvider } from './dataContext'
import Dashboard from './components/Dashboard'

export default function App(){
  return (
    <DataProvider>
      <PatchingProvider>
        <div className="app-root">
         <Dashboard />
        </div>
      </PatchingProvider>
    </DataProvider>
  )
}
