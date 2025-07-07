describe('Patient Flow', () => {
  beforeEach(() => {
    cy.visit('/')
  })

  it('should navigate through patient dashboard', () => {
    // Test homepage
    cy.contains('Welcome to Patient Assistant Dashboard')
    cy.contains('Go to Dashboard').click()

    // Test dashboard
    cy.url().should('include', '/dashboard')
    cy.contains('Dashboard')
    cy.contains('Total Patients')
    cy.contains('Patient List')

    // Test patient details
    cy.contains('View Details').first().click()
    cy.url().should('include', '/patient/')
    cy.contains('Patient Information')
    cy.contains('Medical History')
    cy.contains('AI Assistant')
  })

  it('should interact with AI chat', () => {
    cy.visit('/patient/1')
    
    // Test chat interface
    cy.get('[placeholder*="Ask questions about"]').type('What medications is this patient taking?')
    cy.get('button[type="submit"]').click()
    
    // Check if message appears
    cy.contains('What medications is this patient taking?')
    
    // Wait for AI response (with timeout)
    cy.contains('I apologize, but I\'m having trouble connecting', { timeout: 10000 })
      .should('be.visible')
  })

  it('should display patient information correctly', () => {
    cy.visit('/patient/1')
    
    // Check patient information is displayed
    cy.contains('John Doe')
    cy.contains('Patient ID: 1')
    cy.contains('45 years old')
    cy.contains('Male')
    cy.contains('(555) 123-4567')
    
    // Check medical history
    cy.contains('Hypertension')
    cy.contains('Type 2 Diabetes')
    cy.contains('Metformin')
    cy.contains('Penicillin')
  })
})
