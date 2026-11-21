/**
 * 构件契约：每个功能目录导出一个 Feature。
 * 构件之间禁止互相 import，只通过 AppContext 通信。
 */
import type { AppContext } from './context'

export interface Feature {
  /** 与文件夹名一致，boot.ts 用它注册/摘除 */
  id: string
  init(ctx: AppContext): void
}
