// @ts-nocheck
/** 功能构件：chatPage。只负责 AI 页的显示与隐藏；消息渲染和发送在 chatSessions。 */
import type { AppContext } from '../../kernel/context'

export const chatPageFeature = {
  id: 'chatPage',
  init(ctx: AppContext) {
        const aiPage = document.getElementById("page-ai");
        const homePage = document.querySelector(".app");
        const reportPage = document.getElementById("page-report");
        if (!aiPage) return;

        function showAIPage() {
          if (homePage) homePage.style.display = "none";
          if (reportPage) reportPage.classList.remove("report-visible");
          aiPage.classList.add("ai-page-visible");
        }

        function hideAIPage() {
          aiPage.classList.remove("ai-page-visible");
        }

        document.querySelectorAll("[data-nav]").forEach((item) => item.addEventListener("click", () => {
          if (item.dataset.nav === "AI") showAIPage();
          if (item.dataset.nav === "首页" || item.dataset.nav === "情绪") hideAIPage();
        }));
  }
}
