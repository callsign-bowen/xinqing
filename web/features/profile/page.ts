// @ts-nocheck
/** 功能构件：profilePage。只通过 ctx 与外界通信，不 import 其它 features。 */
import type { AppContext } from '../../kernel/context'
import { applyChatSignal, describeProfileChange } from './signals'

const QUESTIONS = [
  {
    id: 'company',
    title: '你现在更想让我怎么陪你？',
    hint: '选一个就好。',
    multiple: false,
    options: ['先听我说', '陪我把事情理一理', '轻松聊聊天就好', '我还不确定']
  },
  {
    id: 'focus',
    title: '最近最常占着你的是哪一块？',
    hint: '可以多选。',
    multiple: true,
    exclusive: '说不上来，只是有点沉',
    options: ['学业', '和人相处', '家里的事', '睡觉和身体', '对自己的看法', '说不上来，只是有点沉']
  },
  {
    id: 'pace',
    title: '你说话时更舒服的节奏？',
    hint: '选一个就好。',
    multiple: false,
    options: ['你少问，让我多说', '你可以问我一句', '短一点，我看着累', '可以直接一点']
  },
  {
    id: 'freeTime',
    title: '空下来你比较会做什么？',
    hint: '可以多选，也可以先跳过。',
    multiple: true,
    exclusive: '暂时没有',
    options: ['散步', '听歌', '看剧', '画画或写东西', '运动', '打游戏', '暂时没有']
  }
]

const LABELS = {
  company: '怎么陪你',
  focus: '最近占着你的',
  pace: '说话节奏',
  freeTime: '空下来会做'
}

