// @ts-nocheck
/** 功能构件：shellTheme。只通过 ctx 与外界通信，不 import 其它 features。 */
import type { AppContext } from '../../kernel/context'
import { DEFAULT_NICKNAME } from '../../kernel/nickname.ts'
import './palettes.css'

export const shellThemeFeature = {
  id: 'shellTheme',
  init(ctx: AppContext) {
        const root = document.documentElement;
        const emotionFace = document.getElementById("emotionFace");
        const dateText = document.getElementById("dateText");
        const greetingText = document.getElementById("greetingText");
        const toast = document.getElementById("toast");
        let toastTimer;

        const themes = {
          mono: ['纯白', '#FFFFFF'],
          rose: ['樱花粉', '#FAEFF1'],
          dawn: ['奶油杏', '#FBF3E8'],
          honey: ['晴光黄', '#FCF6DF'],
          lilac: ['浅藤紫', '#F3EFF9'],
          mist: ['青芽绿', '#EEF5EC'],
          blue: ['星空蓝', '#EDF3FA'],
          night: ['夜阑', '#1C1C1E'],
        };
        const themeIcons = {
          mono: '<circle cx="12" cy="12" r="7"/>',
          rose: '<path d="M12 20S3 15 3 8.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 9 1.5C21 15 12 20 12 20Z"/>',
          dawn: '<circle cx="12" cy="12" r="4"/><path d="M12 2V4M12 20V22M4.93 4.93L6.34 6.34M17.66 17.66L19.07 19.07M2 12H4M20 12H22M4.93 19.07L6.34 17.66M17.66 6.34L19.07 4.93"/>',
          honey: '<circle cx="12" cy="12" r="7"/><path d="M9 10H9.01M15 10H15.01M9 14Q12 17 15 14"/>',
          lilac: '<path d="M12 3 14.5 9.5 21 12 14.5 14.5 12 21 9.5 14.5 3 12 9.5 9.5Z"/>',
          mist: '<path d="M5 19C3 7 11 3 20 4c0 10-4 16-12 14M5 21 16 9"/>',
          blue: '<circle cx="12" cy="12" r="6"/><ellipse cx="12" cy="12" rx="11" ry="3.5" transform="rotate(-30 12 12)"/>',
          night: '<path d="M20 14A8 8 0 0 1 10 4a8.5 8.5 0 1 0 10 10Z"/>',
        };
        const themeButton = document.getElementById('themeButton');
        const themeIcon = document.getElementById('themeIcon');
        let selectedTheme = localStorage.getItem('nuo_theme') || 'mono';
        if (!themes[selectedTheme]) selectedTheme = 'mono';
        function paintTheme() {
          if(root.dataset.theme!==selectedTheme)root.dataset.theme = selectedTheme;
          localStorage.setItem('nuo_theme',selectedTheme);
          document.querySelector('meta[name="theme-color"]')?.setAttribute('content',themes[selectedTheme][1]);
          document.querySelectorAll('[data-nuo-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.nuoTheme===selectedTheme)));
          if (themeIcon) themeIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + themeIcons[selectedTheme] + '</svg>';
          themeButton?.setAttribute('aria-label', '切换配色，当前：' + themes[selectedTheme][0]);
          themeButton?.setAttribute('title', '当前配色：' + themes[selectedTheme][0] + '，点击切换');
        }
        themeButton?.addEventListener('click', () => {
          const order = Object.keys(themes);
          selectedTheme = order[(order.indexOf(selectedTheme) + 1) % order.length];
          paintTheme();
          ctx.events.emit('theme.changed', { theme: selectedTheme });
        });
        new MutationObserver(()=>{if(themes[root.dataset.theme]){selectedTheme=root.dataset.theme;paintTheme();}}).observe(root,{attributes:true,attributeFilter:['data-theme']});

        function updateDateAndGreeting() {
          const now = new Date();
          const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
          const hour = now.getHours();
          const greeting = hour >= 6 && hour < 12 ? "早上好" : hour >= 12 && hour < 18 ? "下午好" : "晚上好";
          dateText.textContent = `${now.getMonth() + 1}月${now.getDate()}日 · ${weekdays[now.getDay()]}`;
          greetingText.textContent = `${greeting}，${ctx.storage.nickname.get() || DEFAULT_NICKNAME}`;
        }

        function showToast(message) {
          toast.textContent = message;
          toast.classList.add("show");
          window.clearTimeout(toastTimer);
          toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2400);
        }

        document.querySelectorAll("[data-emotion]").forEach((button) => {
          button.addEventListener("click", () => {
            document.querySelectorAll("[data-emotion]").forEach((item) => item.classList.remove("active"));
            button.classList.add("active");
            emotionFace.classList.remove("pop");
            void emotionFace.offsetWidth;
            ctx.services.mascot?.updateEmotions();
            emotionFace.classList.add("pop");
          });
        });

        document.getElementById("recordButton").addEventListener("click", () => showToast("已记录你的心情"));
        document.getElementById("recordMainButton").addEventListener("click", () => showToast("已记录你的心情"));
        document.getElementById("aiMainButton")?.addEventListener("click", () => showToast("AI功能开发中"));
        function jumpToAiWithNote() {
          const note = (document.getElementById("emotionNote") || { value: "" }).value.trim();
          const home = document.querySelector(".app");
          const report = document.getElementById("page-report");
          const aiPage = document.getElementById("page-ai");
          if (home) home.style.display = "none";
          if (report) report.classList.remove("report-visible");
          if (aiPage) aiPage.classList.add("ai-page-visible");
          document.querySelectorAll("[data-nav]").forEach((n) => n.classList.toggle("active", n.dataset.nav === "AI"));
          const input = document.getElementById("ai-input");
          if (input) {
            input.value = note;
            input.focus();
            if (note) {
              const send = document.getElementById("ai-send");
              if (send) send.click();
            }
          }
        }
        document.getElementById("aiCard").addEventListener("click", jumpToAiWithNote);
        document.getElementById("aiCard").addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); jumpToAiWithNote(); }
        });
        document.getElementById("crisisCard").addEventListener("click", () => showToast("心理援助热线：12355（全国） / 400-161-9995（希望24）"));
        document.getElementById("crisisLink").addEventListener("click", (event) => {
          event.stopPropagation();
          showToast("心理援助热线：12355（全国） / 400-161-9995（希望24）");
        });
        document.getElementById("crisisLink").addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            showToast("心理援助热线：12355（全国） / 400-161-9995（希望24）");
          }
        });

        document.querySelectorAll("[data-nav]").forEach((item) => {
          item.addEventListener("click", () => {
            document.querySelectorAll("[data-nav]").forEach((navItem) => navItem.classList.remove("active"));
            item.classList.add("active");
          });
        });

        paintTheme();
        updateDateAndGreeting();
        ctx.events.on('account.nicknameChanged', updateDateAndGreeting);
        ctx.events.on('auth.loggedIn', updateDateAndGreeting);
        ctx.events.on('auth.loggedOut', updateDateAndGreeting);
        window.addEventListener('storage', updateDateAndGreeting);
        ctx.services.auth?.whenReady().then(updateDateAndGreeting);
        ctx.services.mascot?.updateEmotions();
  }
}
