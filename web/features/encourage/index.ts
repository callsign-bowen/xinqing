// @ts-nocheck
/** 功能构件：encourage。只通过 ctx 与外界通信，不 import 其它 features。 */
import type { AppContext } from '../../kernel/context'
import { dailyEncouragement, shanghaiDay } from './calendar'

export const encourageFeature = {
  id: 'encourage',
  init(ctx: AppContext) {
        (function initDailyEncourage() {
          const home = document.querySelector(".app");
          const oldEntry = document.getElementById("crisisCard");
          if (!home || !oldEntry || home.dataset.encourageReady === "true") return;
          home.dataset.encourageReady = "true";


          const style = document.createElement("style");
          style.textContent = `
            .encourage-modal { position: fixed; inset: 0; z-index: 120; display: none; align-items: center; justify-content: center; padding: 20px; background: rgba(0, 0, 0, .4); }
            .encourage-modal.encourage-visible { display: flex; }
            .encourage-card { width: 100%; max-width: 380px; padding: 32px; color: var(--text); background: var(--bg); border-radius: 24px; text-align: center; }
            .encourage-cat { display: block; width: 72px; height: 72px; margin: 0 auto; overflow: hidden; }
            .encourage-cat img { display: block; width: 72px; height: 72px; object-fit: contain; }
            .encourage-message { margin: 20px 0 0; color: var(--text); font-size: 20px; font-weight: 400; line-height: 1.6; }
            .encourage-signature { margin: 16px 0 0; color: var(--text); font-size: 12px; opacity: .5; }
            .encourage-confirm { margin-top: 16px; padding: 8px 32px; color: var(--bg); background: var(--primary); border: 0; border-radius: 40px; font-size: 14px; }
          `;
          home.appendChild(style);

          const entry = oldEntry.cloneNode(true);
          entry.id = "encourage-entry";
          entry.className = "energy-entry";
          entry.setAttribute("aria-label", "今日鼓励");
          entry.innerHTML = '<span class="energy-entry-main"><span class="energy-entry-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6V12L16 14"/><path d="M12 2V4"/><path d="M12 20V22"/><path d="M4.93 4.93L6.34 6.34"/><path d="M17.66 17.66L19.07 19.07"/><path d="M2 12H4"/><path d="M20 12H22"/></svg></span><span class="energy-entry-text">今日鼓励</span></span><span class="energy-entry-arrow">›</span>';
          oldEntry.replaceWith(entry);

          document.querySelectorAll(".energy-modal").forEach((modal) => { modal.style.display = "none"; modal.removeAttribute("aria-hidden"); });

          const modal = document.createElement("div");
          modal.className = "encourage-modal";
          modal.setAttribute("aria-hidden", "true");
          const face40 = ctx.services.mascot?.getFace("normal") || '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 16 L6 6 L16 12"/><path d="M30 16 L34 6 L24 12"/><ellipse cx="20" cy="22" rx="13" ry="11" transform="rotate(-6 20 22)"/><path d="M13 20 Q15 18 17 20"/><path d="M23 20 Q25 18 27 20"/><path d="M19 24 L21 24 L20 25.5 Z" fill="currentColor" stroke="none"/></svg>';
          modal.innerHTML = '<div class="encourage-card" role="dialog" aria-modal="true" aria-label="今日鼓励"><span class="encourage-cat" aria-hidden="true">' + face40 + '</span><p class="encourage-message"></p><p class="encourage-signature">—— 来自Nuo · 今日份温柔</p><button class="encourage-confirm" type="button">收到</button></div>';
          home.appendChild(modal);
          const messageElement = modal.querySelector(".encourage-message");

          const LINE_KEY = "nuo_encourage_line";

          function todayMessage() {
            const selected = dailyEncouragement();
            try { localStorage.setItem(LINE_KEY, JSON.stringify(selected)); } catch { /* Date selection works without browser storage. */ }
            return selected.text;
          }
          function openEncourageModal() {
            messageElement.textContent = todayMessage();
            modal.classList.add("encourage-visible");
            modal.setAttribute("aria-hidden", "false");
          }
          function closeEncourageModal(markSeen) {
            if (markSeen) { try { localStorage.setItem("nuo_encourage_date", shanghaiDay()); } catch { /* Keep the modal usable when storage is blocked. */ } }
            modal.classList.remove("encourage-visible");
            modal.setAttribute("aria-hidden", "true");
          }
          function showDailyEncourage() {
            try { if (localStorage.getItem("nuo_encourage_date") !== shanghaiDay()) openEncourageModal(); } catch { openEncourageModal(); }
          }

          entry.addEventListener("click", (event) => { event.preventDefault(); event.stopImmediatePropagation(); openEncourageModal(); }, { capture: true });
          modal.querySelector(".encourage-confirm").addEventListener("click", () => closeEncourageModal(true));
          modal.addEventListener("click", (event) => { if (event.target === modal) closeEncourageModal(false); });
          showDailyEncourage();
        }());
  }
}

