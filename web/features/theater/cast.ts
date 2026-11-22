/**
 * 演绎系统的人物形象。
 *
 * 现在每个角色用分部件的 SVG 木偶占位（头、身体、左右手臂、左右腿）。
 * 拿到正式人物素材后，在 PUPPET_ASSETS 里给对应角色填上图片地址即可替换：
 * - 只给 full：整张立绘当木偶，动作以整体摆动为主；
 * - 给齐 head / torso / armL / armR / legL / legR：逐部件替换，动作最完整。
 * 图片放在 public/theater/<角色>/ 下，地址写成 '/theater/<角色>/head.png' 这种形式。
 * 部件图请按占位木偶的画布对齐：120 × 250，肩关节约在 (38,74) / (82,74)，髋关节约在 (48,150) / (72,150)。
 */

export type TheaterRole =
  | 'self' | 'mother' | 'father' | 'parent' | 'sibling' | 'grandparent' | 'partner'
  | 'friend' | 'classmate' | 'teacher' | 'boss' | 'colleague' | 'other'

export type PuppetPart = 'head' | 'torso' | 'armL' | 'armR' | 'legL' | 'legR'

export interface PuppetAssets {
  full?: string
  parts?: Partial<Record<PuppetPart, string>>
}

export interface PuppetLook {
  /** 衣服颜色 */
  cloth: string
  /** 头发颜色 */
  hair: string
  hairStyle: 'short' | 'long' | 'bun' | 'spiky' | 'bald'
  /** 裤子/裙子颜色 */
  lower: string
  glasses?: boolean
  tie?: boolean
}

export const PUPPET_LOOKS: Record<TheaterRole, PuppetLook> = {
  self:        { cloth: '#7fa8c9', hair: '#3b3330', hairStyle: 'spiky', lower: '#4d5b6e' },
  mother:      { cloth: '#d98b8b', hair: '#4a3a33', hairStyle: 'long',  lower: '#7a5a5a' },
  father:      { cloth: '#6f8f6a', hair: '#2f2b29', hairStyle: 'short', lower: '#4b4a46', glasses: true },
  parent:      { cloth: '#c9a46a', hair: '#3a322c', hairStyle: 'short', lower: '#5d5246' },
  sibling:     { cloth: '#a68fd1', hair: '#3b3330', hairStyle: 'spiky', lower: '#55507a' },
  grandparent: { cloth: '#9c8f80', hair: '#cfcac3', hairStyle: 'bun',   lower: '#5f5850', glasses: true },
  partner:     { cloth: '#e0a3c0', hair: '#40302c', hairStyle: 'long',  lower: '#6d5363' },
  friend:      { cloth: '#f0b46a', hair: '#3b3330', hairStyle: 'short', lower: '#5a5a66' },
  classmate:   { cloth: '#7cc2b5', hair: '#33302e', hairStyle: 'spiky', lower: '#4a6560' },
  teacher:     { cloth: '#8a7fb8', hair: '#3a3431', hairStyle: 'bun',   lower: '#4e4866', glasses: true },
  boss:        { cloth: '#4f5d73', hair: '#2b2826', hairStyle: 'short', lower: '#33393f', tie: true },
  colleague:   { cloth: '#8aa0b8', hair: '#3b3330', hairStyle: 'short', lower: '#4c5562' },
  other:       { cloth: '#b5a58f', hair: '#3b3330', hairStyle: 'short', lower: '#5c5549' }
}

/** 正式素材登记处。目前为空，全部角色使用 SVG 占位木偶。 */
export const PUPPET_ASSETS: Partial<Record<TheaterRole, PuppetAssets>> = {}

export function lookOf(role: string): PuppetLook {
  return PUPPET_LOOKS[role as TheaterRole] || PUPPET_LOOKS.other
}

export function assetsOf(role: string): PuppetAssets | undefined {
  return PUPPET_ASSETS[role as TheaterRole]
}
