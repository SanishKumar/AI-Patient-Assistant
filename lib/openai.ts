import OpenAI from 'openai'
import { getPatient } from './storage'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function generateChatResponse(
  message: string,
  patientId: number,
  conversationHistory: Array<{ role: string; content: string }> = []
) {
  try {
    const patient = await getPatient(patientId)
    
    if (!patient) {
      throw new Error('Patient not found')
    }

    const systemPrompt = `You are a healthcare AI assistant helping with patient care. You have access to the following patient information:

Patient Name: ${patient.name}
Age: ${patient.age}
Gender: ${patient.gender}
Medical Conditions: ${patient.medicalHistory.conditions.join(', ')}
Current Medications: ${patient.medicalHistory.medications.join(', ')}
Allergies: ${patient.medicalHistory.allergies.join(', ')}
Last Visit: ${patient.lastVisit}

Guidelines:
1. Always maintain patient confidentiality
2. Provide helpful, accurate medical information
3. Always recommend consulting with healthcare professionals for medical decisions
4. Be empathetic and professional
5. If you don't know something, acknowledge it
6. Focus on the specific patient's information when relevant

Remember: You are an assistant tool and should not replace professional medical advice.`

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: message }
    ]

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: messages as any,
      max_tokens: 500,
      temperature: 0.7,
    })

    return completion.choices[0].message.content || 'I apologize, but I could not generate a response at this time.'
  } catch (error) {
    console.error('OpenAI API error:', error)
    throw new Error('Failed to generate response')
  }
}
