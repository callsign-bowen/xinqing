// @ts-nocheck
/** 功能构件：report。只通过 ctx 与外界通信，不 import 其它 features。 */
import type { AppContext } from '../../kernel/context'

export const reportFeature = {
  id: 'report',
  init(ctx: AppContext) {
        (function initEmotionReport() {
          const reportPage = document.getElementById("page-report");
          const homePage = document.querySelector(".app");
          const navItems = document.querySelectorAll("[data-nav]");
          const calendarGrid = document.getElementById("report-calendar-grid");
          const calendarTitle = document.getElementById("report-calendar-title");
          const daysValue = document.getElementById("report-days-value");
          const daysLabel = document.getElementById("report-days-label");
          const streakValue = document.getElementById("report-streak-value");
          const commonValue = document.getElementById("report-common-value");
          const commonLabel = document.getElementById("report-common-label");
          const trendTabs = document.querySelectorAll("[data-trend-period]");
          const trendBody = document.getElementById("report-trend-body");
          const quickTabs = document.querySelectorAll("[data-quick-period]");
          const quickBody = document.getElementById("report-quick-body");
          let activePeriod = "week";
          let trendPeriod = "";
          let quickPeriod = "";
          let trendChart = null;
          const opened = today();
          let viewYear = opened.getFullYear();
          let viewMonth = opened.getMonth();

          function showReport() {
            homePage.style.display = "none";
            reportPage.classList.add("report-visible");
            renderReport(activePeriod);
          }

          function showHome() {
            reportPage.classList.remove("report-visible");
            homePage.style.display = "flex";
          }

          function cssColor(variable, fallback) {
            return getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || fallback;
          }

          function pad(value) {
            return String(value).padStart(2, "0");
          }

          function dayKey(date) {
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
          }

          function today() {
            const now = new Date();
            return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
          }

          function weekStart(now = today()) {
            const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
            const offset = start.getDay() === 0 ? 6 : start.getDay() - 1;
            start.setDate(start.getDate() - offset);
            return start;
          }

          function shiftCalendar(months) {
            const cursor = new Date(viewYear, viewMonth + months, 1);
            viewYear = cursor.getFullYear();
            viewMonth = cursor.getMonth();
            renderCalendar();
          }

          function renderCalendar() {
            const latest = latestByDay(readEmotionRecords());
            const now = today();
            const year = viewYear;
            const month = viewMonth;
            const todayText = dayKey(now);
            const firstDay = new Date(year, month, 1).getDay();
            const mondayOffset = firstDay === 0 ? 6 : firstDay - 1;
            const totalDays = new Date(year, month + 1, 0).getDate();
            calendarTitle.textContent = `${year}年${month + 1}月`;
            calendarGrid.innerHTML = "";
            for (let index = 0; index < mondayOffset; index += 1) {
              const empty = document.createElement("span");
              empty.className = "report-day report-empty";
              calendarGrid.appendChild(empty);
            }
            for (let day = 1; day <= totalDays; day += 1) {
              const key = `${year}-${pad(month + 1)}-${pad(day)}`;
              const record = latest.get(key);
              const mood = record ? moodClass(record.emotion) : "";
              const cell = document.createElement("button");
              cell.type = "button";
              cell.className = `report-day${mood ? ` report-${mood}` : ""}${key === todayText ? " report-today" : ""}${key > todayText ? " report-future" : ""}`;
              cell.dataset.day = key;
              cell.textContent = String(day);
              cell.setAttribute("aria-label", record ? `${month + 1}月${day}日，${record.emotion}` : `${month + 1}月${day}日`);
              calendarGrid.appendChild(cell);
            }
          }

          function hideTrend() {
            trendPeriod = "";
            if (trendChart) {
              trendChart.destroy();
              trendChart = null;
            }
            if (trendBody) trendBody.hidden = true;
            trendTabs.forEach((tab) => tab.classList.remove("report-quick-tab-active"));
          }

          function hideBriefing() {
            quickPeriod = "";
            if (quickBody) {
              quickBody.hidden = true;
              quickBody.textContent = "";
            }
            quickTabs.forEach((tab) => tab.classList.remove("report-quick-tab-active"));
          }

          function makeCharts(period) {
            if (!window.Chart || !trendBody) return;
            trendBody.hidden = false;
            const textColor = cssColor("--text", "#1A1A1A");
            const primaryColor = cssColor("--primary", "#000000");
            const gridColor = cssColor("--line", "rgba(0,0,0,.12)");
            if (trendChart) trendChart.destroy();
            const latest = latestByDay(readEmotionRecords().filter((record) => inPeriod(record, period)));
            const now = today();
            let labels;
            let data;
            if (period === "week") {
              labels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
              const start = weekStart(now);
              data = labels.map((_, index) => {
                const date = new Date(start);
                date.setDate(start.getDate() + index);
                const record = latest.get(dayKey(date));
                return record ? emotionScore(record.emotion) : null;
              });
            } else {
              const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
              labels = Array.from({ length: daysInMonth }, (_, index) => String(index + 1));
              data = labels.map((_, index) => {
                const key = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(index + 1)}`;
                const record = latest.get(key);
                return record ? emotionScore(record.emotion) : null;
              });
            }
            trendChart = new Chart(document.getElementById("report-trend-chart"), {
              type: "line",
              data: { labels, datasets: [{ data, borderColor: primaryColor, backgroundColor: primaryColor, fill: true, tension: .35, pointRadius: 3, pointBackgroundColor: primaryColor, pointBorderWidth: 0, spanGaps: false }] },
              options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: textColor, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: period === "week" ? 7 : 8 }, grid: { display: false } }, y: { min: 1, max: 6, ticks: { color: textColor, stepSize: 1, font: { size: 10 }, callback: (value) => ({ 1: "伤心", 2: "失落", 3: "焦虑", 4: "疲惫", 5: "平静", 6: "开心" }[value] || value) }, grid: { color: gridColor } } } }
            });
          }

          function renderReport(period) {
            activePeriod = period;
            const name = period === "week" ? "本周" : "本月";
            const records = readEmotionRecords().filter((record) => inPeriod(record, period));
            const days = uniqueDays(records);
            const common = commonEmotion(records);
            daysValue.textContent = `${days.length}天`;
            streakValue.textContent = `${streakFromDays(days, period)}天`;
            commonValue.textContent = common;
            if (daysLabel) daysLabel.textContent = `${name}记录的总天数`;
            if (commonLabel) commonLabel.textContent = `${name}最常情绪`;
            renderCalendar();
            if (trendPeriod) makeCharts(trendPeriod);
            if (quickPeriod) showBriefing(quickPeriod);
          }

          function showBriefing(period) {
            if (!quickBody) return;
            quickBody.hidden = false;
            quickBody.textContent = briefingSentence(period);
          }

          function briefingSentence(period) {
            const latest = latestByDay(readEmotionRecords().filter((record) => inPeriod(record, period)));
            const rows = [...latest.entries()].sort((a, b) => a[0].localeCompare(b[0])).map((entry) => entry[1]);
            if (!rows.length) {
              return period === "week"
                ? "这周还没写下心情。想记的时候我都在，哪怕只写一句也好。"
                : "这个月还是空白的。想从今天开始也来得及，我会接着听你说。";
            }
            const emotion = rows.length === 1 ? (rows[0].emotion || "") : leadingEmotion(rows);
            const trend = moodDirection(rows);
            return period === "week" ? weekBrief(rows.length, emotion, trend) : monthBrief(rows.length, emotion, trend);
          }

          function moodDirection(rows) {
            if (rows.length < 2) return "single";
            const half = Math.ceil(rows.length / 2);
            const average = (list) => list.reduce((sum, record) => sum + (emotionScore(record.emotion) || 0), 0) / list.length;
            const delta = average(rows.slice(half)) - average(rows.slice(0, half));
            if (Math.abs(delta) < 0.3) return "flat";
            return delta > 0 ? "up" : "down";
          }

          function weekBrief(days, emotion, trend) {
            const mood = { 开心: "开心来得更多", 平静: "平静陪了你比较久", 疲惫: "疲惫跟着你比较久", 焦虑: "焦虑来得比较多", 失落: "失落来得比较多", 伤心: "伤心来得比较多" }[emotion] || "";
            if (trend === "single") return `这周你为自己留下了 1 天，那天的心情是${emotion || "还没选"}。哪怕只有这一天，也算你认真看过自己。`;
            const middle = mood ? `，${mood}` : "";
            const shift = { up: "后半周比前半周松了一些", down: "后半周比前半周沉了一点", flat: "这几天的心情大致是稳的" }[trend];
            const care = { up: "你有在慢慢好起来，我看见了。", down: "累的话就先靠一会儿，不用急着振作。", flat: "这样的一周，也值得被轻轻抱一下。" }[trend];
            return `这周你记下了 ${days} 天${middle}，${shift}。${care}`;
          }

          function monthBrief(days, emotion, trend) {
            const mood = { 开心: "开心是这个月里最常来的", 平静: "平静在这个月里待得最久", 疲惫: "疲惫在这个月里来得最多", 焦虑: "焦虑在这个月里来得最多", 失落: "失落在这个月里来得最多", 伤心: "伤心在这个月里来得最多" }[emotion] || "";
            if (trend === "single") return `这个月你先记下了 1 天，心情是${emotion || "还没选"}。一个月还长，这一小步已经很真。`;
            const middle = mood ? `，${mood}` : "";
            const shift = { up: "越到后面越轻一些", down: "后半个月更沉一点", flat: "整月大体是稳的" }[trend];
            const care = { up: "一个月能这样过来，你已经很不容易。", down: "低一点的日子也算你认真活过，我陪着。", flat: "能把这些天都留下来，本身就是一种温柔。" }[trend];
            return `这个月你陪自己走过了 ${days} 天${middle}，${shift}。${care}`;
          }

          calendarGrid.addEventListener("click", (event) => {
            const cell = event.target.closest("[data-day]");
            if (!cell || !calendarGrid.contains(cell)) return;
            ctx.events.emit("journal.openDay", { day: cell.dataset.day });
          });
          document.getElementById("report-cal-prev-year")?.addEventListener("click", () => shiftCalendar(-12));
          document.getElementById("report-cal-prev")?.addEventListener("click", () => shiftCalendar(-1));
          document.getElementById("report-cal-next")?.addEventListener("click", () => shiftCalendar(1));
          document.getElementById("report-cal-next-year")?.addEventListener("click", () => shiftCalendar(12));
          navItems.forEach((item) => item.addEventListener("click", () => {
            if (item.dataset.nav === "情绪") showReport();
            if (item.dataset.nav === "首页") showHome();
          }));
          new MutationObserver(() => {
            if (reportPage.classList.contains("report-visible") && trendPeriod) makeCharts(trendPeriod);
          }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
          ctx.events.on("emotion.saved", () => {
            if (reportPage.classList.contains("report-visible")) renderReport(activePeriod);
          });
          renderReport("week");
          hideTrend();
          hideBriefing();

          trendTabs.forEach((tab) => tab.addEventListener("click", () => {
            const period = tab.dataset.trendPeriod;
            if (trendPeriod === period) {
              hideTrend();
              return;
            }
            trendPeriod = period;
            trendTabs.forEach((item) => item.classList.toggle("report-quick-tab-active", item === tab));
            makeCharts(period);
          }));

          quickTabs.forEach((tab) => tab.addEventListener("click", () => {
            const period = tab.dataset.quickPeriod;
            if (quickPeriod === period) {
              hideBriefing();
              return;
            }
            quickPeriod = period;
            quickTabs.forEach((item) => item.classList.toggle("report-quick-tab-active", item === tab));
            showBriefing(period);
          }));

          function readEmotionRecords() {
            try {
              const saved = JSON.parse(localStorage.getItem("nuo_emotions") || "null");
              return Array.isArray(saved) ? saved : [];
            } catch (error) { return []; }
          }

          function emotionScore(emotion) {
            return { 开心: 6, 平静: 5, 疲惫: 4, 焦虑: 3, 失落: 2, 伤心: 1 }[emotion] ?? null;
          }

          function moodClass(emotion) {
            return { 开心: "happy", 平静: "calm", 疲惫: "tired", 焦虑: "anxious", 失落: "low", 伤心: "sad" }[emotion] || "";
          }

          function recordDate(record) {
            if (record && typeof record.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(record.day)) {
              const parts = record.day.split("-").map(Number);
              const date = new Date(parts[0], parts[1] - 1, parts[2], 12);
              if (date.getFullYear() !== parts[0] || date.getMonth() !== parts[1] - 1 || date.getDate() !== parts[2]) return null;
              return date;
            }
            const time = Number(record && record.id);
            if (!time) return null;
            const date = new Date(time);
            return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
          }

          function recordKey(record) {
            const date = recordDate(record);
            return date ? dayKey(date) : "";
          }

          function inPeriod(record, period) {
            const date = recordDate(record);
            if (!date) return false;
            const now = today();
            if (period === "week") {
              const start = weekStart(now);
              const end = new Date(start);
              end.setDate(start.getDate() + 6);
              return date >= start && date <= end;
            }
            return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
          }

          function latestByDay(list) {
            const map = new Map();
            list.forEach((record) => {
              const key = recordKey(record);
              if (!key) return;
              const previous = map.get(key);
              if (!previous || Number(record.id) >= Number(previous.id)) map.set(key, record);
            });
            return map;
          }

          function uniqueDays(list) {
            return [...latestByDay(list).keys()].sort();
          }

          function leadingEmotion(list) {
            const count = {};
            list.forEach((record) => {
              const emotion = record.emotion || "未选择";
              count[emotion] = (count[emotion] || 0) + 1;
            });
            const ranked = Object.entries(count).sort((a, b) => b[1] - a[1]);
            if (!ranked.length || (ranked[1] && ranked[0][1] === ranked[1][1])) return "";
            return ranked[0][0];
          }

          function commonEmotion(list) {
            const count = {};
            list.forEach((record) => {
              const emotion = record.emotion || "未选择";
              count[emotion] = (count[emotion] || 0) + 1;
            });
            const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
            return top ? top[0] : "暂无";
          }

          function streakFromDays(daysList, period) {
            const index = new Set(daysList);
            let streak = 0;
            const cursor = today();
            while (inPeriod({ day: dayKey(cursor) }, period) && index.has(dayKey(cursor))) {
              streak += 1;
              cursor.setDate(cursor.getDate() - 1);
            }
            return streak;
          }
        }());
  }
}
