export interface Patient {
  id: number
  name: string
  age: number
  gender: string
  phone: string
  email: string
  address: string
  lastVisit: string
  medicalHistory: {
    conditions: string[]
    medications: string[]
    allergies: string[]
  }
}

export interface Appointment {
  id: number
  patientId: number
  patientName: string
  date: string
  time: string
  reason: string
  notes: string
  status: 'scheduled' | 'completed' | 'cancelled'
}

export interface ChatMessage {
  id: string
  patientId: number
  content: string
  role: 'user' | 'assistant'
  timestamp: Date
}
