import { PatientList } from '@/components/PatientList'
import { getPatients, getAppointments } from '@/lib/storage'

export default async function Dashboard() {
  const patients = await getPatients()
  const appointments = await getAppointments()

  const todayAppointments = appointments.filter(apt => {
    const today = new Date().toISOString().split('T')[0]
    return apt.date === today
  })

  const upcomingAppointments = appointments.filter(apt => {
    const today = new Date().toISOString().split('T')[0]
    return apt.date > today
  }).slice(0, 5)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          {new Date().toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="card">
          <div className="card-header pb-3">
            <h3 className="card-title">Total Patients</h3>
            <p className="card-description">Active patients in system</p>
          </div>
          <div className="card-content">
            <p className="text-3xl font-bold">{patients.length}</p>
          </div>
        </div>

        <div className="card">
          <div className="card-header pb-3">
            <h3 className="card-title">Today's Appointments</h3>
            <p className="card-description">Scheduled for today</p>
          </div>
          <div className="card-content">
            <p className="text-3xl font-bold">{todayAppointments.length}</p>
          </div>
        </div>

        <div className="card">
          <div className="card-header pb-3">
            <h3 className="card-title">Upcoming Appointments</h3>
            <p className="card-description">Next 5 appointments</p>
          </div>
          <div className="card-content">
            <p className="text-3xl font-bold">{upcomingAppointments.length}</p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Patient List</h3>
            <p className="card-description">All registered patients</p>
          </div>
          <div className="card-content">
            <PatientList patients={patients} />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Upcoming Appointments</h3>
            <p className="card-description">Next scheduled appointments</p>
          </div>
          <div className="card-content">
            <div className="space-y-4">
              {upcomingAppointments.map(appointment => (
                <div key={appointment.id} className="flex justify-between items-center p-3 border rounded">
                  <div>
                    <p className="font-medium">{appointment.patientName}</p>
                    <p className="text-sm text-muted-foreground">{appointment.reason}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{appointment.date}</p>
                    <p className="text-sm text-muted-foreground">{appointment.time}</p>
                  </div>
                </div>
              ))}
              {upcomingAppointments.length === 0 && (
                <p className="text-center text-muted-foreground py-4">
                  No upcoming appointments
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
