import Link from 'next/link'
import { User, Calendar, Phone } from 'lucide-react'
import { Patient } from 'types'

interface PatientCardProps {
  patient: Patient
}

export function PatientCard({ patient }: PatientCardProps) {
  return (
    <div className="card hover:shadow-md transition-shadow">
      <div className="card-header pb-3">
        <div className="flex items-center space-x-3">
          <div className="avatar">
            <div className="avatar-fallback">
              {patient.name.split(' ').map(n => n[0]).join('')}
            </div>
          </div>
          <div>
            <h3 className="text-lg font-semibold">{patient.name}</h3>
            <p className="text-sm text-muted-foreground">ID: {patient.id}</p>
          </div>
        </div>
      </div>
      <div className="card-content space-y-3">
        <div className="flex items-center space-x-2 text-sm">
          <User className="w-4 h-4 text-muted-foreground" />
          <span>{patient.age} years old, {patient.gender}</span>
        </div>
        
        <div className="flex items-center space-x-2 text-sm">
          <Phone className="w-4 h-4 text-muted-foreground" />
          <span>{patient.phone}</span>
        </div>
        
        <div className="flex items-center space-x-2 text-sm">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span>Last visit: {patient.lastVisit}</span>
        </div>
        
        <div className="flex flex-wrap gap-1">
          {patient.medicalHistory.conditions.slice(0, 2).map(condition => (
            <span key={condition} className="badge badge-secondary text-xs">
              {condition}
            </span>
          ))}
          {patient.medicalHistory.conditions.length > 2 && (
            <span className="badge badge-outline text-xs">
              +{patient.medicalHistory.conditions.length - 2} more
            </span>
          )}
        </div>
        
        <Link href={`/patient/${patient.id}`} className="btn btn-primary w-full">
          View Details
        </Link>
      </div>
    </div>
  )
}