export const profilePageFeature = {
  id: 'profilePage',
  init(ctx: AppContext) {
        (function initProfilePage() {
          const profilePage = document.getElementById("page-profile");
          const homePage = document.querySelector(".app");
          const reportPage = document.getElementById("page-report");
          const aiPage = document.getElementById("page-ai");
          if (!profilePage) return;
          const intro = document.getElementById("profile-intro");
          const introTitle = document.getElementById("profile-intro-title");
          const introSub = document.getElementById("profile-intro-sub");
          const introProgress = document.getElementById("profile-intro-progress");
          const introOptions = document.getElementById("profile-intro-options");
          const introNext = document.getElementById("profile-intro-next");
          const introSkip = document.getElementById("profile-intro-skip");
          const introBack = document.getElementById("profile-intro-back");
          let step = 0;
          let editing = false;
          let draft = blankAnswers();
          let picked = [];
          let stepOrigin = '';

          function blankAnswers() {
            return { company: '', focus: [], pace: '', freeTime: [] };
          }

          function copyAnswers(source) {
            const answers = source || blankAnswers();
            return {
              company: answers.company || '',
              focus: (answers.focus || []).slice(),
              pace: answers.pace || '',
              freeTime: (answers.freeTime || []).slice()
            };
          }

          function loadProfileData() {
            renderPersonalReport();
          }

          function showAnswer(id, answers) {
            const node = document.getElementById(id);
            if (!node) return;
            const value = answers || blankAnswers();
            const key = node.dataset.field;
            const raw = value[key];
            const text = Array.isArray(raw) ? raw.join('、') : (raw || '');
            node.textContent = text || '还没有选';
            node.classList.toggle('profile-report-empty', !text);
          }

          function renderPersonalReport() {
            const report = ctx.storage.personalReport.get();
            const legacy = document.getElementById('profile-report-legacy');
            const answers = document.getElementById('profile-report-answers');
            const hasLegacy = !report.baseline && Boolean(report.personality || report.hobbies || report.companionship || report.habits);
            if (legacy) legacy.hidden = !hasLegacy;
            if (answers) answers.hidden = !report.baseline;
            if (hasLegacy) {
              const write = (id, text) => {
                const node = document.getElementById(id);
                if (!node) return;
                const value = (text || '').trim();
                node.textContent = value || '还没有写';
                node.classList.toggle('profile-report-empty', !value);
              };
              write('profile-report-personality', report.personality);
              write('profile-report-hobbies', report.hobbies);
              write('profile-report-companionship', report.companionship);
              write('profile-report-habits', report.habits);
            }
            Object.keys(LABELS).forEach((key) => showAnswer('profile-report-' + key, report.current || report.baseline));
            const change = document.getElementById('profile-report-change');
            if (change) {
              const note = (report.changeNote || '').trim();
              change.hidden = !note;
              change.textContent = note;
            }
          }

          function question() {
            return QUESTIONS[step];
          }

          function renderStep() {
            const item = question();
            if (!item || !introOptions) return;
            if (introProgress) introProgress.textContent = (step + 1) + ' / ' + QUESTIONS.length;
            if (introTitle) introTitle.textContent = item.title;
            if (introSub) introSub.textContent = item.hint;
            const currentValue = draft[item.id];
            stepOrigin = item.multiple ? (currentValue || []).slice() : (currentValue || '');
            picked = item.multiple ? stepOrigin.slice() : [];
            introOptions.innerHTML = '';
            item.options.forEach((option) => {
              const button = document.createElement('button');
              button.type = 'button';
              button.className = 'profile-intro-option';
              button.textContent = option;
              const selected = item.multiple ? picked.includes(option) : draft[item.id] === option;
              button.classList.toggle('selected', selected);
              button.setAttribute('aria-pressed', selected ? 'true' : 'false');
              button.addEventListener('click', () => choose(option));
              introOptions.appendChild(button);
            });
            if (introNext) {
              introNext.hidden = !item.multiple;
              introNext.textContent = step === QUESTIONS.length - 1 ? '好了' : '下一题';
            }
            if (introBack) {
              introBack.hidden = step === 0 && !editing;
              introBack.textContent = step === 0 ? '返回' : '上一题';
            }
          }

          function choose(option) {
            const item = question();
            if (!item) return;
            if (!item.multiple) {
              draft[item.id] = option;
              advance();
              return;
            }
            const exclusive = item.exclusive;
            if (picked.includes(option)) picked = picked.filter((value) => value !== option);
            else if (option === exclusive) picked = [option];
            else {
              picked = picked.filter((value) => value !== exclusive);
              picked.push(option);
            }
            draft[item.id] = picked.slice();
            renderStep();
          }

          function commitStep(skipped) {
            const item = question();
            if (!item) return;
            if (skipped) {
              draft[item.id] = editing ? (item.multiple ? stepOrigin.slice() : stepOrigin) : (item.multiple ? [] : '');
              return;
            }
            if (item.multiple) draft[item.id] = picked.slice();
          }

          function advance() {
            commitStep(false);
            if (step >= QUESTIONS.length - 1) finishIntro();
            else {
              step += 1;
              renderStep();
            }
          }

          function finishIntro() {
            const report = ctx.storage.personalReport.get();
            const mode = editing && report.baseline ? 'edit' : 'first';
            const previous = report.current || blankAnswers();
            const changed = describeProfileChange(previous, draft);
            const note = mode === 'edit' ? (changed || report.changeNote) : '';
            ctx.storage.personalReport.saveAnswers(draft, mode, note);
            closeIntro();
            renderPersonalReport();
            ctx.events.emit('profile.updated', { source: 'intro' });
          }

          function openIntro(isEditing) {
            if (!intro) return;
            editing = isEditing;
            const report = ctx.storage.personalReport.get();
            draft = copyAnswers(isEditing ? (report.current || report.baseline) : null);
            step = 0;
            intro.hidden = false;
            renderStep();
          }

          function closeIntro() {
            if (intro) intro.hidden = true;
          }

          function showProfilePage() {
            if (homePage) homePage.style.display = "none";
            if (reportPage) reportPage.classList.remove("report-visible");
            if (aiPage) aiPage.classList.remove("ai-page-visible");
            profilePage.classList.add("profile-page-visible");
            loadProfileData();
          }

          function showProfileToast(message) {
            const toast = document.getElementById("toast");
            if (!toast) return;
            toast.textContent = message;
            toast.classList.add("show");
            window.clearTimeout(showProfileToast.timer);
            showProfileToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2400);
          }

          document.querySelectorAll("[data-nav]").forEach((item) => item.addEventListener("click", () => {
            if (item.dataset.nav === "我的") showProfilePage();
            if (item.dataset.nav === "首页" || item.dataset.nav === "情绪" || item.dataset.nav === "AI") profilePage.classList.remove("profile-page-visible");
          }));
          document.getElementById("profile-report-toggle")?.addEventListener("click", () => {
            const body = document.getElementById("profile-report-body");
            const toggle = document.getElementById("profile-report-toggle");
            if (!body || !toggle) return;
            const open = body.hidden;
            body.hidden = !open;
            toggle.setAttribute("aria-expanded", open ? "true" : "false");
          });
          document.getElementById("profile-help-button")?.addEventListener("click", () => showProfileToast("帮助与反馈功能开发中"));
          document.getElementById("profile-about-button")?.addEventListener("click", () => showProfileToast("Nuo v1.0.0 · 用温暖陪伴每一天"));
          document.getElementById("profile-report-edit")?.addEventListener("click", () => openIntro(true));
          introNext?.addEventListener("click", advance);
          introSkip?.addEventListener("click", () => {
            commitStep(true);
            if (step >= QUESTIONS.length - 1) finishIntro();
            else {
              step += 1;
              renderStep();
            }
          });
          introBack?.addEventListener("click", () => {
            if (step === 0) {
              closeIntro();
              return;
            }
            step -= 1;
            renderStep();
          });
          ctx.events.on('chat.userSaid', ({ text }) => {
            const report = ctx.storage.personalReport.get();
            if (!report.current) return;
            const update = applyChatSignal(report.current, text);
            if (!update) return;
            ctx.storage.personalReport.saveCurrent(update.answers, update.note);
            renderPersonalReport();
            ctx.events.emit('profile.updated', { source: 'chat' });
          });
          ctx.services.profile = { openIntroIfNeeded() { if (!ctx.storage.personalReport.isDone()) openIntro(false); } };
          document.getElementById("profile-logout-button")?.addEventListener("click", () => {
            if (!window.confirm("确定清除本机保存的所有记录吗？此操作无法撤销。")) return;
            if (ctx.services.auth) ctx.services.auth.logout();
            else { localStorage.clear(); window.location.reload(); }
          });
          loadProfileData();
        }());
  }
}
