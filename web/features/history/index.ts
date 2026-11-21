// @ts-nocheck
/** 功能构件：history。只通过 ctx 与外界通信，不 import 其它 features。 */
import type { AppContext } from '../../kernel/context'
import { retainModalBackground } from '../../ui/modalBackground'

export const historyFeature = {
  id: 'history',
  init(ctx: AppContext) {
        (function initHistoryFeature() {
          const historyRecords = [];
          const historyEmotionIcons = {
            平静: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="13" rx="9" ry="8"/><path d="M5 8 L3 3 L9 6"/><path d="M19 8 L21 3 L15 6"/><path d="M8 11Q9.5 9.5 10 11"/><path d="M14 11Q15.5 9.5 16 11"/><path d="M11 15 L13 15 L12 16.5 Z" fill="currentColor" stroke="none"/><path d="M9 17Q12 19 15 17"/><circle cx="7" cy="15" r="1.5" fill="currentColor" stroke="none" opacity="0.3"/><circle cx="17" cy="15" r="1.5" fill="currentColor" stroke="none" opacity="0.3"/></svg>',
            焦虑: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="13" rx="9" ry="8"/><path d="M5 8 L3 3 L9 6"/><path d="M19 8 L21 3 L15 6"/><circle cx="9" cy="11" r="3" fill="currentColor" stroke="none" opacity="0.15"/><circle cx="15" cy="11" r="3" fill="currentColor" stroke="none" opacity="0.15"/><circle cx="9" cy="11" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="11" r="1.5" fill="currentColor" stroke="none"/><path d="M11 15 L13 15 L12 16.5 Z" fill="currentColor" stroke="none"/><path d="M8 17Q10 15.5 12 17Q14 18.5 16 17"/><path d="M20 6L21 9L22 6L21 4L20 6Z" fill="currentColor" stroke="none" opacity="0.4"/></svg>',
            开心: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="13" rx="9" ry="8"/><path d="M5 8 L3 3 L9 6"/><path d="M19 8 L21 3 L15 6"/><path d="M7 11Q9 9 10 11"/><path d="M14 11Q16 9 17 11"/><path d="M11 15 L13 15 L12 16.5 Z" fill="currentColor" stroke="none"/><path d="M8 15Q12 20 16 15"/><circle cx="7" cy="15" r="2" fill="currentColor" stroke="none" opacity="0.25"/><circle cx="17" cy="15" r="2" fill="currentColor" stroke="none" opacity="0.25"/></svg>',
            疲惫: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="13" rx="9" ry="8"/><path d="M5 8 L3 3 L9 6"/><path d="M19 8 L21 3 L15 6"/><path d="M7 11Q9 11.5 10 11"/><path d="M14 11Q16 11.5 17 11"/><path d="M5 9L7 10.5"/><path d="M19 9L17 10.5"/><path d="M11 15 L13 15 L12 16.5 Z" fill="currentColor" stroke="none"/><ellipse cx="12" cy="18" rx="2.5" ry="1.5"/><path d="M6 13Q9 14 10 13"/><path d="M14 13Q17 14 18 13"/></svg>'
          };
          const emotionCardTop = document.querySelector(".emotion-card-top");
          if (!emotionCardTop || document.getElementById("history-entry")) return;

          const historyEntry = document.createElement("button");
          historyEntry.id = "history-entry";
          historyEntry.className = "history-entry";
          historyEntry.type = "button";
          historyEntry.setAttribute("aria-label", "打开日记本");
          historyEntry.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4H20V20H4V4Z"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="14" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg><span>日记本</span>';
          emotionCardTop.appendChild(historyEntry);

          const modal = document.createElement("div");
          modal.id = "history-modal";
          modal.className = "history-modal";
          modal.setAttribute("aria-hidden", "true");
          modal.innerHTML = '<div class="history-panel" role="dialog" aria-modal="true" aria-labelledby="history-title"><div class="history-header"><h2 class="history-title" id="history-title">日记本</h2><button class="history-close" type="button" aria-label="关闭">×</button></div><div class="history-list"></div></div>';
          document.body.appendChild(modal);
          const historyList = modal.querySelector(".history-list");

          historyList.innerHTML = historyRecords.map((record) => `<article class="history-item"><span class="history-emotion-icon" aria-hidden="true">${historyEmotionIcons[record.emotion]}</span><div class="history-item-body"><p class="history-date">${record.date} · ${record.emotion}</p><p class="history-text">${record.text}</p></div></article>`).join("");

          function openHistory() {
            modal.classList.add("history-modal-visible");
            modal.setAttribute("aria-hidden", "false");
          }
          function closeHistory() {
            modal.classList.remove("history-modal-visible");
            modal.setAttribute("aria-hidden", "true");
          }

          historyEntry.addEventListener("click", openHistory);
          modal.querySelector(".history-close").addEventListener("click", closeHistory);
          modal.addEventListener("click", (event) => { if (event.target === modal) closeHistory(); });
          let wasOpen = false, releaseBackground = null;
          new MutationObserver(() => {
            const open = modal.classList.contains('history-modal-visible');
            if (open === wasOpen) return;
            wasOpen = open;
            if (open) {
              releaseBackground = retainModalBackground(modal);
              modal.querySelector('.history-close')?.focus({ preventScroll: true });
            } else {
              releaseBackground?.(); releaseBackground = null;
            }
          }).observe(modal, { attributes: true, attributeFilter: ['class'] });
          document.addEventListener("keydown", (event) => {
            if (!modal.classList.contains('history-modal-visible')) return;
            const lightbox = document.querySelector('.image-lightbox-visible');
            if (event.key === 'Escape') { if (lightbox) lightbox.classList.remove('image-lightbox-visible'); else closeHistory(); return; }
            if (event.key !== 'Tab' || lightbox) return;
            const targets = [...modal.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),[contenteditable="true"],[tabindex="0"],summary,a[href]')].filter(node => node.getClientRects().length && !node.closest('[inert]'));
            const first = targets[0], last = targets[targets.length-1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          });
        }());
  }
}
