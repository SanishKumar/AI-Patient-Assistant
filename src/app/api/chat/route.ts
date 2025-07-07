import { NextRequest, NextResponse } from 'next/server'
import { generateChatResponse } from '@/lib/openai'
import { saveChatMessage } from '@/lib/storage'
import { ChatMessage } from '@/types'

export async function POST(request: NextRequest) {
  try {
    const { message, patientId, messages } = await request.json()

    if (!message || !patientId) {
      return NextResponse.json(
        { error: 'Message and patient ID are required' },
        { status: 400 }
      )
    }

    const response = await generateChatResponse(message, patientId, messages)

    // Save both user message and AI response
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      patientId,
      content: message,
      role: 'user',
      timestamp: new Date(),
    }

    const aiMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
      patientId,
      content: response,
      role: 'assistant',
      timestamp: new Date(),
    }

    await saveChatMessage(userMessage)
    await saveChatMessage(aiMessage)

    return NextResponse.json({ message: response })
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    )
  }
}
