import { beforeEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'fs'
import { getPatients, getPatient, savePatients } from '@/lib/storage'
import { Patient } from 'types'

// Mock fs module
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    access: vi.fn(),
    mkdir: vi.fn(),
  },
}))

describe('Storage Library', () => {
  const mockPatients: Patient[] = [
    {
      id: 1,
      name: 'John Doe',
      age: 45,
      gender: 'Male',
      phone: '(555) 123-4567',
      email: 'john.doe@email.com',
      address: '123 Main St, Anytown, USA 12345',
      lastVisit: '2024-01-15',
      medicalHistory: {
        conditions: ['Hypertension', 'Type 2 Diabetes'],
        medications: ['Metformin', 'Lisinopril'],
        allergies: ['Penicillin']
      }
    }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getPatients', () => {
    it('should return patients when file exists', async () => {

      vi.mocked(fs).readFile.mockResolvedValue(JSON.stringify(mockPatients))
      vi.mocked(fs).access.mockResolvedValue(undefined)

      const patients = await getPatients()
      
      expect(patients).toEqual(mockPatients)
      expect(vi.mocked(fs).readFile).toHaveBeenCalledWith(
        expect.stringContaining('patients.json'),
        'utf8'
      )
    })

    it('should return empty array when file does not exist', async () => {

      vi.mocked(fs).readFile.mockRejectedValue(new Error('File not found'))
      vi.mocked(fs).access.mockRejectedValue(new Error('Dir not found'))

      const patients = await getPatients()
      
      expect(patients).toEqual([])
    })
  })

  describe('getPatient', () => {
    it('should return patient when found', async () => {

      vi.mocked(fs).readFile.mockResolvedValue(JSON.stringify(mockPatients))
      vi.mocked(fs).access.mockResolvedValue(undefined)

      const patient = await getPatient(1)
      
      expect(patient).toEqual(mockPatients[0])
    })

    it('should return null when patient not found', async () => {

      vi.mocked(fs).readFile.mockResolvedValue(JSON.stringify(mockPatients))
      vi.mocked(fs).access.mockResolvedValue(undefined)

      const patient = await getPatient(999)
      
      expect(patient).toBeNull()
    })
  })

  describe('savePatients', () => {
    it('should save patients to file', async () => {

      vi.mocked(fs).writeFile.mockResolvedValue(undefined)
      vi.mocked(fs).access.mockResolvedValue(undefined)

      await savePatients(mockPatients)
      
      expect(vi.mocked(fs).writeFile).toHaveBeenCalledWith(
        expect.stringContaining('patients.json'),
        JSON.stringify(mockPatients, null, 2)
      )
    })
  })
})

