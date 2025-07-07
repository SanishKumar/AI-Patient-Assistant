import { getPatients, getPatient, savePatients } from '@/lib/storage'
import { Patient } from 'types'

// Mock fs module
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    access: jest.fn(),
    mkdir: jest.fn(),
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
    jest.clearAllMocks()
  })

  describe('getPatients', () => {
    it('should return patients when file exists', async () => {
      const fs = require('fs')
      fs.promises.readFile.mockResolvedValue(JSON.stringify(mockPatients))
      fs.promises.access.mockResolvedValue(undefined)

      const patients = await getPatients()
      
      expect(patients).equal(mockPatients)
      expect(fs.promises.readFile).toHaveBeenCalledWith(
        expect.stringContaining('patients.json'),
        'utf8'
      )
    })

    it('should return empty array when file does not exist', async () => {
      const fs = require('fs')
      fs.promises.readFile.mockRejectedValue(new Error('File not found'))
      fs.promises.access.mockRejectedValue(new Error('Dir not found'))

      const patients = await getPatients()
      
      expect(patients).toEqual([])
    })
  })

  describe('getPatient', () => {
    it('should return patient when found', async () => {
      const fs = require('fs')
      fs.promises.readFile.mockResolvedValue(JSON.stringify(mockPatients))
      fs.promises.access.mockResolvedValue(undefined)

      const patient = await getPatient(1)
      
      expect(patient).toEqual(mockPatients[0])
    })

    it('should return null when patient not found', async () => {
      const fs = require('fs')
      fs.promises.readFile.mockResolvedValue(JSON.stringify(mockPatients))
      fs.promises.access.mockResolvedValue(undefined)

      const patient = await getPatient(999)
      
      expect(patient).toBeNull()
    })
  })

  describe('savePatients', () => {
    it('should save patients to file', async () => {
      const fs = require('fs')
      fs.promises.writeFile.mockResolvedValue(undefined)
      fs.promises.access.mockResolvedValue(undefined)

      await savePatients(mockPatients)
      
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('patients.json'),
        JSON.stringify(mockPatients, null, 2)
      )
    })
  })
})
