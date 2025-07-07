import { promises as fs } from 'fs'
import path from 'path'
import { Patient, Appointment, ChatMessage } from 'types'

const dataDir = path.join(process.cwd(), 'data')

// Ensure data directory exists
export async function ensureDataDirectory() {
  try {
    await fs.access(dataDir)
  } catch {
    await fs.mkdir(dataDir, { recursive: true })
  }
}

// Patients
export async function getPatients(): Promise<Patient[]> {
  try {
    await ensureDataDirectory()
    const filePath = path.join(dataDir, 'patients.json')
    const data = await fs.readFile(filePath, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    console.error('Error reading patients:', error)
    return []
  }
}

export async function getPatient(id: number): Promise<Patient | null> {
  const patients = await getPatients()
  return patients.find(p => p.id === id) || null
}

export async function savePatients(patients: Patient[]): Promise<void> {
  try {
    await ensureDataDirectory()
    const filePath = path.join(dataDir, 'patients.json')
    await fs.writeFile(filePath, JSON.stringify(patients, null, 2))
  } catch (error) {
    console.error('Error saving patients:', error)
    throw error
  }
}

// Appointments
export async function getAppointments(): Promise<Appointment[]> {
  try {
    await ensureDataDirectory()
    const filePath = path.join(dataDir, 'appointments.json')
    const data = await fs.readFile(filePath, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    console.error('Error reading appointments:', error)
    return []
  }
}

export async function getPatientAppointments(patientId: number): Promise<Appointment[]> {
  const appointments = await getAppointments()
  return appointments.filter(apt => apt.patientId === patientId)
}

export async function saveAppointments(appointments: Appointment[]): Promise<void> {
  try {
    await ensureDataDirectory()
    const filePath = path.join(dataDir, 'appointments.json')
    await fs.writeFile(filePath, JSON.stringify(appointments, null, 2))
  } catch (error) {
    console.error('Error saving appointments:', error)
    throw error
  }
}

// Chat History
export async function getChatHistory(patientId: number): Promise<ChatMessage[]> {
  try {
    await ensureDataDirectory()
    const filePath = path.join(dataDir, 'chat-history.json')
    const data = await fs.readFile(filePath, 'utf8')
    const allChats = JSON.parse(data)
    return allChats.filter((msg: ChatMessage) => msg.patientId === patientId)
  } catch (error) {
    console.error('Error reading chat history:', error)
    return []
  }
}

export async function saveChatMessage(message: ChatMessage): Promise<void> {
  try {
    await ensureDataDirectory()
    const filePath = path.join(dataDir, 'chat-history.json')
    let chatHistory: ChatMessage[] = []
    
    try {
      const data = await fs.readFile(filePath, 'utf8')
      chatHistory = JSON.parse(data)
    } catch {
      // File doesn't exist, start with empty array
    }
    
    chatHistory.push(message)
    await fs.writeFile(filePath, JSON.stringify(chatHistory, null, 2))
  } catch (error) {
    console.error('Error saving chat message:', error)
    throw error
  }
}
