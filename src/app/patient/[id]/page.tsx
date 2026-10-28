import { notFound } from 'next/navigation'

// Historical numeric patient URLs must not expose the prototype's unprotected JSON records.
export default function PatientPage() {
  notFound()
}
