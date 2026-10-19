import { describe, expect, it } from 'vitest'
import config from '../vite.config'

describe('desktop renderer packaging', () => {
  it('uses relative asset URLs for Electron file:// loading', () => {
    expect(config.base).toBe('./')
  })
})
