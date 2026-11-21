import type { Feature } from '../../kernel/types'
import { checkinPersistFeature } from './persist'

export const checkinFeature: Feature = {
  id: 'checkin',
  init(ctx) {
    checkinPersistFeature.init(ctx)
  }
}
