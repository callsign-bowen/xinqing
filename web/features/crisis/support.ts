// @ts-nocheck
/** 功能构件：crisisSupport。只通过 ctx 与外界通信，不 import 其它 features。 */
import type { AppContext } from '../../kernel/context'

export const crisisSupportFeature = {
  id: 'crisisSupport',
  init(ctx: AppContext) {
        (function initCrisisSupport() {
          const aiPage = document.getElementById("page-ai");
          if (!aiPage || aiPage.dataset.crisisReady === "true") return;
          aiPage.dataset.crisisReady = "true";

          const crisisStyle = document.createElement("style");
          crisisStyle.textContent = `
            .ai-action-row { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin: 0 0 10px 4px; min-height: 32px; }
            .crisis-button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; height: 32px; padding: 0 4px; color: var(--text); background: transparent; border: 0; font-size: 13px; line-height: 1; opacity: .6; transition: opacity .2s ease, transform .15s ease; }
            .crisis-button:hover, .crisis-button:focus-visible { opacity: 1; }
            .crisis-button:active, .crisis-option:active { transform: scale(.98); }
            .crisis-button svg { width: 18px; height: 18px; flex: 0 0 18px; display: block; }
            .crisis-button span { line-height: 1; }
            .crisis-panel { position: relative; display: none; padding: 16px; color: var(--text); background: color-mix(in srgb, var(--bg-card) 95%, transparent); border: 1px solid var(--line); border-radius: 20px; opacity: 0; transform: translateY(-8px); transition: opacity .25s ease, transform .25s ease; }
            .crisis-panel.crisis-panel-visible { display: block; opacity: 1; transform: translateY(0); }
            .crisis-panel-close { position: absolute; top: 8px; right: 8px; z-index: 1; display: grid; width: 32px; height: 32px; place-items: center; padding: 0; color: var(--text); background: transparent; border: 0; border-radius: 50%; font-size: 22px; line-height: 1; cursor: pointer; }
            .crisis-panel-title { margin: 0; padding-right: 28px; font-size: 16px; font-weight: 500; }
            .crisis-panel-subtitle { margin: 6px 0 14px; color: var(--text); font-size: 12px; line-height: 1.6; opacity: .65; }
            .crisis-options { display: flex; flex-direction: column; gap: 8px; }
            .crisis-option { display: flex; align-items: center; gap: 10px; width: 100%; padding: 11px 12px; color: var(--text); background: transparent; border: 1px solid color-mix(in srgb, var(--text) 10%, transparent); border-radius: 12px; text-align: left; transition: background-color .2s ease, transform .15s ease; }
            .crisis-option:hover { background: var(--soft); }
            .crisis-option svg { width: 20px; height: 20px; flex: 0 0 20px; color: var(--primary); }
            .crisis-option-label { flex: 1; font-size: 13px; line-height: 1.45; }
            .crisis-hotline-modal { position: fixed; inset: 0; z-index: 90; display: none; align-items: center; justify-content: center; padding: 20px; background: rgba(0, 0, 0, .4); }
            .crisis-hotline-modal.crisis-hotline-visible { display: flex; }
            .crisis-hotline-panel { width: 100%; max-width: 400px; padding: 20px; color: var(--text); background: var(--bg); border-radius: 20px; }
            .crisis-hotline-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
            .crisis-hotline-title { margin: 0; font-size: 17px; font-weight: 500; }
            .crisis-hotline-close { padding: 4px; color: var(--text); background: transparent; border: 0; font-size: 22px; opacity: .55; }
            .crisis-hotline-list { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
            .crisis-hotline { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 0; color: var(--text); background: transparent; border: 0; border-bottom: 1px solid var(--line); text-align: left; }
            .crisis-hotline svg { width: 20px; height: 20px; flex: 0 0 20px; color: var(--primary); }
            .crisis-hotline-name { flex: 1; font-size: 12px; line-height: 1.45; }
            .crisis-hotline-number { color: var(--primary); font-size: 13px; white-space: nowrap; }
            .crisis-letter-modal { position: fixed; inset: 0; z-index: 90; display: none; align-items: center; justify-content: center; padding: 20px; background: rgba(0, 0, 0, .4); }
            .crisis-letter-modal.crisis-letter-visible { display: flex; }
            .crisis-letter-panel { width: 100%; max-width: 400px; padding: 20px; color: var(--text); background: var(--bg); border-radius: 20px; }
            .crisis-letter-title { margin: 0 0 12px; font-size: 17px; font-weight: 500; }
            .crisis-letter-input { display: block; width: 100%; min-height: 140px; resize: vertical; padding: 12px; color: var(--text); background: var(--bg-card); border: 1px solid var(--line); border-radius: 12px; outline: 0; font-size: 14px; line-height: 1.6; }
            .crisis-letter-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
            .crisis-letter-button { padding: 8px 14px; color: var(--text); background: transparent; border: 1px solid var(--line); border-radius: 10px; font-size: 12px; }
            .crisis-letter-save { color: var(--bg); background: var(--primary); border-color: var(--primary); }
            .crisis-soothe-modal { position: fixed; inset: 0; z-index: 200; display: none; align-items: center; justify-content: center; padding: 24px; background: rgba(0, 0, 0, .45); }
            .crisis-soothe-modal.crisis-soothe-visible { display: flex; }
            .crisis-soothe-card { position: relative; display: flex; width: min(360px, 100%); flex-direction: column; align-items: center; padding: 48px 24px 36px; color: var(--text); background: var(--bg); border-radius: 24px; text-align: center; }
            .crisis-soothe-close { position: absolute; top: 10px; right: 10px; display: grid; width: 36px; height: 36px; place-items: center; padding: 0; color: var(--text); background: transparent; border: 0; border-radius: 50%; font-size: 26px; line-height: 1; cursor: pointer; }
            .crisis-soothe-orb { width: 128px; height: 128px; margin: 8px 0 22px; background: color-mix(in srgb, var(--primary) 62%, transparent); border-radius: 50%; animation: crisis-soothe-breath 8s ease-in-out infinite; }
            .crisis-soothe-phase { margin: 0; font-size: 22px; font-weight: 500; }
            .crisis-soothe-hint { margin: 10px 0 0; color: var(--text); font-size: 13px; line-height: 1.6; opacity: .6; }
            @keyframes crisis-soothe-breath { 0%, 100% { transform: scale(.68); } 50% { transform: scale(1); } }
          `;
          aiPage.appendChild(crisisStyle);

          const messages = aiPage.querySelector("#ai-messages");
          const inputArea = aiPage.querySelector(".ai-input-area");
          const headerActions = aiPage.querySelector(".ai-header-actions");
          if (!messages || !inputArea) return;

          const actionRow = document.createElement("div");
          actionRow.className = "ai-action-row";
          const crisisButton = document.createElement("button");
          crisisButton.className = "crisis-button";
          crisisButton.type = "button";
          crisisButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg><span>需要帮助</span>';
          actionRow.appendChild(crisisButton);
          if (headerActions) headerActions.appendChild(actionRow);
          else inputArea.insertBefore(actionRow, inputArea.firstChild);

          const panel = document.createElement("section");
          panel.className = "crisis-panel";
          panel.innerHTML = '<button class="crisis-panel-close" type="button" aria-label="关闭">×</button><h2 class="crisis-panel-title">这里有人听你说</h2><p class="crisis-panel-subtitle">如果你现在很难受，下面的资源或许可以帮到你。</p><div class="crisis-options"><button class="crisis-option" data-crisis-action="hotline" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg><span class="crisis-option-label">此时此刻，你需要倾诉</span></button><button class="crisis-option" data-crisis-action="letter" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="14" y2="12" /><line x1="8" y1="16" x2="12" y2="16" /></svg><span class="crisis-option-label">给自己写一封安抚信</span></button><button class="crisis-option" data-crisis-action="breathe" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4l2 2" /></svg><span class="crisis-option-label">即时安抚引导</span></button></div>';
          messages.parentNode.insertBefore(panel, messages.nextSibling);

          const hotlineModal = document.createElement("div");
          hotlineModal.className = "crisis-hotline-modal";
          hotlineModal.innerHTML = '<div class="crisis-hotline-panel" role="dialog" aria-modal="true"><div class="crisis-hotline-header"><h3 class="crisis-hotline-title">心理援助热线</h3><button class="crisis-hotline-close" type="button" aria-label="关闭">×</button></div><div class="crisis-hotline-list"><a class="crisis-hotline" href="tel:4001619995"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg><span class="crisis-hotline-name">全国希望24热线<br>（24小时）</span><span class="crisis-hotline-number">400-161-9995</span></a><a class="crisis-hotline" href="tel:12355"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg><span class="crisis-hotline-name">全国心理援助热线<br>（24小时）</span><span class="crisis-hotline-number">12355</span></a><a class="crisis-hotline" href="tel:01082951332"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg><span class="crisis-hotline-name">北京心理援助中心</span><span class="crisis-hotline-number">010-82951332</span></a></div></div>';
          aiPage.appendChild(hotlineModal);

          // ---- 省级本地心理援助热线：前端内置（已验证）+ localStorage 记住选择 ----
          const regionStyle = document.createElement("style");
          regionStyle.textContent = `
            .crisis-hotline-province { margin: 0 4px 14px; }
            .crisis-hotline-province-label { display: block; margin-bottom: 8px; color: var(--text); font-size: 12px; opacity: .7; }
            .crisis-hotline-region { width: 100%; padding: 10px 12px; color: var(--text); background: var(--bg); border: 1px solid color-mix(in srgb, var(--text) 16%, transparent); border-radius: 12px; font-size: 14px; outline: 0; }
            .crisis-hotline-province-tip { margin: 8px 2px 0; color: var(--text); font-size: 11px; line-height: 1.55; opacity: .55; }
            .crisis-hotline-local-title { margin: 2px 4px 6px; color: var(--text); font-size: 11px; font-weight: 600; letter-spacing: .04em; opacity: .5; }
            .crisis-hotline-local { display: flex; flex-direction: column; gap: 10px; margin: 0 0 14px; }
            .crisis-hotline-tip { margin: 0 4px; color: var(--text); font-size: 12px; line-height: 1.6; opacity: .6; }
            .crisis-hotline-note { display: block; margin-top: 4px; font-size: 11px; line-height: 1.5; opacity: .55; }`;
          aiPage.appendChild(regionStyle);

          const REGION_HOTLINES = {
            "北京": [{ name: "北京心理危机研究与干预中心热线", phone: "010-82951332", hours: "24小时", note: "手机拨打 010-82951332；座机 800-8101117" }, { name: "北京市8858心理援助热线", phone: "010-88585821", hours: "8:30-17:30", note: "北京市卫生健康委主办" }],
            "天津": [{ name: "天津市心理援助热线", phone: "022-8818 8858", hours: "24小时", note: "天津市安定医院主办" }],
            "河北": [{ name: "河北省心理援助热线", phone: "0312-96312", hours: "24小时", note: "河北省精神卫生中心" }],
            "山西": [{ name: "山西省心理援助热线", phone: "0351-8726199", hours: "24小时", note: "太原市精神病医院" }],
            "内蒙古": [{ name: "内蒙古12320-5心理援助热线", phone: "0471-12320转5", hours: "24小时", note: "内蒙古自治区精神卫生中心" }],
            "辽宁": [{ name: "辽宁省心理援助热线", phone: "024-96687", hours: "24小时", note: "辽宁省精神卫生中心；沈阳市 024-23813000" }],
            "吉林": [{ name: "长春市心理援助热线", phone: "0431-8968 5000", hours: "24小时", note: "长春市第六医院；也可 0431-12320转6" }],
            "黑龙江": [{ name: "哈尔滨市心理暖助热线", phone: "0451-82480130", hours: "24小时", note: "哈尔滨市第一专科医院" }],
            "上海": [{ name: "上海市心理援助热线", phone: "021-962525", hours: "24小时", note: "上海市精神卫生中心" }],
            "江苏": [{ name: "江苏省心理危机干预热线", phone: "025-83712977", hours: "24小时", note: "南京脑科医院（江苏省精神卫生中心）；也可 025-12320转5" }],
            "浙江": [{ name: "杭州市心理危机热线", phone: "0571-85029595", hours: "24小时", note: "杭州市第七人民医院" }],
            "安徽": [{ name: "安徽省心理危机干预热线", phone: "0551-63666903", hours: "24小时", note: "安徽省卫健委、合肥市第四人民医院" }],
            "福建": [{ name: "福建省心理援助热线", phone: "0591-8566 6661", hours: "24小时", note: "福建省福州神经精神病防治院" }],
            "江西": [{ name: "江西省心理援助热线", phone: "12356", hours: "24小时", note: "全国统一热线，江西省已接入" }],
            "山东": [{ name: "山东省精神卫生中心心理援助热线", phone: "0531-86336666", hours: "17:30-21:00（工作日）", note: "其余时段请拨打 12356" }],
            "河南": [{ name: "河南省心理援助热线", phone: "0373-7095888", hours: "24小时", note: "河南省精神卫生中心" }],
            "湖北": [{ name: "武汉市民热线-心理卫生热线", phone: "027-12320转3", hours: "24小时", note: "武汉市精神卫生中心" }],
            "湖南": [{ name: "长沙市心理援助热线", phone: "0731-85501010", hours: "24小时", note: "长沙市第九医院" }],
            "广东": [{ name: "广州市心理援助热线", phone: "020-81899120", hours: "24小时", note: "广州医科大学附属脑科医院" }, { name: "深圳市心理危机干预热线", phone: "400-9959-959", hours: "24小时", note: "深圳康宁医院" }],
            "广西": [{ name: "广西心理援助热线", phone: "0772-3136120", hours: "24小时", note: "广西壮族自治区脑科医院" }],
            "海南": [{ name: "海南省心理援助热线", phone: "0898-96363", hours: "24小时", note: "海南省安宁医院" }],
            "重庆": [{ name: "重庆市96320心理健康服务热线", phone: "023-96320转1", hours: "24小时", note: "重庆市精神卫生中心" }],
            "四川": [{ name: "成都市心理援助热线", phone: "028-96008", hours: "24小时", note: "成都市第四人民医院" }],
            "贵州": [{ name: "贵州省心理援助热线", phone: "0851-88417888", hours: "周一至周五 08:00-17:00", note: "贵州省第二人民医院" }],
            "云南": [{ name: "云南省心理援助热线", phone: "0871-12320转5", hours: "24小时", note: "昆明市心理危机研究与干预中心" }],
            "西藏": [{ name: "西藏心理援助热线", phone: "12356", hours: "24小时", note: "全国统一热线，西藏已接入" }],
            "陕西": [{ name: "陕西省心理援助热线", phone: "400-8960960", hours: "24小时", note: "当地精神卫生中心" }],
            "甘肃": [{ name: "甘肃卫生12320心理援助热线", phone: "0931-12320转5", hours: "8:00-22:00", note: "兰州市第三人民医院" }],
            "青海": [{ name: "青海12355热线", phone: "0971-12355", hours: "24小时" }],
            "宁夏": [{ name: "宁夏心理援助热线", phone: "12356", hours: "24小时", note: "全国统一热线，宁夏已接入" }],
            "新疆": [{ name: "新疆心理援助热线", phone: "0991-3016111", hours: "24小时", note: "新疆精神卫生中心" }]
          };

          const phoneIconSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>';

          const provinceWrap = document.createElement("div");
          provinceWrap.className = "crisis-hotline-province";
          provinceWrap.innerHTML =
            '<label class="crisis-hotline-province-label" for="regionSelect">📍 选择你所在的省份，查看本地心理援助热线</label>' +
            '<select class="crisis-hotline-region" id="regionSelect"></select>' +
            '<p class="crisis-hotline-province-tip">提示：全国统一心理援助热线 12356（24小时）无区号直接拨打即接入你本地的服务；加区号拨打可路由到对应地区的中心（示例：010-12356）。以下为各省已公开的本地热线。</p>';
          const nationalList = hotlineModal.querySelector(".crisis-hotline-list");
          const localBox = document.createElement("div");
          localBox.className = "crisis-hotline-local";
          localBox.id = "regionHotlines";
          nationalList.parentNode.insertBefore(provinceWrap, nationalList);
          nationalList.parentNode.insertBefore(localBox, nationalList);

          const natTitle = document.createElement("div");
          natTitle.className = "crisis-hotline-local-title";
          natTitle.textContent = "全国通打热线";
          nationalList.parentNode.insertBefore(natTitle, nationalList);
          nationalList.innerHTML =
            '<a class="crisis-hotline" href="tel:12356">' + phoneIconSVG + '<span class="crisis-hotline-name">全国统一心理援助热线<br>（24小时）</span><span class="crisis-hotline-number">12356</span></a>' +
            '<a class="crisis-hotline" href="tel:4001619995">' + phoneIconSVG + '<span class="crisis-hotline-name">全国希望24热线<br>（24小时）</span><span class="crisis-hotline-number">400-161-9995</span></a>' +
            '<a class="crisis-hotline" href="tel:12355">' + phoneIconSVG + '<span class="crisis-hotline-name">青少年心理援助热线（12355）<br>（24小时）</span><span class="crisis-hotline-number">12355</span></a>';

          const select = hotlineModal.querySelector("#regionSelect");
          Object.keys(REGION_HOTLINES).forEach((p) => {
            const opt = document.createElement("option");
            opt.value = p;
            opt.textContent = p;
            select.appendChild(opt);
          });

          function renderRegionHotlines(province) {
            localBox.innerHTML = "";
            if (!province) { localBox.innerHTML = '<p class="crisis-hotline-tip">请在上方选择省份，为你显示本地心理援助热线。</p>'; return; }
            const items = REGION_HOTLINES[province] || [];
            if (items.length === 0) { localBox.innerHTML = '<p class="crisis-hotline-tip">全国统一心理援助热线 12356（24小时）本省已接入，直接拨打即可。</p>'; return; }
            const title = document.createElement("div");
            title.className = "crisis-hotline-local-title";
            title.textContent = province + " · 本地热线";
            localBox.appendChild(title);
            items.forEach((h) => {
              const el = document.createElement("a");
              el.className = "crisis-hotline";
              el.href = "tel:" + String(h.phone).replace(/[^0-9]/g, "");
              const noteLine = h.note ? '<br><span class="crisis-hotline-note">' + h.note + '</span>' : '';
              el.innerHTML = phoneIconSVG +
                '<span class="crisis-hotline-name">' + h.name + '<br>（' + h.hours + '）' + noteLine + '</span>' +
                '<span class="crisis-hotline-number">' + h.phone + '</span>';
              localBox.appendChild(el);
            });
          }

          const savedRegion = localStorage.getItem("nuo_region");
          if (savedRegion && REGION_HOTLINES[savedRegion]) select.value = savedRegion;
          renderRegionHotlines(select.value);
          select.addEventListener("change", () => {
            localStorage.setItem("nuo_region", select.value);
            renderRegionHotlines(select.value);
          });

          const letterModal = document.createElement("div");
          letterModal.className = "crisis-letter-modal";
          letterModal.innerHTML = '<div class="crisis-letter-panel" role="dialog" aria-modal="true"><h3 class="crisis-letter-title">给自己写一封安抚信</h3><textarea class="crisis-letter-input" placeholder="写下你想对自己说的话，写完点击保存，它会留在你的记录里"></textarea><div class="crisis-letter-actions"><button class="crisis-letter-button" data-crisis-close type="button">先放一放</button><button class="crisis-letter-button crisis-letter-save" data-crisis-save type="button">保存</button></div></div>';
          aiPage.appendChild(letterModal);

          const sootheModal = document.createElement("div");
          sootheModal.className = "crisis-soothe-modal";
          sootheModal.innerHTML = '<div class="crisis-soothe-card" role="dialog" aria-modal="true" aria-label="即时安抚"><button class="crisis-soothe-close" type="button" aria-label="关闭">×</button><div class="crisis-soothe-orb" aria-hidden="true"></div><p class="crisis-soothe-phase">慢慢吸气</p><p class="crisis-soothe-hint">跟着圆，变大时吸气，变小时呼气。</p></div>';
          document.body.appendChild(sootheModal);
          let sootheTimer = 0;
          function openSoothe() {
            const phase = sootheModal.querySelector(".crisis-soothe-phase");
            const orb = sootheModal.querySelector(".crisis-soothe-orb");
            phase.textContent = "慢慢吸气";
            orb.style.animation = "none";
            void orb.offsetWidth;
            orb.style.animation = "";
            sootheModal.classList.add("crisis-soothe-visible");
            window.clearInterval(sootheTimer);
            let inhale = true;
            sootheTimer = window.setInterval(() => {
              inhale = !inhale;
              phase.textContent = inhale ? "慢慢吸气" : "慢慢呼气";
            }, 4000);
          }
          function closeSoothe() {
            sootheModal.classList.remove("crisis-soothe-visible");
            window.clearInterval(sootheTimer);
          }

          function closeCrisisPanel() {
            panel.classList.remove("crisis-panel-visible", "crisis-ai-panel-medium", "crisis-ai-panel-high");
          }
          function toggleCrisisPanel() {
            const open = panel.classList.contains("crisis-panel-visible") || panel.classList.contains("crisis-ai-panel-medium") || panel.classList.contains("crisis-ai-panel-high");
            if (open) closeCrisisPanel();
            else panel.classList.add("crisis-panel-visible");
          }
          function closeCrisisModal(modal) { modal.classList.remove("crisis-hotline-visible", "crisis-letter-visible"); }
          function saveCrisisLetter() { const text = letterModal.querySelector(".crisis-letter-input").value.trim(); if (text) { localStorage.setItem("nuo_comfort_letter", text); } closeCrisisModal(letterModal); }

          crisisButton.addEventListener("click", toggleCrisisPanel);
          panel.querySelector(".crisis-panel-close").addEventListener("click", closeCrisisPanel);
          panel.querySelector('[data-crisis-action="hotline"]').addEventListener("click", () => hotlineModal.classList.add("crisis-hotline-visible"));
          panel.querySelector('[data-crisis-action="letter"]').addEventListener("click", () => letterModal.classList.add("crisis-letter-visible"));
          panel.querySelector('[data-crisis-action="breathe"]').addEventListener("click", openSoothe);
          sootheModal.querySelector(".crisis-soothe-close").addEventListener("click", closeSoothe);
          sootheModal.addEventListener("click", (event) => { if (event.target === sootheModal) closeSoothe(); });
          hotlineModal.querySelector(".crisis-hotline-close").addEventListener("click", () => closeCrisisModal(hotlineModal));
          hotlineModal.addEventListener("click", (event) => { if (event.target === hotlineModal) closeCrisisModal(hotlineModal); });
          letterModal.querySelector("[data-crisis-close]").addEventListener("click", () => closeCrisisModal(letterModal));
          letterModal.querySelector("[data-crisis-save]").addEventListener("click", saveCrisisLetter);
          letterModal.addEventListener("click", (event) => { if (event.target === letterModal) closeCrisisModal(letterModal); });
        }());
  }
}
