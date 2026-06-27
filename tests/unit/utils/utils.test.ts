import { describe, it, expect } from 'vitest'
import { stableStringify } from '../../../project/src/utils/stable-json.js'
import { sha256Hex } from '../../../project/src/utils/hash.js'
import { generateId, generateKey } from '../../../project/src/utils/ids.js'
import { estimateTokens } from '../../../project/src/utils/token-count.js'

describe('stableStringify', () => {
  it('produces identical output for reordered keys', () => {
    const a = stableStringify({ z: 1, a: 2 })
    const b = stableStringify({ a: 2, z: 1 })
    expect(a).toBe(b)
  })

  it('handles arrays without sorting', () => {
    expect(stableStringify([3, 1, 2])).toBe('[3,1,2]')
  })

  it('handles null', () => {
    expect(stableStringify(null)).toBe('null')
  })

  it('handles nested objects', () => {
    const a = stableStringify({ b: { y: 1, x: 2 }, a: 3 })
    const b = stableStringify({ a: 3, b: { x: 2, y: 1 } })
    expect(a).toBe(b)
  })
})

describe('sha256Hex', () => {
  it('returns a 64-char hex string', () => {
    const h = sha256Hex('hello')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic', () => {
    expect(sha256Hex('test')).toBe(sha256Hex('test'))
  })

  it('differs for different inputs', () => {
    expect(sha256Hex('a')).not.toBe(sha256Hex('b'))
  })
})

describe('generateId / generateKey', () => {
  it('generateId returns a UUID-style string', () => {
    expect(generateId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('generateId returns unique values', () => {
    expect(generateId()).not.toBe(generateId())
  })

  it('generateKey returns a 6-char hex string', () => {
    expect(generateKey()).toMatch(/^[0-9a-f]{6}$/)
  })
})

describe('estimateTokens', () => {
  it('returns at least 1 for empty string', () => {
    expect(estimateTokens('')).toBe(1)
  })

  it('estimates 4 chars per token', () => {
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcde')).toBe(2)
    expect(estimateTokens('a'.repeat(400))).toBe(100)
  })
})
