import { getPatient, getPatientAppointments } from '@/lib/storage'
import { ChatInterface } from '@/components/ChatInterface'
import { notFound } from 'next/navigation'

interface PatientPageProps {
  params: {
    id: string
  }
}

export default async function PatientPage({ params }: PatientPageProps) {
  const patientId = parseInt(params.id)
  const patient = await getPatient(patientId)
  const appointments = await getPatientAppointments(patientId)

  if (!patient) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="avatar w-16 h-16">
          <div className="avatar-fallback text-lg">
            {patient.name.split(' ').map(n => n[0]).join('')}
          </div>
        </div>
        <div>
          <h1 className="text-3xl font-bold">{patient.name}</h1>
          <p className="text-muted-foreground">Patient ID: {patient.id}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Patient Information</h3>
            </div>
            <div className="card-content space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium">Age</p>
                  <p className="text-sm text-muted-foreground">{patient.age}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Gender</p>
                  <p className="text-sm text-muted-foreground">{patient.gender}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Phone</p>
                  <p className="text-sm text-muted-foreground">{patient.phone}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Email</p>
                  <p className="text-sm text-muted-foreground">{patient.email}</p>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium">Address</p>
                <p className="text-sm text-muted-foreground">{patient.address}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Medical History</h3>
            </div>
            <div className="card-content space-y-4">
              <div>
                <p className="text-sm font-medium">Conditions</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {patient.medicalHistory.conditions.map(condition => (
                    <span key={condition} className="badge badge-secondary">
                      {condition}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium">Medications</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {patient.medicalHistory.medications.map(medication => (
                    <span key={medication} className="badge badge-outline">
                      {medication}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium">Allergies</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {patient.medicalHistory.allergies.map(allergy => (
                    <span key={allergy} className="badge badge-destructive">
                      {allergy}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Recent Appointments</h3>
            </div>
            <div className="card-content">
              <div className="space-y-3">
                {appointments.slice(0, 5).map(appointment => (
                  <div key={appointment.id} className="flex justify-between items-center p-3 border rounded">
                    <div>
                      <p className="font-medium">{appointment.reason}</p>
                      <p className="text-sm text-muted-foreground">{appointment.notes}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{appointment.date}</p>
                      <p className="text-sm text-muted-foreground">{appointment.time}</p>
                    </div>
                  </div>
                ))}
                {appointments.length === 0 && (
                  <p className="text-center text-muted-foreground py-4">
                    No appointments found
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="card h-600">
            <div className="card-header">
              <h3 className="card-title">AI Assistant</h3>
              <p className="card-description">
                Ask questions about {patient.name}'s medical history, medications, or health concerns
              </p>
            </div>
            <div className="card-content p-0">
              <ChatInterface patientId={patient.id} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
