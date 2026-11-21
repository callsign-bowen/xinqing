import type { Feature } from '../../kernel/types'
import { profilePageFeature } from './page'
import { profileAccountFeature } from './account'

export const profileFeature: Feature = {
  id: 'profile',
  init(ctx) {
    profilePageFeature.init(ctx)
    profileAccountFeature.init(ctx)
  }
}
