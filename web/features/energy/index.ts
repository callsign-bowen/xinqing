// @ts-nocheck
/** 功能构件：energy。只通过 ctx 与外界通信，不 import 其它 features。 */
import type { AppContext } from '../../kernel/context'

export const energyFeature = {
  id: 'energy',
  init(ctx: AppContext) {
        (function initEnergyFeature() {
          const home = document.querySelector(".app");
          const crisisCard = document.getElementById("crisisCard");
          if (!home || !crisisCard || home.dataset.energyReady === "true") return;
          home.dataset.energyReady = "true";

          const style = document.createElement("style");
          style.textContent = `
            .energy-entry { display: flex; min-height: 64px; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 20px; color: var(--text); background: transparent; border: 1px solid color-mix(in srgb, var(--text) 30%, transparent); border-radius: 40px; cursor: pointer; }
            .energy-entry:hover { background: var(--soft); }
            .energy-entry-main { display: flex; align-items: center; gap: 10px; }
            .energy-entry-icon { display: inline-flex; width: 24px; height: 24px; color: var(--primary); }
            .energy-entry-icon svg { width: 24px; height: 24px; }
            .energy-entry-text { font-size: 15px; }
            .energy-entry-arrow { color: var(--text); font-size: 20px; opacity: .35; }
            .energy-modal { position: fixed; inset: 0; z-index: 100; display: none; align-items: center; justify-content: center; padding: 20px; background: rgba(0, 0, 0, .4); }
            .energy-modal.energy-visible { display: flex; }
            .energy-panel { width: 100%; max-width: 380px; max-height: 88vh; padding: 24px; overflow-y: auto; color: var(--text); background: var(--bg); border-radius: 24px; }
            .energy-title { margin: 0; color: var(--text); font-size: 18px; font-weight: 500; text-align: center; }
            .energy-options { display: flex; flex-direction: column; gap: 12px; margin-top: 20px; }
            .energy-option { display: flex; align-items: center; gap: 14px; width: 100%; padding: 16px; color: var(--text); background: var(--bg-card); border: 1px solid var(--line); border-radius: 20px; text-align: left; }
            .energy-option:hover { background: var(--soft); }
            .energy-option-icon { display: inline-flex; width: 28px; height: 28px; flex: 0 0 28px; color: var(--primary); }
            .energy-option-icon svg { width: 28px; height: 28px; }
            .energy-option-copy { flex: 1; }
            .energy-option-title { display: block; font-size: 15px; font-weight: 500; }
            .energy-option-desc { display: block; margin-top: 4px; color: var(--text); font-size: 12px; opacity: .6; }
            .energy-option-arrow { color: var(--text); opacity: .35; }
            .energy-footnote { margin: 8px 0 0; color: var(--text); font-size: 12px; text-align: center; opacity: .5; }
            .energy-score-subtitle { margin: 8px 0 0; color: var(--text); font-size: 13px; text-align: center; opacity: .5; }
            .energy-scores { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-top: 24px; }
            .energy-score { display: grid; width: 36px; height: 36px; justify-self: center; place-items: center; padding: 0; color: var(--text); background: transparent; border: 2px solid color-mix(in srgb, var(--text) 20%, transparent); border-radius: 50%; font-size: 13px; }
            .energy-score.energy-score-selected { color: #fff; background: var(--primary); border-color: var(--primary); }
            .energy-save { display: block; width: 100%; margin-top: 24px; padding: 12px; color: var(--bg); background: var(--primary); border: 0; border-radius: 40px; font-size: 15px; }
            .energy-note { margin: 12px 0 0; color: var(--text); font-size: 11px; text-align: center; opacity: .4; }
            .energy-night-title { text-align: left; }
            .energy-night-intro { margin: 8px 0 16px; color: var(--text); font-size: 14px; line-height: 1.6; opacity: .6; }
            .energy-night-field { display: block; width: 100%; height: 80px; margin-top: 16px; resize: none; padding: 10px 12px; color: var(--text); background: var(--bg-card); border: 1px solid var(--line); border-radius: 12px; outline: 0; font-size: 13px; line-height: 1.5; }
            .energy-night-save { display: block; width: 100%; margin-top: 20px; padding: 12px; color: var(--bg); background: var(--primary); border: 0; border-radius: 40px; font-size: 14px; }
          `;
          home.appendChild(style);

          crisisCard.className = "energy-entry";
          crisisCard.setAttribute("aria-label", "今日能量");
          crisisCard.setAttribute("role", "button");
          crisisCard.innerHTML = '<span class="energy-entry-main"><span class="energy-entry-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6V12L16 14" /><path d="M12 2V4" /><path d="M12 20V22" /><path d="M4.93 4.93L6.34 6.34" /><path d="M17.66 17.66L19.07 19.07" /><path d="M2 12H4" /><path d="M20 12H22" /></svg></span><span class="energy-entry-text">今日能量</span></span><span class="energy-entry-arrow">›</span>';

          const choiceModal = document.createElement("div");
          choiceModal.className = "energy-modal";
          choiceModal.innerHTML = '<div class="energy-panel" role="dialog" aria-modal="true"><h2 class="energy-title">今天想做什么？</h2><div class="energy-options"><button class="energy-option" data-energy-choice="score" type="button"><span class="energy-option-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6V12L16 14" /><path d="M12 2V4" /><path d="M12 20V22" /><path d="M4.93 4.93L6.34 6.34" /><path d="M17.66 17.66L19.07 19.07" /><path d="M2 12H4" /><path d="M20 12H22" /></svg></span><span class="energy-option-copy"><span class="energy-option-title">今日能量</span><span class="energy-option-desc">给今天的状态打个分</span></span><span class="energy-option-arrow">›</span></button><button class="energy-option" data-energy-choice="night" type="button"><span class="energy-option-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg></span><span class="energy-option-copy"><span class="energy-option-title">晚安仪式</span><span class="energy-option-desc">用感恩结束今天</span></span><span class="energy-option-arrow">›</span></button></div><p class="energy-footnote">选择一个，花1分钟照顾自己</p></div>';
          home.appendChild(choiceModal);

          const scoreModal = document.createElement("div");
          scoreModal.className = "energy-modal";
          scoreModal.innerHTML = '<div class="energy-panel" role="dialog" aria-modal="true"><h2 class="energy-title">今天你的能量值是多少？</h2><p class="energy-score-subtitle">1分最低 · 10分最高</p><div class="energy-scores"></div><button class="energy-save" type="button">保存</button><p class="energy-note">你的能量曲线可以在报告页查看</p></div>';
          home.appendChild(scoreModal);

          const nightModal = document.createElement("div");
          nightModal.className = "energy-modal";
          nightModal.innerHTML = '<div class="energy-panel" role="dialog" aria-modal="true"><h2 class="energy-title energy-night-title">晚安仪式</h2><p class="energy-night-intro">用三件小事，温柔地结束今天</p><textarea class="energy-night-field" data-night-field="gratitude" placeholder="写下让你心里一暖的小事..."></textarea><textarea class="energy-night-field" data-night-field="happy" placeholder="什么时候你笑了？..."></textarea><textarea class="energy-night-field" data-night-field="tomorrow" placeholder="哪怕是很小的事也可以..."></textarea><button class="energy-night-save" type="button">记录今天的晚安</button></div>';
          home.appendChild(nightModal);

          let selectedScore = 5;
          const scoreContainer = scoreModal.querySelector(".energy-scores");
          for (let score = 1; score <= 10; score += 1) {
            const button = document.createElement("button");
            button.className = `energy-score${score === selectedScore ? " energy-score-selected" : ""}`;
            button.type = "button";
            button.textContent = score;
            button.addEventListener("click", () => { selectedScore = score; scoreContainer.querySelectorAll(".energy-score").forEach((item) => item.classList.toggle("energy-score-selected", Number(item.textContent) === score)); });
            scoreContainer.appendChild(button);
          }

          function openEnergyPanel() { choiceModal.classList.add("energy-visible"); }
          function closeEnergyModal(modal) { modal.classList.remove("energy-visible"); }
          function openEnergyScore() { closeEnergyModal(choiceModal); scoreModal.classList.add("energy-visible"); }
          function openNightRitual() { closeEnergyModal(choiceModal); nightModal.classList.add("energy-visible"); }
          function showEnergyToast(message) { const toast = document.getElementById("toast"); if (!toast) return; toast.textContent = message; toast.classList.add("show"); window.clearTimeout(showEnergyToast.timer); showEnergyToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2400); }
          function saveEnergyScore() { const today = new Date().toISOString().slice(0, 10); const log = JSON.parse(localStorage.getItem("nuo_energy_log") || "[]"); log.push({ date: today, score: selectedScore }); localStorage.setItem("nuo_energy_log", JSON.stringify(log)); closeEnergyModal(scoreModal); showEnergyToast("已记录今天的能量 ✨"); }
          function saveNightRitual() { const fields = {}; nightModal.querySelectorAll("[data-night-field]").forEach((field) => { fields[field.dataset.nightField] = field.value.trim(); }); const today = new Date().toISOString().slice(0, 10); const log = JSON.parse(localStorage.getItem("nuo_night_log") || "[]"); log.push({ date: today, ...fields }); localStorage.setItem("nuo_night_log", JSON.stringify(log)); nightModal.querySelectorAll("textarea").forEach((field) => { field.value = ""; }); closeEnergyModal(nightModal); showEnergyToast("晚安，好梦"); }

          crisisCard.addEventListener("click", (event) => { event.stopImmediatePropagation(); openEnergyPanel(); }, { capture: true });
          choiceModal.querySelector('[data-energy-choice="score"]').addEventListener("click", openEnergyScore);
          choiceModal.querySelector('[data-energy-choice="night"]').addEventListener("click", openNightRitual);
          scoreModal.querySelector(".energy-save").addEventListener("click", saveEnergyScore);
          nightModal.querySelector(".energy-night-save").addEventListener("click", saveNightRitual);
          [choiceModal, scoreModal, nightModal].forEach((modal) => modal.addEventListener("click", (event) => { if (event.target === modal) closeEnergyModal(modal); }));
        }());
  }
}
