import type Database from 'better-sqlite3'
export function mailConfigured(): boolean
export function enqueueMail(db: Database.Database, to: string, subject: string, text: string): void
export function deliverNext(
  db: Database.Database,
  transport: { sendMail(message: object): Promise<unknown> },
  now?: number,
): Promise<boolean>
