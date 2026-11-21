import type { Feature } from '../../kernel/types'
import { shellThemeFeature } from './theme'
import { shellSwapFeature } from './swap'

/** 主题、问候、Toast、底栏。swap 必须在其它首页改位逻辑之后执行，由 boot 单独调用。 */
export const shellFeature: Feature = {
  id: 'shell',
  init(ctx) {
    shellThemeFeature.init(ctx)
  }
}

export { shellSwapFeature }
