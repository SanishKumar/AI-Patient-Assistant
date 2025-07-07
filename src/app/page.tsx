import Link from 'next/link'

export default function Home() {
  return (
    <div className="space-y-8">
      <section className="text-center space-y-4">
        <h1 className="text-4xl font-bold">
          Welcome to Patient Assistant Dashboard
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          AI-powered healthcare assistant to help manage patient information, 
          appointments, and provide intelligent medical insights.
        </p>
        <div className="flex justify-center gap-4">
          <Link href="/dashboard" className="btn btn-primary btn-lg">
            Go to Dashboard
          </Link>
          <Link href="/patient/1" className="btn btn-outline btn-lg">
            View Sample Patient
          </Link>
        </div>
      </section>

      <section className="grid md:grid-cols-3 gap-6">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Patient Management</h3>
            <p className="card-description">
              Comprehensive patient records and medical history
            </p>
          </div>
          <div className="card-content">
            <p className="text-sm text-muted-foreground">
              Track patient information, medical history, medications, and appointments
              in one centralized location.
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">AI Assistant</h3>
            <p className="card-description">
              Intelligent healthcare insights and recommendations
            </p>
          </div>
          <div className="card-content">
            <p className="text-sm text-muted-foreground">
              Get AI-powered assistance for patient queries, medical insights,
              and treatment recommendations.
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Appointment Scheduling</h3>
            <p className="card-description">
              Easy appointment management and scheduling
            </p>
          </div>
          <div className="card-content">
            <p className="text-sm text-muted-foreground">
              Schedule, reschedule, and manage patient appointments with
              automated reminders and notifications.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
