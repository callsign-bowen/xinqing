// @ts-nocheck
import type { Feature } from '../../kernel/types'
import type { AppContext } from '../../kernel/context'
import { riskOfText } from '../chat/risk'
import {
  CATEGORY_LABELS,
  DIFFICULTY_HINTS,
  DIFFICULTY_LABELS,
  SCENARIOS,
  SUBCATEGORY_LABELS,
  scenarioById,
  type Scenario,
  type ScenarioDifficulty,
  type ScenarioCategory
} from './scenarios'
import './scenario.css'
import { loadScenarioHistory, saveScenarioHistory } from './history.mjs'
import {
  cleanCounterpartReply,
  canApplyAssist,
  hasUnsafeContent,
  counterpartPrompt,
  counterpartMessages, openingMessages, helpMessages, cleanHelpReply,
  debriefPromptV2,
  openingFor,
  parseDebriefV2,
  promptTooLong
} from './dialogue'
import { generateAssist, AssistGenerationError, assistFailureMessage } from './assist'
import { visualFor, latestCounterpartLine, createCharacterStage, createTranscriptViewer } from './presentation'
import { savePractice, listPractices, loadPractice, finishPractice } from './practice-session.mjs'
import { createDictation, type RecognitionConstructor } from '../chat/dictation'

type Stage = 'lobby' | 'setup' | 'roleplay' | 'transition' | 'debrief' | 'safety' | 'history'

interface RoleMessage {
  role: 'user' | 'assistant'
  text: string
}

interface Debrief {
  closest: string
  takeaway: string
  nextTry: string
}

interface SavedScenario {
  id: string
  scenarioId: string
  title: string
  difficulty: ScenarioDifficulty
  date: number
  messages: RoleMessage[]
  debrief: Debrief
}

const HISTORY_KEY_V1 = 'nuo_scenario_history_v1'
const LEGACY_NOTE = '旧模式记录仍保留在本机，不参与新版对话；本阶段暂不提供旧记录回放。'

function makeId(): string {
  try { return crypto.randomUUID() } catch { return `scenario-${Date.now()}-${Math.random().toString(16).slice(2)}` }
}

function loadHistory(): SavedScenario[] {
  try { return loadScenarioHistory(localStorage) } catch { return [] }
}
function saveHistory(list: SavedScenario[]): boolean {
  try { return saveScenarioHistory(localStorage, list) } catch { return false }
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

function showToast(message: string): void {
  const toast = document.getElementById('toast')
  if (!toast) return
  toast.textContent = message
  toast.classList.add('show')
  window.clearTimeout((showToast as any).timer)
  ;(showToast as any).timer = window.setTimeout(() => toast.classList.remove('show'), 2200)
}

// 历史 MVP 提示/解析仅保留参考；方案 B 的运行入口不调用下列旧函数。
function standInPrompt(scenario: Scenario, difficulty: ScenarioDifficulty, goal: string): string {
  return `你是用户的练习替身。用户正在扮演他生活中那个让他难受的人，用对方的口气说话。
用户扮演：${scenario.counterpartRole}
场景：${scenario.context}
用户想练的目标：${goal}
这一轮对方的风格：${scenario.styles[difficulty]}
难度：${DIFFICULTY_LABELS[difficulty]}

你的任务：
- 用第一人称“我”，替用户回应这个“对方”。
- 先接住对方一句，再说清自己的立场、边界或请求。
- 每次给一个版本，1–3 句，口语，短，不列清单。
- 不攻击、不讨好、不解释过度，不替用户答应事情。
- 只用场景里已经给出的事实，不编造用户的经历、关系细节或现实生活。
- 不辱骂、不威胁、不描述暴力或自伤。
- 如果对方辱骂、威胁或反复施压，不跟着吵，可以说“这句话我不接”，然后把话拉回目标。
- 不跳出替身身份，不分析用户，不给建议。

【圆滑的说法】
圆滑不是油滑。目标是：给对方留面子，把自己的意思说到，不撕破脸。
按这个顺序说：
1. 先接住对方的难处或身份：“我知道您现在也难”“我知道公司整体都在控成本”。
2. 说自己的具体事实，不评价对方：“我这边今年从 2 个项目做到 5 个”。
3. 提一个低负担、可拒绝的请求：“能不能给我十分钟”。
4. 留退路：“您听完再定”“不方便的话我们再找时间”。

不要说：
- “摆到桌面上谈”“不是等忙完再说”这种硬碰硬。
- “你必须”“你总是”“别人都”“不公平”。
- 一次塞三个诉求。
- 阴阳、威胁、讨好、卖惨。

示例：
对方：公司现在什么情况你不知道吗？先把手头的事做好。
替你说：我知道现在公司整体都在控成本，这时候提这个可能不太合适。只是我这边今年从 2 个项目做到 5 个，想跟您对齐一下后面的安排。您看能不能给我十分钟，我把情况过一遍，调不调您听完再定。`
}

function debriefPrompt(scenario: Scenario, difficulty: ScenarioDifficulty, goal: string, messages: RoleMessage[]): string {
  const transcript = messages.map((item) => `${item.role === 'user' ? `用户演的${scenario.counterpartRole}` : 'AI替用户说'}：${item.text}`).join('\n')
  return `你是诺，已经跳出替身，现在是复盘者。
刚才用户扮演：${scenario.counterpartRole}
用户想练的目标：${goal}
难度：${DIFFICULTY_LABELS[difficulty]}
对话：
${transcript}

请只输出三行，不要编号，不要解释，不要代码块：
CLOSEST：AI 替用户说的那句里，最像用户、最可能说得出口的一句
TAKEAWAY：最值得用户带走的一句，不能和 CLOSEST 重复，要更短、能直接说出口
NEXT：下次可以试的另一个版本

要求：
- 每行只写一句话，不要分析。
- CLOSEST 和 TAKEAWAY 各不超过 40 字。
- NEXT 只给一个版本，不超过 60 字。
- 不评分、不判对错、不诊断、不分析童年。
- 用第二人称对用户说“你”，不要写“用户”。
- 如果对话里出现自伤、他伤、暴力信号，不要复盘，输出 SAFETY: CHECK。`
}

function parseDebrief(raw: string, messages: RoleMessage[]): Debrief {
  const text = String(raw || '').trim()
  if (/SAFETY\s*[:：]\s*CHECK/i.test(text)) {
    return {
      closest: '这次先不复盘。',
      takeaway: lastStandInLine(messages),
      nextTry: '先确认安全，再决定要不要继续。'
    }
  }
  const line = (label: string) => {
    const match = text.match(new RegExp(`${label}\\s*[:：]\\s*(.+)`))
    return match ? match[1].trim().replace(/^["“]|["”]$/g, '') : ''
  }
  const lineClosest = line('CLOSEST') || line('最像你的一句')
  const lineTakeaway = line('TAKEAWAY') || line('可以带走的一句')
  const lineNext = line('NEXT') || line('下次可以试')
  if (lineClosest || lineTakeaway || lineNext) {
    return {
      closest: lineClosest || lastStandInLine(messages) || '（这次还没有替你说出一句完整的话）',
      takeaway: lineTakeaway || lineClosest || lastStandInLine(messages) || '（这次还没有一句可以带走的）',
      nextTry: lineNext || '下次先把结论说短一点。'
    }
  }
  const match = text.match(/\{[\s\S]*\}/)
  if (match) {
    try {
      const data = JSON.parse(match[0])
      if (data.safety === 'check') {
        return {
          closest: '这次先不复盘。',
          takeaway: lastStandInLine(messages),
          nextTry: '先确认安全，再决定要不要继续。'
        }
      }
      if (data.closest || data.takeaway || data.nextTry || data.strongestLine) {
        return {
          closest: String(data.closest || data.strongestLine || lastStandInLine(messages) || '（这次还没有替你说出一句完整的话）'),
          takeaway: String(data.takeaway || data.strongestLine || lastStandInLine(messages) || '（这次还没有一句可以带走的）'),
          nextTry: String(data.nextTry || '下次先把结论说短一点。')
        }
      }
    } catch { /* 按纯文本兜底 */ }
  }
  return {
    closest: lastStandInLine(messages) || '（这次还没有替你说出一句完整的话）',
    takeaway: lastStandInLine(messages) || '（这次还没有一句可以带走的）',
    nextTry: '下次先把结论说短一点。'
  }
}

function lastStandInLine(messages: RoleMessage[]): string {
  const item = [...messages].reverse().find((message) => message.role === 'assistant')
  return item?.text || ''
}

function formatDate(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(timestamp))
  } catch { return '' }
}

