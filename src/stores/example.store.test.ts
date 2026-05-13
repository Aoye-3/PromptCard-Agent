import { describe, it, expect, beforeEach } from 'vitest'
import { useExampleStore } from './example.store'

describe('example store', () => {
  beforeEach(() => {
    useExampleStore.getState().init()
  })
  
  it('should initialize examples', () => {
    const examples = useExampleStore.getState().examples
    expect(examples.length).toBeGreaterThan(0)
  })
  
  it('should get examples by type', () => {
    const subjectExamples = useExampleStore.getState().getByType('subject')
    expect(subjectExamples.length).toBeGreaterThan(0)
  })
  
  it('should get top rated examples', () => {
    const topRated = useExampleStore.getState().getTopRated('subject', 3)
    expect(topRated.length).toBeLessThanOrEqual(3)
    expect(topRated[0].score).toBeGreaterThanOrEqual(topRated[1].score)
  })
  
  it('should search examples', () => {
    const results = useExampleStore.getState().search('风景')
    expect(results.length).toBeGreaterThan(0)
  })
})
