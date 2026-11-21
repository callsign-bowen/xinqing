// @ts-nocheck
/** 功能构件：onboarding。只通过 ctx 与外界通信，不 import 其它 features。 */
import type { AppContext } from '../../kernel/context'

export const onboardingFeature = {
  id: 'onboarding',
  init(ctx: AppContext) {
        (function initOnboarding() {
          const onboarding = document.getElementById("page-onboarding");
          const home = document.querySelector(".app");
          const ageRecommendations = {
            under18: { theme: "rose", mascot: "cat" },
            "18-25": { theme: "dawn", mascot: "dog" },
            "26-35": { theme: "blue", mascot: "astronaut" },
            over36: { theme: "rose", mascot: "cat" },
          };
          const mascotNames = { cat: "小猫", dog: "小狗", astronaut: "宇航员" };
          let selectedAge = "18-25";
          let selectedMascot = "dog";
          let recommended = ageRecommendations[selectedAge];
          let mascotManual = false;
          const show = (element, display) => { if (element) element.style.display = display; };
          const render = () => {
            recommended = ageRecommendations[selectedAge];
            if (!mascotManual) selectedMascot = recommended.mascot;
            const recommendedMascot = document.getElementById("onboarding-mascot-name");
            const icon = document.getElementById("onboarding-mascot-icon");
            if (recommendedMascot) recommendedMascot.textContent = mascotNames[selectedMascot] || "小猫";
            if (icon && ctx.services.mascot) icon.innerHTML = ctx.services.mascot.getFace("normal");
            document.querySelectorAll(".onboarding-age-btn").forEach((button) => button.classList.toggle("active", button.dataset.age === selectedAge));
          };
          window.showOnboarding = () => { show(onboarding, "flex"); show(home, "none"); render(); };
          window.selectAge = (age) => {
            if (!ageRecommendations[age]) return;
            selectedAge = age;
            mascotManual = false;
            selectedMascot = ageRecommendations[age].mascot;
            render();
          };
          const finish = () => {
            const theme = localStorage.getItem("nuo_theme") || "mono";
            localStorage.setItem("nuo_onboarding_done", "true");
            localStorage.setItem("nuo_user_age_group", selectedAge);
            localStorage.setItem("nuo_theme", theme);
            localStorage.setItem("nuo_mascot", selectedMascot);
            document.documentElement.dataset.theme = theme;
            ctx.services.mascot?.apply(selectedMascot, { applyTheme: false });
            show(onboarding, "none");
            show(home, "flex");
            ctx.services.profile?.openIntroIfNeeded();
          };
          window.skipOnboarding = finish;
          window.startApp = finish;
          document.querySelectorAll(".onboarding-age-btn").forEach((button) => button.addEventListener("click", () => window.selectAge(button.dataset.age)));
          document.getElementById("onboarding-skip")?.addEventListener("click", window.skipOnboarding);
          document.getElementById("onboarding-start")?.addEventListener("click", window.startApp);
          function enterApp() {
            if (localStorage.getItem("nuo_onboarding_done") === "true") { show(home, "flex"); ctx.services.profile?.openIntroIfNeeded(); }
            else window.showOnboarding();
          }
          window.setTimeout(() => {
            const splash = document.getElementById("splash-screen");
            if (!splash) return;
            splash.classList.add("splash-fade-out");
            splash.addEventListener("transitionend", async () => {
              splash.style.display = "none";
              if (ctx.services.auth?.whenReady) await ctx.services.auth.whenReady();
              if (ctx.services.auth && !ctx.services.auth.isLoggedIn()) {
                ctx.services.auth.openGate();
                return;
              }
              enterApp();
            }, { once: true });
          }, 2500);
        }());
  }
}
