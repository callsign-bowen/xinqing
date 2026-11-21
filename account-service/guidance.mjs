export const GUIDE_FIELDS = Object.freeze(['problem', 'feeling', 'belief', 'origin', 'step']);
const MARKER = '<<<GUIDE>>>';

export function normalizeGuide(raw) {
  const asked = [];
  for (const field of GUIDE_FIELDS) {
    if (!Array.isArray(raw?.asked) || raw.asked[asked.length] !== field) break;
    asked.push(field);
  }
  const status = ['daily', 'guided', 'paused', 'complete'].includes(raw?.status) ? raw.status : 'daily';
  return { version: 1, cycle: Number.isSafeInteger(raw?.cycle) && raw.cycle > 0 ? raw.cycle : 1, status: status === 'complete' && asked.length !== 5 ? 'guided' : status, asked };
}

/** The model reports one visible question; only the server advances the cursor. */
export function readGuidedReply(raw, previous) {
  const before = normalizeGuide(previous), text = String(raw || ''), index = text.indexOf(MARKER);
  let meta, reply;
  try {
    const envelope = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    if (typeof envelope.reply === 'string') { meta = envelope; reply = envelope.reply.trim(); }
  } catch { /* The old marker protocol is still accepted for compatibility. */ }
  if (!meta) {
    if (index < 0) return { text, guide: { ...before, status: 'daily' } };
    reply = text.slice(0, index).trim();
    try { meta = JSON.parse(text.slice(index + MARKER.length).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch { return { text: reply, guide: { ...before, status: 'paused' } }; }
  }
  if (!['daily', 'guided', 'paused'].includes(meta.mode)) return { text: reply, guide: { ...before, status: 'paused' } };
  if (meta.mode !== 'guided') return { text: reply, guide: { ...before, status: meta.mode }, envelope: meta };
  const asked = meta.restart === true ? [] : [...before.asked];
  const question = typeof meta.quote === 'string' ? meta.quote.trim() : '';
  // Answers and a filled sheet never advance this count. The question must be visible.
  if (meta.question === GUIDE_FIELDS[asked.length] && question.length > 0 && question.length <= 400
    && /[?？]/.test(question) && reply.includes(question)) asked.push(meta.question);
  return { text: reply, guide: { version: 1, cycle: meta.restart === true ? before.cycle + 1 : before.cycle, status: asked.length === 5 ? 'complete' : 'guided', asked }, envelope: meta };
}

export function guidancePrompt(previous) {
  const state = normalizeGuide(previous);
  const next = GUIDE_FIELDS[state.asked.length] || null;
  return `输出格式：只返回一个 JSON，不要代码块或额外文字：{"reply":"自然回复正文","mode":"daily或guided或paused","question":null,"quote":"","restart":false}。只有 reply 展示给用户，其他字段仅供旧协议兼容。
自然聊天的内部协议（不额外规定回复结构，不要求共情、总结或提问）：
回复方式完全按前述人格和当前语境选择。状态分享不等于求建议，用户后来求助时正面回应；不在每条回复后加问题，不为了凑进度在回复末尾硬接一个问题，已有的信息不要用确认式问句再问一遍。给过但行不通的方法不再换名字重提，不预设习惯、病因或心理动机。
problem=事情，feeling=感受，belief=想法，origin=用户自己提过的相关经历，step=需要或想尝试的变化。这些是内部理解参考，不是五道待提的问题；用户已说过就使用，未知留空，不要求追溯童年。不把 AI 建议、普通闲聊或不同事件拼成用户的真实经历。
上次状态：${state.status}。上次已问过的方向：${JSON.stringify(state.asked)}；兼容旧记录的下一方向：${JSON.stringify(next)}。这些值不构成提问任务，进度无需增加。只有本轮出于真实需要问了恰好对应下一方向的问题，才填 question=字段名，quote=reply 中逐字一致且含问号的完整问句；其余 question=null、quote=""，不伪造已问数量或完成标记。
mode：日常分享、开心、玩笑、具体问题用 daily；确实继续同一困扰可用 guided，即使没问问题也保留已有进度。不能只凭“累”等词、否定句或引用认定用户低落。用户要求停止梳理或先别问时用 paused，换回轻松话题用 daily。明确开始另一件新困扰且确需重启时才 restart=true，不自动从第一题问起。
用户说不知道、说不清或不想回答时，接受空白，不连续追问或立刻换一道题，不解释成回避。用户之后主动求办法时，跟随最新需要，不用先前的说不清来否定这次求助。是否补一个必要细节，由当前实际问题决定，不由旧进度决定。
五个方向已问过不再补问，答案不齐不阻止邀请。用户始终可以手动进入情景练习，不催促、不擅自弹表、不声称用户已经改变想法。只输出上述 JSON，reply 不解释协议、内部字段或进度。`;
}