export const scenarioFeature: Feature = {
  id: 'scenario',
  init(ctx: AppContext) {
    if (document.getElementById('page-scenario')) return

    let stage: Stage = 'lobby'
    let activeScenario: Scenario | null = null
    let difficulty: ScenarioDifficulty = 'realistic'
    let goal = ''
    let duration = 5
    let messages: RoleMessage[] = []
    let debrief: Debrief | null = null
    let busy = false
    let draft = ''
    // Only user input events write this intent; generated suggestions never become authority.
    let authoredDraft = ''
    let timerId = 0
    let remaining = 0
    let activeCategory: 'all' | ScenarioCategory = 'all'
    let activeSubcategory = ''
    let lastDebriefRaw = ''
    let sessionEpoch = 0
    let errorText = ''
    let assistPending = false
    let assistRequestId = 0
    let assistController: AbortController | null = null
    let lastSuggestion = ''
    let draftRevision = 0
    let saved = false
    let dialogueController: AbortController | null = null
    let debriefController: AbortController | null = null
    let debriefNote = ''
    let outputSafety = false
    let confirmAction: 'restart' | 'close' | null = null
    let lastPresentedReply: RoleMessage | undefined
    let activePracticeId = ''
    let openingPending = false
    let failedTurn: RoleMessage | null = null
    let menuOpen = false
    let hintPending = false
    let hintText = ''
    let hintError = ''
    let hintRequestId = 0
    let hintController: AbortController | null = null
    let historyView: SavedScenario | null = null
    let storageWarning = false
    let voiceStatus = ''

    const page = node('section', 'scenario-page')
    page.id = 'page-scenario'
    page.setAttribute('aria-label', '情景聊天')
    page.innerHTML = `
      <div class="scenario-shell">
        <header class="scenario-header">
          <button class="scenario-icon-btn" id="scenario-back" type="button" aria-label="返回">←</button>
          <div class="scenario-heading">
            <h1>情景聊天</h1>
            <p id="scenario-subtitle">先练一遍，再去说。</p>
          </div>
          <button class="scenario-icon-btn" id="scenario-close" type="button" aria-label="关闭">×</button>
        </header>
        <main class="scenario-body" id="scenario-body"></main>
      </div>`
    document.body.appendChild(page)

    const body = page.querySelector('#scenario-body') as HTMLElement
    const subtitle = page.querySelector('#scenario-subtitle') as HTMLElement
    const back = page.querySelector('#scenario-back') as HTMLButtonElement
    const close = page.querySelector('#scenario-close') as HTMLButtonElement
    const speechWindow=window as typeof window & {SpeechRecognition?:RecognitionConstructor;webkitSpeechRecognition?:RecognitionConstructor}
    const sceneDictation=createDictation(speechWindow.SpeechRecognition||speechWindow.webkitSpeechRecognition,{
      read:()=>{const input=body.querySelector('textarea') as HTMLTextAreaElement|null;return {text:draft,start:input?.selectionStart??draft.length,end:input?.selectionEnd??draft.length}},
      write(text){
        if(stage!=='roleplay') return
        draft=text.slice(0,2000);authoredDraft=draft;draftRevision+=1
        const input=body.querySelector('textarea') as HTMLTextAreaElement|null
        if(input) input.value=draft
        persistPractice()
      },
      state(active,message){
        voiceStatus=message
        const status=body.querySelector('#scenario-voice-status') as HTMLElement|null
        if(status) {status.textContent=message;status.hidden=!message}
        const button=body.querySelector('#scenario-voice')
        if(button) {button.textContent=active?'停止语音输入':'语音输入';button.setAttribute('aria-pressed',String(active))}
      }
    })

    function open(): void {
      page.classList.add('scenario-visible')
      invalidateRequests()
      stage = 'lobby'
      activeScenario = null
      messages = []
      debrief = null
      draft = ''
      authoredDraft = ''
      errorText = ''
      saved = false
      stopTimer()
      render()
    }

    function closePage(force = false): void {
      if (stage === 'roleplay' && !force) { confirmAction = 'close'; renderRoleplay(); return }
      confirmAction = null
      invalidateRequests()
      stopTimer()
      page.classList.remove('scenario-visible')
      page.classList.remove('scenario-prototype')
      stage = 'lobby'
    }

    function invalidateRequests(): void {
      if(sceneDictation.active()) sceneDictation.cancel()
      sessionEpoch += 1
      cancelAssist()
      cancelHelp()
      dialogueController?.abort()
      debriefController?.abort()
      dialogueController = null
      debriefController = null
      busy = false
      openingPending = false
    }

    function cancelAssist(): void {
      assistRequestId += 1
      assistPending = false
      assistController?.abort()
      assistController = null
    }

    function cancelHelp(): void {
      hintRequestId += 1
      hintPending = false
      hintController?.abort()
      hintController = null
    }

    function persistPractice(): void {
      if (!activeScenario || stage !== 'roleplay' || !activePracticeId) return
      const wasWarning=storageWarning
      storageWarning = !savePractice(localStorage, {id:activePracticeId,scenarioId:activeScenario.id,difficulty,goal,
        remaining,messages,draft,authoredDraft,lastSuggestion,awaitingReply:busy||!!failedTurn,date:Date.now()})
      if(storageWarning && !wasWarning) showToast('本机暂存失败，当前内容仍在，请不要刷新。')
    }

    function resumePractice(id: string): void {
      const snapshot=loadPractice(localStorage,SCENARIOS.map(item=>item.id),id)
      if(!snapshot) { showToast('这段暂存记录无法读取。');return }
      beginSession()
      activePracticeId=snapshot.id
      activeScenario=scenarioById(snapshot.scenarioId)!
      difficulty=snapshot.difficulty
      goal=snapshot.goal
      messages=snapshot.messages
      draft=snapshot.draft
      authoredDraft=snapshot.authoredDraft
      lastSuggestion=snapshot.lastSuggestion
      stage='roleplay'
      if(messages.at(-1)?.role==='user' && riskOfText(messages.at(-1)!.text)==='high') { showSafety();return }
      if(messages.at(-1)?.role==='user') {
        failedTurn=messages.at(-1)!
        if(!draft) draft=failedTurn.text
        errorText='上次对方回复未完成，实发内容已保留，可重试回应。'
      }
      if(!messages.length) void requestOpening()
      else { render();startTimer(snapshot.remaining/60) }
    }

    function beginSession(): void {
      invalidateRequests()
      debriefNote = ''
      confirmAction = null
      outputSafety = false
      errorText = ''
      lastSuggestion = ''
      draft = ''
      authoredDraft = ''
      draftRevision = 0
      saved = false
      lastPresentedReply = undefined
      activePracticeId = makeId()
      failedTurn = null
      menuOpen = false
      hintText = ''
      hintError = ''
      storageWarning = false
    }

    function openSetup(scenario: Scenario): void {
      beginSession()
      activeScenario = scenario
      difficulty = 'realistic'
      goal = scenario.goal
      duration = 5
      messages = []
      debrief = null
      stage = 'setup'
      render()
    }

    function startRoleplay(): void {
      if (!activeScenario) return
      goal = String(goal || '').trim() || activeScenario.goal
      if (goal.length > 500) { showToast('目标请控制在 500 字以内'); return }
      beginSession()
      messages = []
      debrief = null
      lastDebriefRaw = ''
      stage = 'roleplay'
      void requestOpening()
    }

    function restartRoleplay(): void {
      if (!activeScenario) return
      beginSession()
      messages = []
      debrief = null
      lastDebriefRaw = ''
      stage = 'roleplay'
      void requestOpening()
    }

    async function requestOpening(): Promise<void> {
      if(!activeScenario || stage!=='roleplay' || busy) return
      const epoch=sessionEpoch
      const scenario=activeScenario
      const controller=new AbortController()
      dialogueController=controller
      busy=true;openingPending=true;errorText=''
      stopTimer();render();persistPractice()
      try {
        const request=openingMessages(scenario,difficulty,goal)
        if(request.some(item=>promptTooLong(item.content))) throw new Error('prompt-too-long')
        const raw=await ctx.api.ai.complete(request,{temperature:0.85,maxTokens:320,contextMode:'scenario-full',signal:controller.signal})
        if(epoch!==sessionEpoch || stage!=='roleplay' || controller.signal.aborted) return
        const clean=cleanCounterpartReply(raw)
        if(hasUnsafeContent(raw)||/心理援助热线|12356/.test(raw)) { showSafety(true);return }
        if(!clean) throw new Error('invalid-opening')
        messages=[{role:'assistant',text:clean}]
        startTimer(duration)
      } catch (error) {
        if(epoch===sessionEpoch && stage==='roleplay') errorText=error?.message?.includes('V4')?error.message:'开场暂时没有生成成功。草稿保留，请重试开场。'
      } finally {
        if(epoch===sessionEpoch && stage==='roleplay') { busy=false;openingPending=false;dialogueController=null;persistPractice();render() }
      }
    }

    function stopTimer(): void {
      if (timerId) window.clearInterval(timerId)
      timerId = 0
    }

    function startTimer(minutes: number): void {
      stopTimer()
      remaining = Math.max(0, Math.floor(minutes * 60))
      updateTimer()
      timerId = window.setInterval(() => {
        remaining = Math.max(0, remaining - 1)
        updateTimer()
        if (remaining === 0) {
          stopTimer()
          showToast('时间到了。想结束就点“结束演练”，想继续也可以。')
        }
      }, 1000)
    }

    function updateTimer(): void {
      const label = page.querySelector('#scenario-timer')
      if (!label) return
      const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
      const ss = String(remaining % 60).padStart(2, '0')
      label.textContent = `${mm}:${ss}`
    }

    function render(): void {
      page.classList.toggle('scenario-prototype', stage === 'roleplay')
      page.querySelector('.scenario-heading h1').textContent = stage === 'roleplay' && activeScenario ? activeScenario.title : '情景聊天'
      body.replaceChildren()
      if (stage === 'lobby') renderLobby()
      else if (stage === 'setup') renderSetup()
      else if (stage === 'roleplay') renderRoleplay()
      else if (stage === 'transition') renderTransition()
      else if (stage === 'debrief') renderDebrief()
      else if (stage === 'safety') renderSafety()
      else if (stage === 'history') renderSavedHistory()
    }

    function renderLobby(): void {
      subtitle.textContent = '先练一遍，再去说。'
      const intro = node('p', 'scenario-intro', '选一个真实要面对的场景。你演你自己，AI 扮演对方，先练一遍再去说。')
      body.appendChild(intro)

      const unfinished=listPractices(localStorage,SCENARIOS.map(item=>item.id))
      if(unfinished.length) {
        const block=node('details','scenario-unfinished')
        block.appendChild(node('summary','',`未完成演练（${unfinished.length}）`))
        for(const item of unfinished) {
          const resume=node('button','scenario-recent-item',`继续：${scenarioById(item.scenarioId)?.title} · 已发送 ${item.messages.filter(turn=>turn.role==='user').length} 句`)
          resume.type='button';resume.addEventListener('click',()=>resumePractice(item.id));block.appendChild(resume)
        }
        body.appendChild(block)
      }

      if (activeCategory !== 'all') {
        const tools = node('div', 'scenario-lobby-tools')
        const reset = node('button', 'scenario-all-link', '全部情境')
        reset.type = 'button'
        reset.addEventListener('click', () => {
          activeCategory = 'all'
          activeSubcategory = ''
          render()
        })
        tools.appendChild(reset)
        body.appendChild(tools)
      }

      const chips = node('div', 'scenario-chips')
      for (const [key, label] of Object.entries(CATEGORY_LABELS)) {
        const chip = node('button', 'scenario-chip', label)
        chip.type = 'button'
        chip.dataset.category = key
        if (activeCategory === key) chip.classList.add('is-active')
        chip.addEventListener('click', () => {
          activeCategory = key as ScenarioCategory
          activeSubcategory = ''
          render()
        })
        chips.appendChild(chip)
      }
      body.appendChild(chips)

      if (activeCategory !== 'all' && !activeSubcategory) {
        const subs = SUBCATEGORY_LABELS[activeCategory] || []
        const grid = node('div', 'scenario-subgrid')
        for (const sub of subs) {
          const count = SCENARIOS.filter((item) => item.category === activeCategory && item.subcategory === sub).length
          const card = node('button', 'scenario-subcard')
          card.type = 'button'
          card.disabled = count === 0
          card.appendChild(node('span', 'scenario-subcard-title', sub))
          card.appendChild(node('span', 'scenario-subcard-status', count ? `${count} 个情境` : '语料收集中'))
          if (count > 0) {
            card.addEventListener('click', () => {
              activeSubcategory = sub
              render()
            })
          }
          grid.appendChild(card)
        }
        body.appendChild(grid)
      } else {
        if (activeCategory !== 'all' && activeSubcategory) {
          const head = node('div', 'scenario-subhead')
          const back = node('button', 'scenario-back-link', `← ${CATEGORY_LABELS[activeCategory]}`)
          back.type = 'button'
          back.addEventListener('click', () => { activeSubcategory = ''; render() })
          head.appendChild(back)
          head.appendChild(node('span', 'scenario-subhead-title', `${CATEGORY_LABELS[activeCategory]} · ${activeSubcategory}`))
          body.appendChild(head)
        }

        const filtered = SCENARIOS.filter((item) => {
          if (activeCategory !== 'all' && item.category !== activeCategory) return false
          if (activeSubcategory && item.subcategory !== activeSubcategory) return false
          return true
        })

        if (!filtered.length) {
          const empty = node('div', 'scenario-empty-category')
          empty.appendChild(node('p', 'scenario-empty-title', '这一类正在收集语料。'))
          empty.appendChild(node('p', 'scenario-empty-line', '先看别的情境，等下一批语料进来。'))
          const back = node('button', 'scenario-secondary', activeCategory === 'all' ? '看全部情境' : '返回子类')
          back.type = 'button'
          back.addEventListener('click', () => {
            if (activeCategory === 'all') {
              activeCategory = 'all'
              activeSubcategory = ''
            } else {
              activeSubcategory = ''
            }
            render()
          })
          empty.appendChild(back)
          body.appendChild(empty)
        } else {
          const list = node('div', 'scenario-list')
          for (const scenario of filtered) {
            const card = node('article', 'scenario-card')
            const top = node('div', 'scenario-card-top')
            top.appendChild(node('span', 'scenario-tag', `${CATEGORY_LABELS[scenario.category]} · ${scenario.subcategory}`))
            top.appendChild(node('span', 'scenario-card-duration', '5 分钟'))
            card.appendChild(top)
            card.appendChild(node('h2', 'scenario-card-title', scenario.title))
            card.appendChild(node('p', 'scenario-card-line', scenario.oneLine))
            const start = node('button', 'scenario-primary', '开始练习')
            start.type = 'button'
            start.addEventListener('click', () => openSetup(scenario))
            card.appendChild(start)
            list.appendChild(card)
          }
          body.appendChild(list)
        }
      }

      const history = loadHistory()
      if (history.length) {
        body.appendChild(node('h2', 'scenario-section-title', '最近练过（新模式）'))
        const recent = node('div', 'scenario-recent')
        for (const item of history) {
          const row = node('div', 'scenario-recent-item')
          row.innerHTML = `<span><strong>${escapeText(item.title)}</strong><small>${formatDate(item.date)} · ${DIFFICULTY_LABELS[item.difficulty] || '真实'}</small></span>`
          const view=node('button','scenario-mini','查看记录')
          view.type='button';view.addEventListener('click',()=>{historyView=item;stage='history';render()})
          const again=node('button','scenario-mini','再练一次')
          again.type='button';again.addEventListener('click', () => {
            const scenario = scenarioById(item.scenarioId)
            if (scenario) openSetup(scenario)
          })
          row.append(view,again);recent.appendChild(row)
        }
        body.appendChild(recent)
      }
      let hasLegacy = false
      try { hasLegacy = Boolean(localStorage.getItem(HISTORY_KEY_V1)) } catch { hasLegacy = false }
      if (hasLegacy) body.appendChild(node('p', 'scenario-note', LEGACY_NOTE))
    }

    function renderSetup(): void {
      if (!activeScenario) { stage = 'lobby'; render(); return }
      subtitle.textContent = '把场景调成更像你的那一版。'
      const scenario = activeScenario

      const card = node('div', 'scenario-setup-card')
      card.appendChild(node('span', 'scenario-tag', `${CATEGORY_LABELS[scenario.category]} · ${scenario.subcategory}`))
      card.appendChild(node('h2', 'scenario-setup-title', scenario.title))
      card.appendChild(node('p', 'scenario-context', scenario.context))
      body.appendChild(card)

      const switchCard = node('div', 'scenario-role-switch')
      switchCard.appendChild(node('strong', '', `你演你自己，AI 扮演${scenario.counterpartRole}`))
      switchCard.appendChild(node('p', '', '用你自己的话回应对方。说错了可以重来，随时可以停。'))
      body.appendChild(switchCard)

      body.appendChild(node('h3', 'scenario-field-label', '你想达到'))
      const goalInput = node('textarea', 'scenario-goal-input')
      goalInput.value = goal
      goalInput.rows = 2
      goalInput.maxLength = 500
      goalInput.placeholder = scenario.goal
      goalInput.addEventListener('input', () => { goal = goalInput.value })
      body.appendChild(goalInput)

      body.appendChild(node('h3', 'scenario-field-label', '难度'))
      const diffs = node('div', 'scenario-diff-row')
      for (const key of ['gentle', 'realistic', 'tough'] as ScenarioDifficulty[]) {
        const button = node('button', 'scenario-diff', DIFFICULTY_LABELS[key])
        button.type = 'button'
        if (difficulty === key) button.classList.add('is-active')
        button.addEventListener('click', () => { difficulty = key; render() })
        diffs.appendChild(button)
      }
      body.appendChild(diffs)
      body.appendChild(node('p', 'scenario-hint', DIFFICULTY_HINTS[difficulty]))

      body.appendChild(node('h3', 'scenario-field-label', '时长'))
      const durations = node('div', 'scenario-duration-row')
      for (const minutes of [3, 5, 10]) {
        const button = node('button', 'scenario-duration', `${minutes} 分钟`)
        button.type = 'button'
        if (duration === minutes) button.classList.add('is-active')
        button.addEventListener('click', () => { duration = minutes; render() })
        durations.appendChild(button)
      }
      body.appendChild(durations)

      const safety = node('p', 'scenario-note', '这是演练，不是现实。说错了可以重来，随时可以停。')
      body.appendChild(safety)

      const actions = node('div', 'scenario-setup-actions')
      const backButton = node('button', 'scenario-secondary', '换一个')
      backButton.type = 'button'
      backButton.addEventListener('click', () => { stage = 'lobby'; render() })
      const start = node('button', 'scenario-primary', '开始演练')
      start.type = 'button'
      start.addEventListener('click', startRoleplay)
      actions.appendChild(backButton)
      actions.appendChild(start)
      body.appendChild(actions)
    }

    function renderRoleplay(): void {
      if (!activeScenario) { stage = 'lobby'; render(); return }
      if(sceneDictation.active()) sceneDictation.cancel()
      body.replaceChildren()
      subtitle.textContent = '用你自己的话回应对方。'
      const scenario = activeScenario
      const visual = visualFor(scenario.id)
      page.classList.toggle('scenario-prototype', !!visual)
      page.querySelector('.scenario-heading h1').textContent = visual ? scenario.title : '情景聊天'
      if (visual) subtitle.textContent = `你演自己，AI 扮演${scenario.counterpartRole}。`

      const top = node('div', 'scenario-role-header')
      const role = node('div', 'scenario-role-name')
      role.innerHTML = `<span class="scenario-live-dot"></span><span>对方：${escapeText(scenario.counterpartRole)}（AI 扮演） · 你：你自己</span>`
      top.appendChild(role)
      const timer = node('span', 'scenario-timer', '05:00')
      timer.id = 'scenario-timer'
      top.appendChild(timer)
      body.appendChild(top)

      if (confirmAction) {
        const confirmation = node('div', 'scenario-error')
        confirmation.appendChild(node('p', '', confirmAction === 'restart' ? '从开场重新开始？当前演练将结束。' : '结束当前演练并关闭？'))
        const confirm = node('button', 'scenario-mini', confirmAction === 'restart' ? '确认重来' : '确认关闭')
        confirm.type = 'button'
        confirm.addEventListener('click', () => { if (confirmAction === 'restart') restartRoleplay(); else closePage(true) })
        const cancel = node('button', 'scenario-mini', '继续演练')
        cancel.type = 'button'
        cancel.addEventListener('click', () => { confirmAction = null; renderRoleplay() })
        confirmation.append(confirm, cancel)
        body.appendChild(confirmation)
      }
      if (errorText) {
        const error = node('p', 'scenario-error', errorText)
        error.setAttribute('role', 'alert')
        body.appendChild(error)
        if(!busy && (!messages.length || failedTurn)) {
          const retry=node('button','scenario-mini',messages.length?'重试对方回应':'重试开场')
          retry.type='button';retry.addEventListener('click',()=>{if(messages.length) void sendRoleMessage(true);else void requestOpening()})
          body.appendChild(retry)
        }
      }

      if(hintText || hintPending || hintError) {
        const panel=node('aside','scenario-help-panel')
        panel.setAttribute('aria-label','沟通提示，不属于正式对话')
        panel.appendChild(node('strong','', '沟通提示'))
        panel.appendChild(node('p','',hintPending?'正在根据最近对话想一个方向…':hintError||hintText))
        const dismiss=node('button','scenario-mini','收起提示')
        dismiss.type='button';dismiss.addEventListener('click',()=>{cancelHelp();hintText='';hintError='';renderRoleplay()})
        panel.appendChild(dismiss);body.appendChild(panel)
      }

      if (visual) {
        const latest = latestCounterpartLine(messages)
        const shown = latest ? messages[latest.index] : undefined
        body.appendChild(createCharacterStage(visual, messages, { busy, animate: shown !== lastPresentedReply }))
        lastPresentedReply = shown
      } else {
        const list = node('div', 'scenario-messages')
        for (const message of messages) {
        const row = node('div', `scenario-msg ${message.role === 'user' ? 'is-user' : 'is-counterpart'}`)
        const wrap = node('div', 'scenario-bubble-wrap')
        const label = message.role === 'user' ? '你' : `${scenario.counterpartRole}（AI 扮演）`
        wrap.appendChild(node('span', 'scenario-bubble-label', label))
        wrap.appendChild(node('div', 'scenario-bubble', message.text))
        row.appendChild(wrap)
        list.appendChild(row)
        }
        body.appendChild(list)
        requestAnimationFrame(() => { body.scrollTop = body.scrollHeight })
      }

      const composer = visual ? node('div', 'scenario-scene-composer') : body
      if (visual) {
        const caption = node('div', 'scenario-composer-caption')
        caption.appendChild(node('span', '', '你的回应'))
        caption.appendChild(createTranscriptViewer(messages, scenario.counterpartRole))
        composer.appendChild(caption)
      }

      const inputArea = node('div', 'scenario-input-area')
      const input = node('textarea', 'scenario-input')
      input.rows = 2
      input.maxLength = 2000
      input.placeholder = '说说你会怎么回……'
      input.setAttribute('aria-label', '你的回应')
      input.value = draft
      input.disabled = false
      input.addEventListener('beforeinput',()=>{if(sceneDictation.active()) sceneDictation.cancel()})
      input.addEventListener('input', () => {
        draft = input.value
        authoredDraft = draft
        draftRevision += 1
        persistPractice()
      })
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
          event.preventDefault()
          if (!busy) void sendRoleMessage()
        }
      })
      const send = node('button', 'scenario-send', busy ? '…' : '→')
      send.setAttribute('aria-label', busy ? '对方正在回应' : '发送我的回应')
      send.type = 'button'
      send.disabled = busy
      send.addEventListener('click', () => void sendRoleMessage())
      const plus=node('button','scenario-plus','+')
      plus.type='button';plus.setAttribute('aria-label','更多情景功能');plus.setAttribute('aria-expanded',String(menuOpen))
      plus.addEventListener('click',()=>{menuOpen=!menuOpen;renderRoleplay()})
      inputArea.appendChild(plus)
      inputArea.appendChild(input)
      inputArea.appendChild(send)
      composer.appendChild(inputArea)

      const actions = node('div', 'scenario-role-actions')
      const pause = node('button', 'scenario-mini', timerId ? '暂停计时' : '继续计时')
      pause.type = 'button'
      pause.addEventListener('click', () => {
        menuOpen=false
        if (timerId) { stopTimer(); pause.textContent = '继续计时' }
        else if (remaining > 0) { startTimer(remaining / 60); pause.textContent = '暂停计时' }
        persistPractice()
      })
      const restart = node('button', 'scenario-mini', '重来')
      restart.type = 'button'
      restart.addEventListener('click', () => {
        menuOpen=false
        confirmAction = 'restart'
        renderRoleplay()
      })
      const hint = node('button', 'scenario-mini', '求助')
      hint.type = 'button'
      hint.disabled=busy||hintPending
      hint.addEventListener('click', () => void requestHelp())
      const assistLabel = assistPending ? '正在想…' : '辅助回应'
      const assist = node('button', 'scenario-mini', assistLabel)
      assist.type = 'button'
      assist.disabled = busy || assistPending
      assist.addEventListener('click', () => void requestAssistReply())
      const regenerate = node('button', 'scenario-mini', '换一句')
      regenerate.type = 'button'
      regenerate.disabled = busy || assistPending || !lastSuggestion
      regenerate.addEventListener('click', () => void requestAssistReply())
      const end = node('button', 'scenario-mini scenario-end', '结束演练')
      end.type = 'button'
      end.addEventListener('click', () => void endRoleplay())
      actions.appendChild(hint)
      actions.appendChild(assist)
      if (busy || assistPending || hintPending) {
        const cancel=node('button','scenario-mini','取消请求')
        cancel.type='button'
        cancel.addEventListener('click',()=>{
          const awaitingOpening=openingPending
          if(busy && messages.at(-1)?.role==='user') failedTurn=messages.at(-1)
          invalidateRequests()
          errorText=awaitingOpening?'开场已取消，可重试开场。':failedTurn?'回应已取消，实发内容已保留，可重试对方回应。':'请求已取消，草稿和对话已保留。'
          persistPractice();renderRoleplay()
        })
        actions.appendChild(cancel)
      }
      composer.appendChild(actions)

      if(menuOpen) {
        const menu=node('div','scenario-plus-menu')
        menu.setAttribute('role','group');menu.setAttribute('aria-label','更多情景功能菜单')
        const voice=node('button','scenario-mini','语音输入')
        voice.id='scenario-voice';voice.type='button';voice.disabled=busy;voice.setAttribute('aria-pressed','false')
        voice.addEventListener('click',()=>sceneDictation.start())
        menu.append(regenerate,pause,restart,end)
        if(speechWindow.SpeechRecognition||speechWindow.webkitSpeechRecognition) menu.appendChild(voice)
        composer.appendChild(menu)
      }

      composer.appendChild(node('p', 'scenario-note', assistPending ? '建议生成中，你仍可编辑；它不会覆盖你新写的内容。' : '辅助回应只填入草稿，点发送才会成为你的回应。'))
      const voiceNote=node('p','scenario-note',voiceStatus)
      voiceNote.id='scenario-voice-status';voiceNote.hidden=!voiceStatus;voiceNote.setAttribute('role','status')
      composer.appendChild(voiceNote)
      if (visual) body.appendChild(composer)
      if(storageWarning) composer.appendChild(node('p','scenario-error','本机暂存失败，请先保留当前页面。'))
      if (!busy && !menuOpen && !hintPending) input.focus()
      updateTimer()
    }

    async function sendRoleMessage(retry = false): Promise<void> {
      if (!activeScenario || busy || stage !== 'roleplay') return
      const text = retry && failedTurn ? failedTurn.text : draft.trim()
      if (!text) return
      if(!messages.some(turn=>turn.role==='assistant')) {errorText='请先重试生成对方开场。';renderRoleplay();return}
      if (text.length > 2000) {
        errorText = '这句话太长了，请控制在 2000 字以内。'
        renderRoleplay()
        return
      }
      let system: string
      try {
        system = counterpartPrompt(activeScenario, difficulty, goal)
        if (promptTooLong(system)) throw new Error('系统提示过长')
      } catch {
        errorText = '演练设定过长，请缩短目标后重新开始。'
        renderRoleplay()
        return
      }
      cancelAssist()
      cancelHelp()
      if(sceneDictation.active()) sceneDictation.cancel()
      hintText='';hintError='';menuOpen=false
      const epoch = sessionEpoch
      const controller = new AbortController()
      dialogueController = controller
      errorText = ''
      const submittedDraft = draft
      const submittedAuthoredDraft = authoredDraft
      const sent = failedTurn && messages.at(-1)===failedTurn && failedTurn.text===text ? failedTurn : { role: 'user', text }
      if(messages.at(-1)!==sent) messages.push(sent)
      failedTurn=null
      if (riskOfText(text) === 'high') { persistPractice();showSafety(); return }
      if (!retry || draft.trim() === text) {
        draft = ''
        authoredDraft = ''
        draftRevision += 1
        lastSuggestion = ''
      }
      const consumedRevision=draftRevision
      busy = true
      persistPractice();renderRoleplay()
      try {
        const reply = await ctx.api.ai.complete(counterpartMessages(activeScenario,difficulty,goal,messages),
          { temperature: 0.85, maxTokens: 320, contextMode:'scenario-full', signal: controller.signal })
        if (epoch !== sessionEpoch || stage !== 'roleplay' || controller.signal.aborted) return
        const clean = cleanCounterpartReply(reply)
        if (/心理援助热线|12356/.test(reply) || hasUnsafeContent(reply)) { showSafety(true); return }
        if (!clean) throw new Error('empty')
        messages.push({ role: 'assistant', text: clean })
      } catch (error) {
        if (epoch !== sessionEpoch || stage !== 'roleplay') return
        failedTurn=sent
        // Keep the actual sent line; never overwrite newer typing with an old failure.
        if(!retry && draftRevision===consumedRevision) {draft=submittedDraft;authoredDraft=submittedAuthoredDraft;draftRevision+=1}
        errorText = error?.message?.includes('容量') || error?.message?.includes('V4') ? error.message : '对方这次没接上。已发送内容保留，可重试回应；输入框中的新内容不会被覆盖。'
      } finally {
        if (epoch === sessionEpoch && stage === 'roleplay') {
          busy = false
          dialogueController = null
          persistPractice()
          renderRoleplay()
        }
      }
    }

    async function requestHelp(): Promise<void> {
      if(!activeScenario || busy || hintPending || stage!=='roleplay') return
      const epoch=sessionEpoch,requestId=++hintRequestId
      const controller=new AbortController()
      hintController=controller;hintPending=true;hintText='';hintError=''
      renderRoleplay()
      try {
        const raw=await ctx.api.ai.complete(helpMessages(activeScenario,difficulty,goal,messages),
          {temperature:0.3,maxTokens:600,signal:controller.signal})
        if(epoch!==sessionEpoch || requestId!==hintRequestId || stage!=='roleplay' || controller.signal.aborted) return
        const clean=cleanHelpReply(raw)
        if(!clean) throw new Error('invalid-help')
        hintText=clean
      } catch {
        if(epoch===sessionEpoch && requestId===hintRequestId && !controller.signal.aborted) hintError='这次提示未能生成，请稍后再试；对话和草稿未改变。'
      } finally {
        if(epoch===sessionEpoch && requestId===hintRequestId && stage==='roleplay') {
          hintPending=false;hintController=null;renderRoleplay()
        }
      }
    }

    async function requestAssistReply(): Promise<void> {
      if (!activeScenario || busy || assistPending || stage !== 'roleplay') return
      const epoch = sessionEpoch
      const requestId = ++assistRequestId
      const revision = draftRevision
      const baseDraft = draft
      const baseAuthoredDraft = authoredDraft
      const previous = lastSuggestion
      const controller = new AbortController()
      assistController = controller
      assistPending = true
      errorText = ''
      renderRoleplay()
      try {
        const clean = await generateAssist({
          complete: ctx.api.ai.complete, scenario: activeScenario, difficulty, goal,
          dialogue: messages, draft: baseDraft, authoredDraft: baseAuthoredDraft, previous, signal: controller.signal
        })
        if (epoch !== sessionEpoch || requestId !== assistRequestId || stage !== 'roleplay' || controller.signal.aborted) return
        if (!canApplyAssist({ epoch, requestId, draftRevision: revision }, { epoch: sessionEpoch, requestId: assistRequestId, draftRevision })) {
          showToast('你刚改过输入，建议没有覆盖你的新内容。')
          return
        }
        draft = clean
        lastSuggestion = clean
        draftRevision += 1
        persistPractice()
      } catch (error) {
        if (epoch === sessionEpoch && requestId === assistRequestId && !controller.signal.aborted) {
          errorText = assistFailureMessage(error instanceof AssistGenerationError ? error.reason : 'transport')
        }
      } finally {
        if (epoch === sessionEpoch && requestId === assistRequestId) {
          assistPending = false
          assistController = null
          renderRoleplay()
        }
      }
    }

    function showSafety(fromOutput = false): void {
      outputSafety = fromOutput
      invalidateRequests()
      stopTimer()
      stage = 'safety'
      render()
    }

    function renderSafety(): void {
      body.replaceChildren()
      subtitle.textContent = '先停一下，确认安全。'
      const card = node('div', 'scenario-safety-card')
      card.appendChild(node('h2', 'scenario-safety-title', '我们先不练了'))
      if (outputSafety) {
        card.appendChild(node('p', 'scenario-safety-text', '模型回复未通过角色或安全检查，没有展示为台词，也没有记入对话。'))
        const stop = node('button', 'scenario-primary', '结束演练')
        stop.type = 'button'
        stop.addEventListener('click', () => { stage = 'lobby'; render() })
        card.appendChild(stop)
        body.appendChild(card)
        return
      }
      card.appendChild(node('p', 'scenario-safety-text', '你刚才说的话，我需要认真接。先确认一件事：你现在安全吗？身边有没有人能马上过来陪你？'))
      card.appendChild(node('p', 'scenario-safety-text', '如果一个人，先拨打心理援助热线 12356；如果当下有人身危险，先打 110 或 120。'))
      const actions = node('div', 'scenario-safety-actions')
      const hotline = node('a', 'scenario-primary', '拨打 12356')
      hotline.href = 'tel:12356'
      const stop = node('button', 'scenario-secondary', '结束演练')
      stop.type = 'button'
      stop.addEventListener('click', () => { stage = 'lobby'; render() })
      actions.appendChild(hotline)
      actions.appendChild(stop)
      card.appendChild(actions)
      body.appendChild(card)
    }

    async function endRoleplay(): Promise<void> {
      if (!activeScenario || stage !== 'roleplay') return
      const scenario = activeScenario
      const userTexts = messages.filter(message => message.role === 'user').map(message => message.text)
      invalidateRequests()
      stopTimer()
      if (!userTexts.length) { stage = 'lobby'; render(); return }
      const epoch = sessionEpoch
      const controller = new AbortController()
      debriefController = controller
      const snapshot = messages.map(message => ({ ...message }))
      let candidates = userTexts
      debriefNote = ''
      stage = 'transition'
      render()
      try {
        const built = debriefPromptV2(scenario, goal, userTexts)
        candidates = built.userTexts
        if (promptTooLong(built.system, built.user)) throw new Error('prompt-too-long')
        const raw = await ctx.api.ai.complete([
          { role: 'system', content: built.system }, { role: 'user', content: built.user }
        ], { temperature: 0.5, maxTokens: 500, signal: controller.signal })
        if (epoch !== sessionEpoch || controller.signal.aborted) return
        debrief = parseDebriefV2(raw, candidates)
        if (candidates.length < userTexts.length) debriefNote = '本次选句基于近期发送片段。'
      } catch {
        if (epoch !== sessionEpoch) return
        debrief = parseDebriefV2('', candidates)
        debriefNote = '模型复盘暂时不可用；以下引用从你的实际发送记录中选取。'
      }
      if (epoch !== sessionEpoch) return
      debriefController = null
      messages = snapshot
      saved = saveCurrent()
      if(saved) finishPractice(localStorage,activePracticeId)
      stage = 'debrief'
      render()
    }

    function renderTransition(): void {
      subtitle.textContent = '演练结束。'
      const card = node('div', 'scenario-transition-card')
      card.appendChild(node('p', 'scenario-transition-line', '演练结束。'))
      card.appendChild(node('p', 'scenario-transition-line', '我先从角色里出来。'))
      card.appendChild(node('p', 'scenario-transition-line strong', `现在我不是${activeScenario?.counterpartRole || '对方'}，是诺。`))
      body.appendChild(card)
    }

    function renderDebrief(): void {
      subtitle.textContent = '现在不是演练，是复盘。'
      if (!activeScenario || !debrief) { stage = 'lobby'; render(); return }
      const card = node('div', 'scenario-debrief')
      card.appendChild(node('p', 'scenario-debrief-kicker', '演练结束'))
      card.appendChild(node('h2', 'scenario-debrief-title', '先看这三件事'))
      if (debriefNote) card.appendChild(node('p', 'scenario-note', debriefNote))

      const blocks: Array<[string, string]> = [
        ['你实际说过的一句', `“${debrief.closest}”`],
        ['另一句可带走的原话', debrief.takeaway ? `“${debrief.takeaway}”` : '这次没有另一句可引用的回应。'],
        ['下次可试的表达（建议，未发送）', debrief.nextTry]
      ]
      for (const [title, text] of blocks) {
        const block = node('div', 'scenario-debrief-block')
        block.appendChild(node('h3', 'scenario-debrief-label', title))
        block.appendChild(node('p', 'scenario-debrief-text', text))
        card.appendChild(block)
      }

      const actions = node('div', 'scenario-debrief-actions')
      const again = node('button', 'scenario-primary', '再练一次')
      again.type = 'button'
      again.addEventListener('click', restartRoleplay)
      const change = node('button', 'scenario-secondary', '换个说法')
      change.type = 'button'
      change.addEventListener('click', () => { stage = 'setup'; render() })
      const done = node('button', 'scenario-secondary', '结束')
      done.type = 'button'
      done.addEventListener('click', () => { stage = 'lobby'; render() })
      actions.appendChild(again)
      actions.appendChild(change)
      actions.appendChild(done)
      card.appendChild(actions)
      card.appendChild(node('p', 'scenario-note', saved ? '这次已保存到本机的新模式记录。' : '本机存储不可用，这次没有保存成功。'))
      body.appendChild(card)
    }

    function renderSavedHistory(): void {
      const record=historyView
      if(!record) {stage='lobby';render();return}
      subtitle.textContent='已完成演练 · 只读记录'
      body.appendChild(node('h2','scenario-section-title',record.title))
      const transcript=createTranscriptViewer(record.messages,scenarioById(record.scenarioId)?.counterpartRole||'对方')
      transcript.classList.add('is-saved-view')
      transcript.open=true
      body.appendChild(transcript)
      const userTexts=record.messages.filter(turn=>turn.role==='user').map(turn=>turn.text)
      for(const [title,quote] of [['用户原话',record.debrief.closest],['另一句原话',record.debrief.takeaway]]) {
        body.appendChild(node('h3','scenario-debrief-label',title))
        body.appendChild(node('p','scenario-debrief-text',userTexts.includes(quote)?quote:'没有可核对的实发引用。'))
      }
      body.appendChild(node('h3','scenario-debrief-label','下次表达建议（未发送）'))
      body.appendChild(node('p','scenario-debrief-text',record.debrief.nextTry))
      const done=node('button','scenario-secondary','返回情景列表')
      done.type='button';done.addEventListener('click',()=>{stage='lobby';render()})
      body.appendChild(done)
    }

    function saveCurrent(): boolean {
      if (!activeScenario || !debrief) return false
      const item: SavedScenario = {
        id: activePracticeId || makeId(),
        scenarioId: activeScenario.id,
        title: activeScenario.title,
        difficulty,
        date: Date.now(),
        messages: [...messages],
        debrief
      }
      const list = loadHistory().filter(record=>record.id!==item.id)
      list.unshift(item)
      return saveHistory(list)
    }

    function escapeText(text: string): string {
      return String(text || '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      } as Record<string, string>)[char] || char)
    }

    back.addEventListener('click', () => {
      if (stage === 'lobby') closePage()
      else if (stage === 'roleplay') closePage()
      else if (stage === 'setup') { stage = 'lobby'; render() }
      else { invalidateRequests(); stage = 'lobby'; render() }
    })
    close.addEventListener('click', () => closePage())
    window.addEventListener('pagehide',persistPractice)

    const entry = node('button', 'scenario-entry', '情景')
    entry.type = 'button'
    entry.setAttribute('aria-label', '打开情景聊天')
    entry.addEventListener('click', open)
    const headerActions = document.querySelector('.ai-header-actions')
    if (headerActions) headerActions.insertBefore(entry, headerActions.firstChild)
  }
}
