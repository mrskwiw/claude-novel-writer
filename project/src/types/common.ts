export type ID = string

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface Timestamped {
  createdAt: string
  updatedAt: string
}
