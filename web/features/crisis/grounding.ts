// @ts-nocheck
/** 功能构件：crisisGrounding。只通过 ctx 与外界通信，不 import 其它 features。 */
import type { AppContext } from '../../kernel/context'

export const crisisGroundingFeature = {
  id: 'crisisGrounding',
  init(ctx: AppContext) {
        (function initGroundingPractice() {
          const aiPage = document.getElementById("page-ai");
          const crisisPanel = aiPage?.querySelector(".crisis-panel");
          if (!aiPage || !crisisPanel || aiPage.dataset.groundingReady === "true") return;
          aiPage.dataset.groundingReady = "true";

          const groundingStyle = document.createElement("style");
          groundingStyle.textContent = `
            .grounding-option { display: flex; align-items: center; gap: 10px; width: 100%; padding: 11px 12px; color: var(--text); background: transparent; border: 1px solid color-mix(in srgb, var(--text) 10%, transparent); border-radius: 12px; text-align: left; transition: background-color .2s ease, transform .15s ease; }
            .grounding-option:hover { background: var(--soft); }
            .grounding-option:active { transform: scale(.98); }
            .grounding-option svg { width: 20px; height: 20px; flex: 0 0 20px; color: var(--primary); }
            .grounding-option-label { font-size: 13px; line-height: 1.45; }
            .grounding-modal { position: fixed; inset: 0; z-index: 100; display: none; align-items: center; justify-content: center; padding: 20px; background: rgba(0, 0, 0, .4); }
            .grounding-modal.grounding-visible { display: flex; }
            .grounding-panel { position: relative; display: flex; width: 100%; max-width: 400px; min-height: 480px; max-height: 88vh; align-items: center; justify-content: center; padding: 28px 24px; overflow-y: auto; color: var(--text); background: var(--bg); border-radius: 24px; }
            .grounding-close { position: absolute; top: 14px; left: 14px; display: grid; width: 32px; height: 32px; place-items: center; padding: 0; color: var(--text); background: transparent; border: 0; border-radius: 50%; font-size: 22px; opacity: .55; }
            .grounding-step, .grounding-complete { width: 100%; text-align: center; animation: grounding-fade .3s ease both; }
            .grounding-progress { margin: 0; color: var(--text); font-size: 12px; opacity: .4; }
            .grounding-number { margin: 18px 0 4px; color: var(--primary); font-size: 72px; font-weight: 300; line-height: 1; }
            .grounding-title { margin: 0; color: var(--text); font-size: 20px; font-weight: 500; line-height: 1.4; }
            .grounding-subtitle { margin: 8px 0 0; color: var(--text); font-size: 14px; line-height: 1.6; opacity: .6; }
            .grounding-input { display: block; width: 100%; margin-top: 16px; padding: 8px 0; color: var(--text); background: transparent; border: 0; border-bottom: 1px solid color-mix(in srgb, var(--text) 15%, transparent); outline: 0; font-size: 14px; text-align: center; }
            .grounding-input:focus { border-bottom-color: var(--primary); }
            .grounding-next, .grounding-back { margin-top: 20px; padding: 12px 32px; color: var(--bg); background: var(--primary); border: 0; border-radius: 40px; font-size: 14px; }
            .grounding-back { margin-top: 24px; }
            .grounding-complete-title { margin: 0; color: var(--primary); font-size: 30px; font-weight: 500; line-height: 1.3; }
            .grounding-complete-text { margin: 14px 0 0; color: var(--text); font-size: 15px; line-height: 1.8; }
            .grounding-note { margin: 14px 0 0; color: var(--text); font-size: 11px; opacity: .4; }
            @keyframes grounding-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
          `;
          aiPage.appendChild(groundingStyle);

          const option = document.createElement("button");
          option.className = "grounding-option";
          option.type = "button";
          option.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg><span class="grounding-option-label">应急接地练习</span>';
          crisisPanel.querySelector(".crisis-options")?.appendChild(option);

          const steps = [
            ["5", "找到 5 样你能看到的东西", "抬起头，环顾四周，不必走远", "我看到..."],
            ["4", "找到 4 样你能触摸到的东西", "感受它们的温度和质感", "我摸到..."],
            ["3", "找到 3 个你能听到的声音", "仔细听，远处或近处都可以", "我听到..."],
            ["2", "找到 2 样你能闻到的气味", "深呼吸，空气里有什么？", "我闻到..."],
            ["1", "找到 1 件你能为自己做的事", "此时此刻，你最需要的是什么？", "我需要..."]
          ];
          let currentStep = 0;
          const answers = [];
          const modal = document.createElement("div");
          modal.className = "grounding-modal";
          modal.setAttribute("aria-hidden", "true");
          modal.innerHTML = '<div class="grounding-panel" role="dialog" aria-modal="true" aria-label="应急接地练习"><button class="grounding-close" type="button" aria-label="关闭">×</button><div class="grounding-content"></div></div>';
          aiPage.appendChild(modal);
          const content = modal.querySelector(".grounding-content");

          function renderGroundingStep() {
            const step = steps[currentStep];
            content.innerHTML = `<div class="grounding-step"><p class="grounding-progress">${currentStep + 1}/5</p><div class="grounding-number">${step[0]}</div><h2 class="grounding-title">${step[1]}</h2><p class="grounding-subtitle">${step[2]}</p><input class="grounding-input" placeholder="${step[3]}" value="${answers[currentStep] || ""}"><button class="grounding-next" type="button">我找到了 ✓</button></div>`;
            content.querySelector(".grounding-next").addEventListener("click", nextGroundingStep);
          }

          function renderGroundingComplete() {
            content.innerHTML = '<div class="grounding-complete"><h2 class="grounding-complete-title">你做到了</h2><p class="grounding-complete-text">不管现在有多难，你都在努力照顾自己。这已经很棒了。</p><p class="grounding-note">你的回答已保存在本次记录中</p><button class="grounding-back" type="button">回到对话</button></div>';
            content.querySelector(".grounding-back").addEventListener("click", closeGrounding);
          }

          function openGrounding() {
            currentStep = 0;
            answers.length = 0;
            renderGroundingStep();
            modal.classList.add("grounding-visible");
            modal.setAttribute("aria-hidden", "false");
            document.body.style.overflow = "hidden";
          }

          function closeGrounding() {
            modal.classList.remove("grounding-visible");
            modal.setAttribute("aria-hidden", "true");
            document.body.style.overflow = "";
          }

          function nextGroundingStep() {
            const input = content.querySelector(".grounding-input");
            answers[currentStep] = input ? input.value.trim() : "";
            if (currentStep < steps.length - 1) { currentStep += 1; renderGroundingStep(); } else renderGroundingComplete();
          }

          function prevGroundingStep() {
            if (currentStep > 0) { currentStep -= 1; renderGroundingStep(); }
          }

          option.addEventListener("click", openGrounding);
          modal.querySelector(".grounding-close").addEventListener("click", closeGrounding);
          modal.addEventListener("click", (event) => { if (event.target === modal) closeGrounding(); });
          document.addEventListener("keydown", (event) => { if (event.key === "Escape" && modal.classList.contains("grounding-visible")) closeGrounding(); });
        }());
  }
}
