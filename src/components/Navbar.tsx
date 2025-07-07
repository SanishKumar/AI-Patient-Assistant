import Link from 'next/link'
import { Home, Users, Calendar, Activity } from 'lucide-react'

export function Navbar() {
  return (
    <nav className="navbar">
      <div className="container">
        <div className="navbar-container">
          <Link href="/" className="navbar-brand">
            <Activity className="w-6 h-6" />
            <span>Patient Assistant</span>
          </Link>
          
          <div className="navbar-nav">
            <Link href="/" className="navbar-link">
              <Home className="w-4 h-4" />
              <span>Home</span>
            </Link>
            
            <Link href="/dashboard" className="navbar-link">
              <Users className="w-4 h-4" />
              <span>Dashboard</span>
            </Link>
            
            <Link href="/appointments" className="navbar-link">
              <Calendar className="w-4 h-4" />
              <span>Appointments</span>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}
