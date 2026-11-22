// @ts-nocheck
/** 功能构件：chatSessions。只通过 ctx 与外界通信，不 import 其它 features。 */
import type { AppContext } from '../../kernel/context'
import { bindRecordActions } from '../../ui/recordActions'
import { withoutChatSession } from './sessionRemoval.mjs'
import { riskOfText } from './risk.ts'
import { greetingFor } from './greeting.ts'
import { buildHistory } from './history.ts'

export const chatSessionsFeature = {
  id: 'chatSessions',
  init(ctx: AppContext) {
        (function initCrisisAIEnhancement() {
          const aiPage = document.getElementById("page-ai");
          const messages = aiPage?.querySelector("#ai-messages");
          const input = aiPage?.querySelector("#ai-input");
          const sendButton = aiPage?.querySelector("#ai-send");
          const crisisPanel = aiPage?.querySelector(".crisis-panel");
          if (!aiPage || !messages || !input || !sendButton || !crisisPanel) return;

          // 单页版本不带陪伴者切换，统一用这只线条小猫做头像。
          const FALLBACK_FACE = '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 16 L6 6 L16 12"/><path d="M30 16 L34 6 L24 12"/><ellipse cx="20" cy="22" rx="13" ry="11" transform="rotate(-6 20 22)"/><path d="M13 20 Q15 18 17 20"/><path d="M23 20 Q25 18 27 20"/><path d="M19 24 L21 24 L20 25.5 Z" fill="currentColor" stroke="none"/></svg>';

          const style = document.createElement("style");
          style.textContent = `
            .crisis-ai-indicator { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 5px; margin-left: 8px; padding: 3px 8px; color: var(--text); background: color-mix(in srgb, #3EAF6A 18%, transparent); border-radius: 999px; font-size: 12px; line-height: 1; transition: background-color .35s ease; }
            .crisis-ai-indicator-dot { width: 8px; height: 8px; flex: 0 0 8px; border-radius: 50%; background: #3EAF6A; box-shadow: 0 0 0 3px #3EAF6A55; transition: background-color .35s ease, box-shadow .35s ease; }
            .crisis-ai-indicator-label { transition: color .35s ease; }
            .crisis-ai-risk-banner { display: none; margin: 8px 0 10px; padding: 12px 16px; color: var(--text); background: rgba(200, 80, 80, .08); border-radius: 12px; font-size: 14px; line-height: 1.6; cursor: pointer; }
            .crisis-ai-risk-banner.crisis-ai-visible { display: block; }
            .crisis-ai-panel-medium { display: block !important; }
            .crisis-ai-panel-medium .crisis-option:not([data-crisis-action="hotline"]):not([data-crisis-action="grounding"]) { opacity: .5; }
            .crisis-ai-panel-high { display: block !important; border-color: color-mix(in srgb, var(--primary) 45%, transparent); }
            .crisis-ai-immediate { display: block; width: 100%; margin-top: 12px; padding: 11px 16px; color: #fff; background: #bd7777; border: 0; border-radius: 12px; font-size: 14px; }
            .crisis-ai-soothe-pill { display: inline-flex; align-items: center; gap: 6px; margin-top: 8px; padding: 5px 14px; color: var(--text); background: transparent; border: 1px solid color-mix(in srgb, var(--text) 20%, transparent); border-radius: 40px; font-size: 12px; cursor: pointer; transition: border-color .2s ease; }
            .crisis-ai-soothe-pill:hover { border-color: var(--primary); }
            .crisis-ai-soothe-pill.crisis-ai-soothe-urgent { border-color: color-mix(in srgb, var(--primary) 55%, transparent); }
            .crisis-ai-safety-plan { position: fixed; inset: 0; z-index: 110; display: none; align-items: center; justify-content: center; padding: 20px; background: rgba(0, 0, 0, .4); }
            .crisis-ai-safety-plan.crisis-ai-visible { display: flex; }
            .crisis-ai-safety-card { width: 100%; max-width: 400px; max-height: 85vh; padding: 20px; overflow-y: auto; color: var(--text); background: var(--bg); border-radius: 24px; }
            .crisis-ai-safety-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
            .crisis-ai-safety-title { margin: 0; font-size: 18px; font-weight: 500; }
            .crisis-ai-safety-close { padding: 4px; color: var(--text); background: transparent; border: 0; font-size: 22px; opacity: .55; }
            .crisis-ai-safety-subtitle { margin: 8px 0 16px; color: var(--text); font-size: 13px; line-height: 1.6; opacity: .65; }
            .crisis-ai-safety-field { display: block; width: 100%; margin-top: 12px; padding: 10px 12px; resize: vertical; color: var(--text); background: var(--bg-card); border: 1px solid var(--line); border-radius: 12px; outline: 0; font-size: 13px; line-height: 1.5; }
            .crisis-ai-safety-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
            .crisis-ai-safety-button { padding: 9px 14px; color: var(--text); background: transparent; border: 1px solid var(--line); border-radius: 10px; font-size: 13px; }
            .crisis-ai-safety-save { color: var(--bg); background: var(--primary); border-color: var(--primary); }
            .ai-send-error { margin: 0 0 12px 36px; padding: 12px 14px; color: var(--text); background: var(--bg-card); border: 1px solid var(--line); border-radius: 12px; font-size: 13px; line-height: 1.6; }
            .ai-send-error p { margin: 0 0 4px; }
            .ai-send-error-detail { opacity: .65; overflow-wrap: anywhere; }
            .ai-send-retry { margin-top: 6px; padding: 7px 12px; color: var(--text); background: transparent; border: 1px solid var(--line); border-radius: 999px; font: inherit; cursor: pointer; }
            .ai-send-retry:disabled { opacity: .5; cursor: wait; }
            .ai-waiting { display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 4px;font-size:12px;color:var(--muted); }
            .ai-waiting button { flex-shrink:0;border:1px solid var(--line);border-radius:999px;padding:6px 10px;background:transparent;color:var(--text);font:inherit;cursor:pointer; }
            .ai-typing-message { align-items: flex-end; }
            .ai-typing-message .ai-typing { gap: 4px; padding: 13px 16px; color: var(--text); opacity: 1; background: var(--bg-card); border: 1px solid var(--line); border-radius: 18px 18px 18px 6px; }
            .ai-typing-message .ai-typing i { width: 5px; height: 5px; border-radius: 50%; background: currentColor; opacity: .3; animation: nuo-typing 1.2s infinite ease-in-out; }
            .ai-typing-message .ai-typing i:nth-child(2) { animation-delay: .16s; }
            .ai-typing-message .ai-typing i:nth-child(3) { animation-delay: .32s; }
            .ai-typing-slow { font-size: 12px; color: var(--muted); }
            .ai-typing-stop { flex: 0 0 auto; align-self: center; padding: 4px 8px; color: var(--muted); background: none; border: 0; font: inherit; font-size: 12px; cursor: pointer; }
            @keyframes nuo-typing { 0%, 60%, 100% { opacity: .25; transform: translateY(0); } 30% { opacity: .85; transform: translateY(-2px); } }
            @media (prefers-reduced-motion: reduce) { .ai-typing-message .ai-typing i { animation: none; opacity: .5; } }
          `;
          aiPage.appendChild(style);

          const indicator = document.createElement("div");
          indicator.className = "crisis-ai-indicator crisis-ai-low";
          indicator.innerHTML = '<span class="crisis-ai-indicator-dot"></span><span class="crisis-ai-indicator-label">平稳</span>';
          // 聊天页不常驻显示“我在给你贴情绪标签”，只在需要关注或需要帮助时出现。
          indicator.style.display = "none";
          aiPage.querySelector(".ai-header")?.appendChild(indicator);

          const banner = document.createElement("div");
          banner.className = "crisis-ai-risk-banner";
          banner.textContent = "Nuo注意到你现在的情绪有些沉重。如果需要即时帮助，请点击上方的「需要帮助」，或拨打热线。";
          aiPage.querySelector(".ai-messages")?.before(banner);

          const safetyOption = document.createElement("button");
          safetyOption.className = "crisis-option";
          safetyOption.type = "button";
          safetyOption.dataset.crisisAiAction = "safety-plan";
          safetyOption.innerHTML = '<span style="font-size:20px">📋</span><span class="crisis-option-label">我的安全计划</span>';
          crisisPanel.querySelector(".crisis-options")?.appendChild(safetyOption);

          const immediateButton = document.createElement("button");
          immediateButton.className = "crisis-ai-immediate";
          immediateButton.type = "button";
          immediateButton.textContent = "立即联系";
          immediateButton.style.display = "none";
          crisisPanel.appendChild(immediateButton);

          const planModal = document.createElement("div");
          planModal.className = "crisis-ai-safety-plan";
          planModal.innerHTML = '<div class="crisis-ai-safety-card" role="dialog" aria-modal="true"><div class="crisis-ai-safety-header"><h2 class="crisis-ai-safety-title">我的安全计划</h2><button class="crisis-ai-safety-close" type="button">×</button></div><p class="crisis-ai-safety-subtitle">在平静的时候写下这些，需要的时候它们会帮到你。</p><textarea class="crisis-ai-safety-field" data-plan-field="signals" rows="2" placeholder="哪些迹象表明我需要帮助？例如：失眠、不想说话..."></textarea><textarea class="crisis-ai-safety-field" data-plan-field="strategies" rows="2" placeholder="散步、听音乐、联系朋友、深呼吸..."></textarea><textarea class="crisis-ai-safety-field" data-plan-field="contacts" rows="2" placeholder="姓名 + 关系 + 电话，例如：小明 / 好朋友 / 138xxxx"></textarea><textarea class="crisis-ai-safety-field" data-plan-field="hope" rows="2" placeholder="想想那些让你觉得温暖的小事..."></textarea><div class="crisis-ai-safety-actions"><button class="crisis-ai-safety-button crisis-ai-safety-close-action" type="button">取消</button><button class="crisis-ai-safety-button crisis-ai-safety-save" type="button">保存计划</button></div></div>';
          aiPage.appendChild(planModal);

          // ===== 会话持久化（豆包式左侧栏） =====
          const SESSIONS_KEY = 'nuo_chat_sessions';
          let currentSession = null;
          let pendingDelivery = null;

          function notifyPracticeContext() {
            queueMicrotask(() => ctx.events.emit('chat.contextChanged', { sessionId: currentSession?.id || '' }));
          }

          function loadSessionStore() {
            try {
              const raw = JSON.parse(localStorage.getItem(SESSIONS_KEY) || 'null');
              if (raw && Array.isArray(raw.sessions)) return raw;
            } catch (e) { /* ignore */ }
            return { sessions: [], activeId: null };
          }
          function saveSessionStore(store) {
            try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(store)); return true; } catch (e) {
              try {
                const slim = JSON.parse(JSON.stringify(store));
                (slim.sessions || []).forEach((session) => (session.messages || []).forEach((item) => { delete item.image; }));
                localStorage.setItem(SESSIONS_KEY, JSON.stringify(slim));
                return true;
              } catch (err) { return false; }
            }
          }
          const sessionListEl = document.getElementById('ai-session-list');
          const newChatBtn = document.getElementById('ai-new-chat');

          function conversationId() {
            return currentSession ? (currentSession.backendId || currentSession.id) : 'nuo-default';
          }

          function newBackendId() {
            return 'chat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
          }

          /** 当前这段对话里用户看得见的文字，发给服务端，最多 12 条 / 6000 字。 */
          function historySnapshot(exclude) {
            return buildHistory(currentSession?.messages || [], exclude);
          }

          ctx.services.chat = {
            activeSessionId() {
              return currentSession ? currentSession.id : 'nuo-main';
            },
            dismissPracticeInvitation(cycle) {
              if (!currentSession) return;
              currentSession.dismissedPracticeCycle = cycle;
              const store = loadSessionStore();
              const index = store.sessions.findIndex(session => session.id === currentSession.id);
              if (index >= 0) store.sessions[index] = currentSession;
              saveSessionStore(store); notifyPracticeContext();
            },
            practiceContext() {
              return {
                sessionId: currentSession?.id || '',
                dismissedPracticeCycle: currentSession?.dismissedPracticeCycle,
                pending: Boolean(pendingDelivery && pendingDelivery.sessionId === currentSession?.id),
                messages: (currentSession?.messages || []).map((item) => ({
                  role: item.role, text: item.text || '', time: item.time,
                  sheet: item.sheet ? { ...item.sheet } : null,
                  riskLevel: item.riskLevel, sendError: item.sendError, practiceGuide: item.practiceGuide
                }))
              };
            }
          };

          function ensureSession() {
            if (currentSession) return currentSession;
            const store = loadSessionStore();
            const main = resetMainWithGreeting(store);
            currentSession = main;
            renderSessionList();
            return currentSession;
          }

          function findSession(id) {
            return loadSessionStore().sessions.find((s) => s.id === id) || null;
          }

          const refineTimers = new Map();

          function isGreeting(text) {
            return /^(hello|hi|hey|你好|您好|在吗|嗨|哈喽|早上好|下午好|晚上好|早|嗯+|哦+|啊+|好|好的|谢谢)[!！.。?？~\s]*$/i.test(String(text || '').trim());
          }

          function textOverlap(a, b) {
            const grams = (value) => {
              const source = String(value || '').replace(/\s/g, '');
              const set = new Set();
              for (let i = 0; i < source.length - 1; i += 1) set.add(source.slice(i, i + 2));
              return set;
            };
            const left = grams(a);
            const right = grams(b);
            if (!left.size || !right.size) return 0;
            let shared = 0;
            left.forEach((gram) => { if (right.has(gram)) shared += 1; });
            return shared / Math.min(left.size, right.size);
          }

          function titleFromText(text) {
            let source = String(text || '').replace(/\s+/g, '');
            source = source.replace(/^(就是|其实|嗯+|啊+|那个|然后|不过|但是|可是|所以|我想|我希望|你能|能不能|请问)[，,：:]*/, '');
            const wish = source.match(/(?:想|要|希望)(.{2,16}?)(?:，|。|但是|可是|不过|因为|$)/);
            if (wish) {
              const core = wish[1].replace(/^(对你|给你|让你|把|让)/, '');
              if (core.length >= 4) return core.slice(0, 12);
            }
            if (/什么|哪些|吗|呢|[?？]/.test(source)) {
              const question = source.replace(/^(你能|你知道|能不能|请问|想问一下|想问)/, '').replace(/[吗呢?？]$/, '');
              const piece = question.split(/[，,。]/).find((part) => part.length >= 4) || question;
              return (piece || '一个问题').slice(0, 12);
            }
            const sentence = source.split(/[。！？!?；;]/)[0];
            return (sentence || '这段聊天').slice(0, 12);
          }

          function buildLocalOutline(session) {
            const users = (session.messages || []).filter((item) => item.role === 'user' && String(item.text || '').trim());
            if (!users.length) return { title: session.id === 'nuo-main' ? '当前对话' : '新对话', sections: [] };
            const groups = [];
            let bucket = [];
            const flush = () => {
              if (!bucket.length) return;
              const meaningful = bucket.filter((item) => !isGreeting(item.text));
              const source = meaningful.length ? meaningful : bucket;
              groups.push({
                title: titleFromText(source.map((item) => item.text).join('。')),
                time: source[0].time
              });
              bucket = [];
            };
            users.forEach((item) => {
              if (!bucket.length) { bucket.push(item); return; }
              const prev = bucket[bucket.length - 1];
              const continues = /^(就是|然后|不过|但是|可是|所以|这个|那个|它|不是|对|还有|另外|而且|我是说)/.test(String(item.text || '').trim());
              const gap = item.time - prev.time > 20 * 60 * 1000;
              const shift = !continues && !isGreeting(item.text) && !isGreeting(prev.text) && String(item.text).trim().length >= 10 && String(prev.text).trim().length >= 10 && textOverlap(prev.text, item.text) < 0.08;
              if ((gap || shift) && !bucket.every((entry) => isGreeting(entry.text))) flush();
              bucket.push(item);
            });
            flush();
            const sections = groups.filter((item) => item.title);
            const joined = sections.slice(0, 2).map((item) => item.title).join('、');
            const title = sections.length === 1 ? sections[0].title : (joined.length <= 16 ? joined : sections[0].title);
            return { title: title || '一段对话', sections };
          }

          function userOutlineKey(session) {
            return (session.messages || []).filter((item) => item.role === 'user').map((item) => item.text).join('\n');
          }

          function parseOutline(text, users) {
            const raw = String(text || '');
            const start = raw.indexOf('{');
            const end = raw.lastIndexOf('}');
            if (start < 0 || end <= start) return null;
            let data;
            try { data = JSON.parse(raw.slice(start, end + 1)); } catch (error) { return null; }
            const title = String(data.title || '').trim().slice(0, 18);
            if (!title) return null;
            const sections = (Array.isArray(data.sections) ? data.sections : []).map((item) => {
              const at = Number(item.at);
              const msg = users[at];
              return { title: String(item.title || '').trim().slice(0, 18), time: msg && msg.time };
            }).filter((item) => item.title && item.time);
            return { title, sections };
          }

          function mergeSections(saved, incoming) {
            const hidden = new Set(saved.hiddenSectionTimes || []);
            const renamed = new Map();
            (saved.sections || []).forEach((item) => {
              if (item && item.renamed) renamed.set(item.time, item.title);
            });
            return (incoming || []).filter((item) => item && item.time && !hidden.has(item.time)).map((item) => {
              if (renamed.has(item.time)) return { title: renamed.get(item.time), time: item.time, renamed: true };
              return { title: item.title, time: item.time, renamed: !!item.renamed };
            });
          }

          function writeSessionOutline(sessionId, title, sections) {
            const store = loadSessionStore();
            const saved = store.sessions.find((item) => item.id === sessionId);
            if (!saved) return;
            if (!saved.titleLocked && title) saved.title = title;
            saved.sections = mergeSections(saved, sections);
            saveSessionStore(store);
            if (currentSession && currentSession.id === sessionId) {
              currentSession.title = saved.title;
              currentSession.sections = saved.sections;
              currentSession.titleLocked = saved.titleLocked;
              currentSession.hiddenSectionTimes = saved.hiddenSectionTimes;
            }
            renderSessionList();
          }

          function applyLocalOutline(session) {
            const local = buildLocalOutline(session);
            if (!session.titleLocked) session.title = local.title;
            writeSessionOutline(session.id, session.title, local.sections);
          }

          function scheduleRefine(session) {
            const key = userOutlineKey(session);
            if (!key.trim()) return;
            const sessionId = session.id;
            window.clearTimeout(refineTimers.get(sessionId));
            refineTimers.set(sessionId, window.setTimeout(async () => {
              const latest = findSession(sessionId);
              if (!latest || userOutlineKey(latest) !== key) return;
              const users = latest.messages.filter((item) => item.role === 'user' && String(item.text || '').trim());
              const message = '下面是用户说过的话。请只输出一行 JSON，不要寒暄。格式：{"title":"不超过12个字","sections":[{"title":"不超过12个字","at":0}]}。at 是该段第一句的序号。同一件事合成一段，换话题再分段。打招呼不要单独成段。\n'
                + users.map((item, index) => index + '. ' + String(item.text).trim().slice(0, 80)).join('\n');
              try {
                // 提纲是独立的整理任务，走不带陪伴人格的通用补全接口，不再要求聊天模型输出 JSON。
                const content = await ctx.api.ai.complete([
                  { role: 'system', content: '你只负责整理对话提纲。只输出一行 JSON，不要寒暄、不要解释。' },
                  { role: 'user', content: message }
                ], { temperature: 0.3, maxTokens: 400 });
                if (!findSession(sessionId) || userOutlineKey(findSession(sessionId)) !== key) return;
                const parsed = parseOutline(content, users);
                if (!parsed || !parsed.sections.length) return;
                writeSessionOutline(sessionId, parsed.title, parsed.sections);
              } catch (error) { /* 本地标题先用着 */ }
            }, 700));
          }

          function refreshOutline(session) {
            if (!session || !(session.messages || []).some((item) => item.role === 'user')) return;
            applyLocalOutline(session);
            scheduleRefine(session);
          }

          function appendToCurrentSession(role, text, sheet, image) {
            const s = currentSession || ensureSession();
            const saved = { role, text, time: Date.now(), sheet: sheet || null };
            if (image) { saved.image = image; saved.hadImage = true; }
            s.messages.push(saved);
            s.updatedAt = Date.now();
            const store = loadSessionStore();
            const idx = store.sessions.findIndex((x) => x.id === s.id);
            if (idx >= 0) store.sessions[idx] = s; else store.sessions.unshift(s);
            store.activeId = s.id;
            saveSessionStore(store);
            refreshOutline(s);
            notifyPracticeContext();
            return saved;
          }

          const MAIN_ID = 'nuo-main';
          function makeWelcomeMessage() {
            let nickname = null;
            try { nickname = ctx.storage.nickname.get(); } catch { /* 昵称不可用时用通用问候 */ }
            return greetingFor(new Date(), { nickname });
          }
          function ensureMainSession(store) {
            let main = store.sessions.find((s) => s.id === MAIN_ID);
            if (!main) {
              main = { id: MAIN_ID, backendId: newBackendId(), title: '当前对话', createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
              store.sessions.unshift(main);
            }
            return main;
          }
          function archiveMain(store) {
            const main = store.sessions.find((s) => s.id === MAIN_ID);
            if (!main) return null;
            const hasUser = main.messages.some((m) => m.role === 'user');
            if (!hasUser) return null;
            const now = Date.now();
            const arch = {
              id: 's_' + now + '_' + Math.random().toString(36).slice(2, 6),
              title: main.title && main.title !== '当前对话' && main.title !== '新对话' ? main.title : '一段对话',
              sections: (main.sections || []).map((item) => ({ ...item })),
              titleLocked: !!main.titleLocked,
              hiddenSectionTimes: [...(main.hiddenSectionTimes || [])],
              backendId: main.backendId || main.id,
              dismissedPracticeCycle: main.dismissedPracticeCycle,
              createdAt: main.createdAt || now,
              updatedAt: main.updatedAt || now,
              messages: main.messages
            };
            store.sessions.unshift(arch);
            return store;
          }
          function resetMainWithGreeting(store) {
            const main = ensureMainSession(store);
            main.backendId = newBackendId();
            delete main.dismissedPracticeCycle;
            main.messages = [];
            main.title = '当前对话';
            main.sections = [];
            main.titleLocked = false;
            main.hiddenSectionTimes = [];
            main.messages.push({ role: 'assistant', text: makeWelcomeMessage(), time: Date.now() });
            main.updatedAt = Date.now();
            store.activeId = MAIN_ID;
            saveSessionStore(store);
            return main;
          }
          function initChat() {
            const store = loadSessionStore();
            const main = ensureMainSession(store);
            // “主对话”跟随用户当前选择；重新打开页面不归档或清空它。
            currentSession = store.sessions.find((session) => session.id === store.activeId) || main;
            if (!currentSession.messages.length) {
              currentSession.messages.push({ role: 'assistant', text: makeWelcomeMessage(), time: Date.now() });
            }
            // 旧数据没有 backendId 时补一个，避免多浏览器共用 nuo-main。
            if (!currentSession.backendId) currentSession.backendId = newBackendId();
            store.activeId = currentSession.id;
            saveSessionStore(store);
            renderSessionList();
            renderSessionMessages(currentSession);
          }

          function renderSessionMessages(session) {
            notifyPracticeContext();
            messages.innerHTML = '';
            if (!session || session.messages.length === 0) {
              appendCrisisAIReply(makeWelcomeMessage());
              applyConversationMood("low");
              return;
            }
            session.messages.forEach((m) => {
              if (m.role === 'user') {
                messages.appendChild(renderUserBubble(m.text, m.image, m.time));
                if (m.sendError) appendSendError(session.id, m);
              } else {
                appendCrisisAIReply(m.text, m.sheet, m.time);
              }
            });
            const last = session.messages.at(-1);
            if (last?.role === 'user' && !last.sendError && !(pendingDelivery?.user === last || pendingDelivery?.user?.time === last.time)) {
              appendSendError(session.id, { ...last, sendError:'上次没等到回复，可以再发一次。' });
            }
            messages.scrollTop = messages.scrollHeight;
            applyConversationMood("low");
          }

          let recordActionBindings = [];
          function renderSessionList() {
            if (!sessionListEl) return;
            recordActionBindings.forEach(dispose => dispose()); recordActionBindings = [];
            const store = loadSessionStore();
            const active = store.sessions.find((session) => session.id === store.activeId);
            const recent = store.sessions
              .filter((session) => session.id !== active?.id)
              .filter((session) => session.id !== MAIN_ID
                || (session.messages || []).some((message) => message.role === 'user'))
              .sort((a, b) => b.updatedAt - a.updatedAt);
            sessionListEl.replaceChildren();

            const chatIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 0 1-8 8H8l-5 2 1.6-5A8 8 0 1 1 20 11Z"/></svg>';
            function sessionButton(session, isMain) {
              const button = document.createElement('button');
              button.type = 'button';
              button.className = 'ai-session-item' + (isMain ? ' ai-session-active' : '');
              button.dataset.sessionId = session.id;
              if (isMain) button.setAttribute('aria-current', 'true');
              const icon = document.createElement('span');
              icon.className = 'ai-session-icon' + (isMain ? ' ai-session-mascot' : '');
              icon.setAttribute('aria-hidden', 'true');
              icon.innerHTML = isMain ? (ctx.services.mascot?.getFace('normal') || chatIcon) : chatIcon;
              const copy = document.createElement('span');
              copy.className = 'ai-session-copy';
              const title = document.createElement('span');
              title.className = 'ai-session-title';
              title.textContent = isMain ? '主对话' : (session.title || '一段对话');
              copy.appendChild(title);
              if (isMain && session.title && !['当前对话', '新对话'].includes(session.title)) {
                const subtitle = document.createElement('span');
                subtitle.className = 'ai-session-subtitle';
                subtitle.textContent = session.title;
                copy.appendChild(subtitle);
              }
              button.title = session.title || '主对话';
              button.append(icon, copy);
              recordActionBindings.push(bindRecordActions(button, {
                name: session.title || '这段对话', openLabel: '打开对话',
                open: () => isMain ? closeDrawer() : switchSession(session.id),
                remove: () => deleteSession(session.id)
              }));
              return button;
            }

            if (active) {
              const mainGroup = document.createElement('section');
              mainGroup.className = 'ai-session-group';
              mainGroup.setAttribute('aria-label', '主对话');
              mainGroup.appendChild(sessionButton(active, true));
              sessionListEl.appendChild(mainGroup);
            }
            const recentGroup = document.createElement('section');
            recentGroup.className = 'ai-session-group';
            recentGroup.setAttribute('aria-labelledby', 'ai-recent-heading');
            const heading = document.createElement('h2');
            heading.id = 'ai-recent-heading';
            heading.className = 'ai-session-heading';
            heading.textContent = '最近对话';
            recentGroup.appendChild(heading);
            recent.forEach((session) => recentGroup.appendChild(sessionButton(session, false)));
            if (!recent.length) {
              const empty = document.createElement('p');
              empty.className = 'ai-session-empty';
              empty.textContent = '还没有其他对话';
              recentGroup.appendChild(empty);
            }
            sessionListEl.appendChild(recentGroup);
          }
          ctx.events.on('mascot.changed', () => renderSessionList());

          function deleteSession(id) {
            const store = loadSessionStore();
            const selected = store.sessions.find(session => session.id === id);
            if (!selected || !window.confirm(`删除「${selected.title || '这段对话'}」？删除后无法恢复。`)) return;
            const next = withoutChatSession(store, id, () => ({
              // A fresh backend conversation ID prevents deleted main-chat history returning.
              id: 's_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
              title: '当前对话', createdAt: Date.now(), updatedAt: Date.now(), sections: [],
              messages: [{ role: 'assistant', text: makeWelcomeMessage(), time: Date.now() }]
            }));
            if (!next || !saveSessionStore(next)) { showToast('删除未能保存，请稍后重试'); return; }
            window.clearTimeout(refineTimers.get(id)); refineTimers.delete(id);
            const activeWasDeleted = currentSession?.id === id;
            currentSession = next.sessions.find(session => session.id === next.activeId);
            if (activeWasDeleted) renderSessionMessages(currentSession);
            renderSessionList();
            const focus = sessionListEl.querySelector('.ai-session-active'); focus?.focus();
            showToast('对话已删除');
          }

          function switchSession(id) {
            const store = loadSessionStore();
            const selected = store.sessions.find((session) => session.id === id);
            if (!selected) return;
            selected.updatedAt = Date.now();
            store.activeId = selected.id;
            saveSessionStore(store);
            currentSession = selected;
            closeDrawer();
            renderSessionMessages(currentSession);
            renderSessionList();
          }
          if (newChatBtn) {
            newChatBtn.addEventListener('click', () => {
              const store = loadSessionStore();
              archiveMain(store);
              const main = resetMainWithGreeting(store);
              currentSession = main;
              renderSessionList();
              renderSessionMessages(main);
              closeDrawer();
            });
          }

          function refreshStoredOutlines() {
            const store = loadSessionStore();
            store.sessions.forEach((session) => {
              if (!(session.messages || []).some((item) => item.role === 'user')) return;
              if (session.titleLocked) return;
              const first = String((session.messages.find((item) => item.role === 'user') || {}).text || '').trim().slice(0, 18);
              const named = session.title && session.sections && session.sections.length && session.title !== first;
              if (named) return;
              const local = buildLocalOutline(session);
              session.title = local.title;
              session.sections = mergeSections(session, local.sections);
            });
            saveSessionStore(store);
          }

          const CALM_MOOD = { id: "calm", label: "平稳", color: "#2F9E62" };
          const WATCH_MOOD = { id: "watch", label: "需要关注", color: "#C2922E" };
          const HELP_MOOD = { id: "help", label: "需要帮助", color: "#D64545", words: ["想死", "自杀", "轻生", "不想活", "结束生命", "割腕", "跳楼", "活不下去", "想消失"] };
          const MOODS = [
            HELP_MOOD,
            { id: "anxious", label: "焦虑", color: "#D4922A", words: ["焦虑", "紧张", "担心", "害怕", "慌", "不安", "压力"] },
            { id: "down", label: "低落", color: "#4C7FBF", words: ["难过", "伤心", "哭", "失落", "委屈", "难受", "崩溃", "撑不住", "不开心", "郁闷", "想哭", "心情不好"] },
            { id: "tired", label: "疲惫", color: "#6E8B84", words: ["疲惫", "没力气", "好累", "精疲力尽", "好困", "累"] },
            { id: "upset", label: "烦躁", color: "#E06A3A", words: ["烦躁", "心烦", "好烦", "烦死", "生气", "愤怒", "讨厌", "气死", "恼火", "不爽", "烦"] },
            { id: "happy", label: "开心", color: "#E0A020", words: ["开心", "高兴", "快乐", "太好了", "哈哈", "幸福", "好开心", "真好", "顺利"] }
          ];

          // 恢复当前对话，其余对话只在“最近对话”中显示。
          refreshStoredOutlines();
          initChat();
          loadSessionStore().sessions.filter((session) => session.id !== MAIN_ID && (session.messages || []).some((item) => item.role === 'user')).slice(0, 5).forEach(scheduleRefine);

          // 时段变化不再改写已显示的问候；新对话或重新打开时由 greetingFor 生成。

          // 清空当前会话（同时清掉已保存的这条会话内容）
          const clearBtn = document.getElementById('ai-clear-button');
          if (clearBtn) {
            clearBtn.addEventListener('click', () => {
              if (!currentSession) return;
              currentSession.messages = [];
              currentSession.title = '新对话';
              currentSession.sections = [];
              const store = loadSessionStore();
              const idx = store.sessions.findIndex((s) => s.id === currentSession.id);
              if (idx >= 0) store.sessions[idx] = currentSession;
              saveSessionStore(store);
              renderSessionMessages(currentSession);
              renderSessionList();
            });
          }

          // 左侧历史会话抽屉：点「☰」拉出，点遮罩 / ✕ / 选中 / 新建后收起
          const aiSidebarEl = document.getElementById('ai-sidebar');
          const aiSidebarBackdrop = document.getElementById('ai-sidebar-backdrop');
          const historyBtn = document.getElementById('ai-history-btn');
          const sidebarClose = document.getElementById('ai-sidebar-close');
          function openDrawer() {
            renderSessionList();
            aiPage.classList.add('ai-drawer-visible');
            if (aiSidebarEl) {
              aiSidebarEl.inert = false;
              aiSidebarEl.setAttribute('aria-hidden', 'false');
              aiSidebarEl.classList.add('ai-sidebar-open');
            }
            aiSidebarBackdrop?.classList.add('ai-backdrop-visible');
            historyBtn?.setAttribute('aria-expanded', 'true');
            sidebarClose?.focus();
          }
          function closeDrawer() {
            recordActionBindings.forEach(dispose => dispose()); recordActionBindings = [];
            if (aiSidebarEl?.contains(document.activeElement)) historyBtn?.focus();
            aiPage.classList.remove('ai-drawer-visible');
            if (aiSidebarEl) {
              aiSidebarEl.classList.remove('ai-sidebar-open');
              aiSidebarEl.setAttribute('aria-hidden', 'true');
              aiSidebarEl.inert = true;
            }
            aiSidebarBackdrop?.classList.remove('ai-backdrop-visible');
            historyBtn?.setAttribute('aria-expanded', 'false');
          }
          document.addEventListener('keydown', (event) => {
            if (!aiSidebarEl?.classList.contains('ai-sidebar-open')) return;
            if (event.key === 'Escape') { event.preventDefault(); closeDrawer(); }
            if (event.key !== 'Tab') return;
            const buttons = [...aiSidebarEl.querySelectorAll('button:not(:disabled)')];
            const first = buttons[0], last = buttons.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          });
          if (historyBtn) historyBtn.addEventListener('click', openDrawer);
          if (sidebarClose) sidebarClose.addEventListener('click', closeDrawer);
          if (aiSidebarBackdrop) aiSidebarBackdrop.addEventListener('click', closeDrawer);

          let currentRisk = "low";
          let autoSootheShown = false;

          function updateRiskIndicator(level) {
            currentRisk = level === "high" || level === "medium" ? level : "low";
            applyConversationMood(currentRisk);
          }
          function textHasMoodWord(text, word) {
            if (!text.includes(word)) return false;
            if (word === "烦" && (text.includes("麻烦") || text.includes("不烦"))) return false;
            if (word === "累" && text.includes("积累")) return false;
            return true;
          }
          function moodOfText(text) {
            const source = String(text || "");
            for (let i = 0; i < MOODS.length; i += 1) {
              if (MOODS[i].words.some((word) => textHasMoodWord(source, word))) return MOODS[i];
            }
            return null;
          }
          function moodFromMessages(list) {
            const users = (list || []).filter((item) => item && item.role === "user").slice(-3);
            if (!users.length) return CALM_MOOD;
            const weights = [1, 2, 4].slice(-users.length);
            const scores = {};
            users.forEach((item, index) => {
              const hit = moodOfText(item.text);
              if (!hit) return;
              scores[hit.id] = (scores[hit.id] || 0) + weights[index];
            });
            let best = null;
            let bestScore = 0;
            MOODS.forEach((mood) => {
              const score = scores[mood.id] || 0;
              if (score > bestScore) { best = mood; bestScore = score; }
            });
            return best || CALM_MOOD;
          }
          function paintMood(mood) {
            indicator.dataset.mood = mood.id;
            // 日常的“累、难过、焦虑”不贴标签；只有明确自伤时才显示求助状态。
            indicator.style.display = mood.id === "help" ? "inline-flex" : "none";
            indicator.style.background = "color-mix(in srgb, " + mood.color + " 20%, transparent)";
            const label = indicator.querySelector(".crisis-ai-indicator-label");
            const dot = indicator.querySelector(".crisis-ai-indicator-dot");
            if (label) { label.textContent = mood.label; label.style.color = mood.color; }
            if (dot) { dot.style.background = mood.color; dot.style.boxShadow = "0 0 0 3px " + mood.color + "55"; }
          }
          function applyConversationMood(level) {
            const mood = moodFromMessages(currentSession ? currentSession.messages : []);
            if (level === "high" || mood.id === "help") paintMood(HELP_MOOD);
            else if (mood.id !== "calm") paintMood(mood);
            else if (level === "medium") paintMood(WATCH_MOOD);
            else paintMood(CALM_MOOD);
          }
          function showCrisisPanelByRisk(level) {
            crisisPanel.classList.remove("crisis-ai-panel-medium", "crisis-ai-panel-high");
            immediateButton.style.display = "none";
            // 中风险只留在后台判断，不自动展开求助面板；出现明确危险信号时才展开。
            if (level === "high") { crisisPanel.classList.add("crisis-ai-panel-high", "crisis-panel-visible"); immediateButton.style.display = "block"; }
          }
          function simulateRisk(message) {
            // 与服务端 riskOf 保持一致：只有明确的自伤表达才是高风险。
            return riskOfText(message);
          }
          function openSoothingExercise() { crisisPanel.querySelector(".grounding-option")?.click(); }
          
          function showHighRiskSignal() { banner.classList.add("crisis-ai-visible"); }
          function openHotlineFromRisk() { crisisPanel.classList.add("crisis-panel-visible"); crisisPanel.querySelector('[data-crisis-action="hotline"]')?.click(); }
          function loadSafetyPlan() { try { return JSON.parse(localStorage.getItem("nuo_safety_plan") || "{}"); } catch (error) { return {}; } }
          function openSafetyPlan() { const plan = loadSafetyPlan(); planModal.querySelectorAll("[data-plan-field]").forEach((field) => { field.value = plan[field.dataset.planField] || ""; }); planModal.classList.add("crisis-ai-visible"); }
          function saveSafetyPlan() { const plan = {}; planModal.querySelectorAll("[data-plan-field]").forEach((field) => { plan[field.dataset.planField] = field.value.trim(); }); localStorage.setItem("nuo_safety_plan", JSON.stringify(plan)); planModal.classList.remove("crisis-ai-visible"); }
          function renderUserBubble(text, image, time) {
            const user = document.createElement('div');
            user.className = 'ai-message ai-user' + (image ? ' ai-has-photo' : '');
            if (time) user.dataset.msgTime = String(time);
            if (image) {
              const photo = document.createElement('img');
              photo.className = 'ai-message-photo';
              photo.alt = '发送的图片';
              photo.src = image;
              user.appendChild(photo);
            }
            const shown = image && text === '[图片]' ? '' : text;
            if (shown) {
              const bubble = document.createElement('div');
              bubble.className = 'ai-message-bubble';
              bubble.textContent = shown;
              user.appendChild(bubble);
            }
            return user;
          }
          function appendCrisisAIReply(text, sheet, messageTime) {
            const message = document.createElement("div");
            message.className = "ai-message ai-assistant";
            if (messageTime) message.dataset.msgTime = String(messageTime);
            const crisisAvatarSvg = ctx.services.mascot?.getFace("normal") || '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 16 L6 6 L16 12"/><path d="M30 16 L34 6 L24 12"/><ellipse cx="20" cy="22" rx="13" ry="11" transform="rotate(-6 20 22)"/><path d="M13 20 Q15 18 17 20"/><path d="M23 20 Q25 18 27 20"/><path d="M19 24 L21 24 L20 25.5 Z" fill="currentColor" stroke="none"/></svg>';
            message.innerHTML = '<span class="ai-message-avatar cat-normal">' + crisisAvatarSvg + '</span><div class="ai-message-bubble"></div>';
            message.querySelector(".ai-message-bubble").textContent = text;
            messages.appendChild(message);
            messages.scrollTop = messages.scrollHeight;
          }
          const plusButton = document.getElementById('ai-plus');
          const plusPanel = document.getElementById('ai-plus-panel');
          const plusImage = document.getElementById('ai-plus-image');
          const imageInput = document.getElementById('ai-image-input');
          const attachBox = document.getElementById('ai-attach');
          const attachImg = document.getElementById('ai-attach-img');
          const attachRemove = document.getElementById('ai-attach-remove');
          let pendingImage = '';
          let sending = false;
          function showToast(text) {
            const target = document.getElementById('toast');
            if (!target) return;
            target.textContent = text;
            target.classList.add('show');
            window.clearTimeout(showToast.timer);
            showToast.timer = window.setTimeout(() => target.classList.remove('show'), 2400);
          }
          function setPlusOpen(open) {
            if (!plusPanel || !plusButton) return;
            plusPanel.hidden = !open;
            plusButton.setAttribute('aria-expanded', open ? 'true' : 'false');
          }
          function showPending(data) {
            pendingImage = data || '';
            if (!attachBox || !attachImg) return;
            if (!pendingImage) {
              attachBox.hidden = true;
              attachImg.removeAttribute('src');
              return;
            }
            attachImg.src = pendingImage;
            attachBox.hidden = false;
          }
          function compressChatImage(file) {
            const type = (file.type || '').toLowerCase();
            if (type && !type.startsWith('image/')) return Promise.reject(new Error('type'));
            return new Promise((resolve, reject) => {
              const url = URL.createObjectURL(file);
              const image = new Image();
              image.onload = () => {
                const scale = Math.min(1, 1024 / Math.max(image.width, image.height, 1));
                const width = Math.max(1, Math.round(image.width * scale));
                const height = Math.max(1, Math.round(image.height * scale));
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const context = canvas.getContext('2d');
                if (!context) {
                  URL.revokeObjectURL(url);
                  reject(new Error('canvas'));
                  return;
                }
                context.fillStyle = '#ffffff';
                context.fillRect(0, 0, width, height);
                context.drawImage(image, 0, 0, width, height);
                let quality = 0.72;
                let data = canvas.toDataURL('image/jpeg', quality);
                while (data.length > 180000 && quality > 0.4) {
                  quality -= 0.1;
                  data = canvas.toDataURL('image/jpeg', quality);
                }
                URL.revokeObjectURL(url);
                if (!data.startsWith('data:image/jpeg')) {
                  reject(new Error('encode'));
                  return;
                }
                resolve(data);
              };
              image.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('load'));
              };
              image.src = url;
            });
          }
          // 请求期间允许查看其他会话；结果始终写回原消息所在的会话。
          function saveDelivery(sessionId, sentUser, update) {
            const store = loadSessionStore();
            const hasMessage = (session) => (session.messages || []).some((item) => item.role === 'user' && item.time === sentUser.time && item.text === sentUser.text);
            let session = store.sessions.find((item) => item.id === sessionId && hasMessage(item))
              || store.sessions.find(hasMessage);
            if (!session) return null;
            if (currentSession && currentSession.id === session.id && hasMessage(currentSession)) session = currentSession;
            const user = session.messages.find((item) => item.role === 'user' && item.time === sentUser.time && item.text === sentUser.text);
            update(session, user);
            session.updatedAt = Date.now();
            store.sessions[store.sessions.findIndex((item) => item.id === session.id)] = session;
            saveSessionStore(store);
            if (currentSession && currentSession.id === session.id) {
              currentSession = session;
              renderSessionMessages(session);
            }
            return session;
          }

          function appendSendError(sessionId, user) {
            const card = document.createElement('div');
            card.className = 'ai-send-error';
            card.setAttribute('role', 'alert');
            const title = document.createElement('p');
            title.textContent = '这句话没发出去。';
            const detail = document.createElement('p');
            detail.className = 'ai-send-error-detail';
            detail.textContent = user.sendError;
            const retry = document.createElement('button');
            retry.className = 'ai-send-retry';
            retry.type = 'button';
            retry.textContent = '重试这条消息';
            retry.addEventListener('click', () => sendCrisisAIMessage({ sessionId, user, button: retry }));
            card.append(title, detail, retry);
            messages.appendChild(card);
          }

          async function sendCrisisAIMessage(retry, avatar) {
            if (sending) {
              if (avatar) throw new Error('上一条还在回，等它说完。');
              return;
            }
            if (avatar?.signal.aborted) throw new Error('已停下，这句话还留着，可以重试。');
            const hadImage = retry && (retry.user.hadImage || Boolean(retry.user.image));
            const message = retry ? (hadImage && retry.user.text === '[图片]' ? '' : retry.user.text) : avatar ? avatar.text.trim() : input.value.trim();
            const image = retry ? (retry.user.image || (hadImage ? pendingImage : '')) : avatar ? '' : pendingImage;
            if (retry && hadImage && !image) {
              showToast('原图片未保存在此设备，请重新选择图片后点击重试');
              return;
            }
            if (!message && !image) return;
            sending = true;
            const controller = new AbortController();
            const abortAvatar = () => controller.abort();
            avatar?.signal.addEventListener('abort', abortAvatar, { once: true });
            let savedUser;
            let sessionId;
            let waitTimer;
            const typing = document.createElement('div');
            typing.className = 'ai-message ai-assistant ai-typing-message';
            const typingAvatar = document.createElement('span');
            typingAvatar.className = 'ai-message-avatar';
            typingAvatar.setAttribute('aria-hidden','true');
            typingAvatar.innerHTML = ctx.services.mascot?.getFace('normal') || '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 16 L6 6 L16 12"/><path d="M30 16 L34 6 L24 12"/><ellipse cx="20" cy="22" rx="13" ry="11" transform="rotate(-6 20 22)"/></svg>';
            const typingBody = document.createElement('div');
            typingBody.className = 'ai-typing';
            typingBody.setAttribute('role','status');
            typingBody.setAttribute('aria-live','polite');
            typingBody.setAttribute('aria-label','Nuo 正在输入');
            typingBody.innerHTML = '<i></i><i></i><i></i>';
            const stopWaiting = document.createElement('button');
            stopWaiting.type = 'button'; stopWaiting.className = 'ai-typing-stop'; stopWaiting.textContent = '停止';
            stopWaiting.addEventListener('click', () => controller.abort());
            typing.append(typingAvatar, typingBody, stopWaiting);
            sendButton.disabled = true; sendButton.setAttribute('aria-busy','true');
            waitTimer = window.setTimeout(() => {
              typingBody.innerHTML = '<span class="ai-typing-slow">还在想…</span>';
              typingBody.setAttribute('aria-label','还在想，可以再等等，或点停止');
            }, 12000);
            if (retry?.button) { retry.button.disabled = true; retry.button.textContent = '正在重试…'; }
            try {
              if (retry) {
                savedUser = retry.user;
                sessionId = retry.sessionId;
                // 使用原消息和原图片重试，不重复新增聊天记录，也不清空正在输入的新草稿。
                if (image && !savedUser.image) {
                  savedUser.image = image;
                  showPending('');
                }
              } else {
                if (!avatar) {
                  input.value = '';
                  showPending('');
                  setPlusOpen(false);
                }
                ensureSession();
                savedUser = appendToCurrentSession('user', message || '[图片]', null, image);
                sessionId = currentSession.id;
                messages.appendChild(renderUserBubble(savedUser.text, image, savedUser.time));
                messages.scrollTop = messages.scrollHeight;
                applyConversationMood('low');
              }
              // 用户气泡之后才显示“正在输入”，避免打字气泡跑到提问上方。
              messages.appendChild(typing);
              messages.scrollTop = messages.scrollHeight;
              pendingDelivery = { sessionId, user:savedUser };
              notifyPracticeContext();
              let result;
              let streamBubble = null;
              try {
                const backendId = findSession(sessionId)?.backendId || sessionId;
                const history = historySnapshot(savedUser);
                result = await ctx.api.chat.stream(message, backendId, {
                  nickname: ctx.storage.nickname.get() || undefined,
                  history,
                  ...(image ? { image } : {}),
                  signal: controller.signal,
                  onDelta(text) {
                    if (typing.isConnected) typing.remove();
                    if (!streamBubble) {
                      streamBubble = document.createElement('div');
                      streamBubble.className = 'ai-message ai-assistant';
                      streamBubble.innerHTML = '<span class="ai-message-avatar" aria-hidden="true">' + (ctx.services.mascot?.getFace('normal') || FALLBACK_FACE) + '</span><div class="ai-message-bubble"></div>';
                      messages.appendChild(streamBubble);
                    }
                    const bubble = streamBubble.querySelector('.ai-message-bubble');
                    if (bubble) bubble.textContent += text;
                    messages.scrollTop = messages.scrollHeight;
                  }
                });
              } catch (error) {
                if (streamBubble) streamBubble.remove();
                // 用户主动点“停止”时不追加错误卡片，避免把停止说成失败。
                if (controller.signal.aborted) {
                  typing.remove();
                  if (avatar) throw error;
                  return;
                }
                const level = simulateRisk(message);
                if (level !== 'high') {
                  const reason = error && typeof error.message === 'string' && error.message.trim()
                    ? error.message.trim() : '连接或服务暂时不可用，请稍后重试。';
                  saveDelivery(sessionId, savedUser, (_session, user) => {
                    user.sendError = reason;
                    if (image) { user.image = image; user.hadImage = true; }
                  });
                  if (avatar) throw error;
                  return;
                }
                result = { riskLevel: level, reply: '我听见你现在很难受。请先照顾好当下的自己，需要时可以联系下面的帮助资源。' };
              }
              if (image && result.sawImage !== true && result.riskLevel !== 'high') {
                result = { riskLevel: result.riskLevel || 'low', reply: '这张图片我这边还没看见图里的内容。你可以用一句话告诉我，画面里是什么？', sheet: null };
              }
              if (!result.reply?.trim()) throw new Error('刚才那边没接上，再试一次？');
              const replyText = result.reply;
              const sheet = result.riskLevel === 'high' ? null : (result.sheet || null);
              const delivered = saveDelivery(sessionId, savedUser, (session, user) => {
                delete user.sendError;
                if (image) { user.image = image; user.hadImage = true; }
                session.messages.push({ role: 'assistant', text: replyText, time: Date.now(), sheet, riskLevel:result.riskLevel, practiceGuide: result.practiceGuide || null });
              });
              if (!delivered || !currentSession || currentSession.id !== delivered.id) {
                if (avatar) throw new Error('对话切走了，回到刚才那段再试。');
                return;
              }
              updateRiskIndicator(result.riskLevel);
              showCrisisPanelByRisk(result.riskLevel);
              ctx.events.emit('chat.risk', { level: result.riskLevel });
              if (message && result.riskLevel !== 'high') ctx.events.emit('chat.userSaid', { text: message });
              if (result.riskLevel !== 'high') ctx.events.emit('chat.roundDelivered', { sessionId: delivered.id });
              if (result.riskLevel === 'high') {
                showHighRiskSignal();
                if (!autoSootheShown) { autoSootheShown = true; openSoothingExercise(); }
              }
              return result;
            } catch (error) {
              const reason = error instanceof Error ? error.message : '这条消息没有处理完成，请重试。';
              if (savedUser && sessionId) saveDelivery(sessionId, savedUser, (_session, user) => { user.sendError = reason; });
              else showToast(reason);
              if (avatar) throw error;
            } finally {
              sending = false;
              pendingDelivery = null;
              notifyPracticeContext();
              window.clearTimeout(waitTimer); typing.remove();
              sendButton.disabled = false; sendButton.removeAttribute('aria-busy');
              avatar?.signal.removeEventListener('abort', abortAvatar);
              if (retry?.button) { retry.button.disabled = false; retry.button.textContent = '重试这条消息'; }
            }
          }

          crisisPanel.querySelectorAll("[data-crisis-action]").forEach((item) => item.addEventListener("click", () => {}));
          immediateButton.addEventListener("click", openHotlineFromRisk);
          banner.addEventListener("click", openHotlineFromRisk);
          safetyOption.addEventListener("click", openSafetyPlan);
          planModal.querySelector(".crisis-ai-safety-close").addEventListener("click", () => planModal.classList.remove("crisis-ai-visible"));
          planModal.querySelector(".crisis-ai-safety-close-action").addEventListener("click", () => planModal.classList.remove("crisis-ai-visible"));
          planModal.querySelector(".crisis-ai-safety-save").addEventListener("click", saveSafetyPlan);
          planModal.addEventListener("click", (event) => { if (event.target === planModal) planModal.classList.remove("crisis-ai-visible"); });
          sendButton.addEventListener("click", (event) => { event.stopImmediatePropagation(); sendCrisisAIMessage(); }, { capture: true });
          input.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.stopImmediatePropagation(); sendCrisisAIMessage(); } }, { capture: true });
          if (plusButton) plusButton.addEventListener('click', () => setPlusOpen(plusPanel.hidden));
          if (plusImage && imageInput) {
            plusImage.addEventListener('click', () => imageInput.click());
            imageInput.addEventListener('change', async () => {
              const file = imageInput.files && imageInput.files[0];
              imageInput.value = '';
              if (!file) return;
              try {
                showPending(await compressChatImage(file));
                setPlusOpen(false);
              } catch (error) {
                showToast('这张图片没能加上，请换一张');
              }
            });
          }
          if (attachRemove) attachRemove.addEventListener('click', () => showPending(''));
        }());
  }
}

