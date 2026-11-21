import type { Feature } from '../../kernel/types'
import { crisisSupportFeature } from './support'
import { crisisGroundingFeature } from './grounding'

export const crisisFeature: Feature = {
  id: 'crisis',
  init(ctx) {
    crisisSupportFeature.init(ctx)
    crisisGroundingFeature.init(ctx)
  }
}
