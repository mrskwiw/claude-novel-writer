import { randomUUID, randomBytes } from 'crypto'

export function generateId(): string {
  return randomUUID()
}

export function generateKey(): string {
  return randomBytes(3).toString('hex')
}
