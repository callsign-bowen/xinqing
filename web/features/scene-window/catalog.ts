export const SCENES = [
  { id: 'forest', name: '森林营地', character: '小狗', description: '坐在火堆旁，和小狗聊聊。' },
  { id: 'ocean', name: '水彩海底', character: '小章鱼', description: '在海草和珊瑚之间，和小章鱼说说话。' },
  { id: 'window', name: '安静窗边', character: '小猫', description: '和小猫一起，在窗边坐一会儿。' },
  { id: 'lunar', name: '月面观星', character: '宇航员', description: '和宇航员一起，看看月面与星空。' },
  { id: 'bedroom', name: '温暖卧室', character: '小狗', description: '回到熟悉的小房间，和小狗待一会儿。' }
] as const
export type SceneId = typeof SCENES[number]['id']
