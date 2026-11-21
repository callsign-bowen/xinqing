export type RecommendedTheme = "mono" | "rose" | "dawn" | "honey" | "lilac" | "mist" | "blue" | "night";

export type EmotionKey = "calm" | "anxious" | "happy" | "tired";

export interface IPConfig {
  id: string;
  name: string;
  greeting: string;
  recommendedTheme?: RecommendedTheme;
  svg: string;
  decor: string;
  emotions?: Record<EmotionKey, string>;
  emotionIcons?: Record<EmotionKey, string>;
}

// Crop each cell in the supplied sheet at display time, preserving the original artwork.
function astronautExpression(label: string, x: number, y: number): string {
  return `<svg class="nuo-astronaut-face" viewBox="0 0 724 543" overflow="hidden" preserveAspectRatio="xMidYMid meet" role="img" aria-label="宇航员：${label}"><svg x="0" y="0" width="724" height="543" viewBox="${x} ${y} 724 543" overflow="hidden" preserveAspectRatio="none" style="width:724px;height:543px;max-width:none;max-height:none;margin:0;overflow:hidden"><image href="/mascot/astronaut-expressions.png" width="1448" height="1086"/></svg></svg>`;
}

const astronautEmotions: Record<EmotionKey, string> = {
  calm: astronautExpression("平静", 0, 0),
  happy: astronautExpression("开心", 724, 0),
  anxious: astronautExpression("焦虑", 0, 543),
  tired: astronautExpression("疲惫", 724, 543),
};

// Keep the five supplied plant drawings as one source and clip each pose in SVG.
function sproutExpression(label: string, x: number, y: number): string {
  return `<svg class="nuo-sprout-face" viewBox="0 0 500 500" overflow="hidden" role="img" aria-label="小树苗：${label}"><svg x="0" y="0" width="500" height="500" viewBox="${x} ${y} 500 500" overflow="hidden" preserveAspectRatio="none" style="width:500px;height:500px;max-width:none;max-height:none;margin:0;overflow:hidden"><image href="/mascot/sprout-expressions-v2.png" width="1448" height="1086"/></svg></svg>`;
}

const sproutEmotions: Record<EmotionKey, string> = {
  calm: sproutExpression("平静", 5, 65),
  happy: sproutExpression("开心", 472, 63),
  anxious: sproutExpression("焦虑", 168, 560),
  tired: sproutExpression("疲惫", 746, 560),
};

function octopusExpression(label: string, x: number, y: number): string {
  return `<svg class="nuo-octopus-face" viewBox="0 0 600 500" overflow="hidden" role="img" aria-label="小章鱼：${label}"><svg x="0" y="0" width="600" height="500" viewBox="${x} ${y} 600 500" overflow="hidden" preserveAspectRatio="none" style="width:600px;height:500px;max-width:none;max-height:none;margin:0;overflow:hidden"><image href="/mascot/octopus-expressions.png" width="1254" height="1254"/></svg></svg>`;
}

const octopusEmotions: Record<EmotionKey, string> = {
  calm: octopusExpression("平静", 24, 106),
  happy: octopusExpression("开心", 631, 96),
  anxious: octopusExpression("焦虑", 10, 648),
  tired: octopusExpression("疲惫", 647, 656),
};

const IP_CONFIG: Record<string, IPConfig> = {
  cat: {
    id: "cat",
    name: "小猫",
    greeting: "我是小猫Nuo，今天想陪你一起度过",
    recommendedTheme: "rose",
    svg: '<img class="nuo-cat-face" src="/mascot/fish-cat-wave.png" alt="挥手打招呼的小猫" decoding="async" draggable="false">',
    decor: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="4" cy="4" r="1.5"/><circle cx="8" cy="4" r="1.5"/><circle cx="6" cy="8" r="1.5"/><ellipse cx="6" cy="12" rx="2.5" ry="1.5"/></svg>',
    emotions: {
      calm: '<img class="nuo-cat-face" src="/mascot/fish-cat-calm.png" alt="小猫：平静" decoding="async" draggable="false">',
      anxious: '<img class="nuo-cat-face" src="/mascot/fish-cat-anxious.png" alt="小猫：焦虑" decoding="async" draggable="false">',
      happy: '<img class="nuo-cat-face" src="/mascot/fish-cat-happy.png" alt="小猫：开心" decoding="async" draggable="false">',
      tired: '<img class="nuo-cat-face" src="/mascot/fish-cat-tired.png" alt="小猫：疲惫" decoding="async" draggable="false">',
    },
    emotionIcons: {
      calm: '<img class="nuo-cat-face" src="/mascot/fish-cat-calm.png" alt="小猫：平静" decoding="async" draggable="false">',
      anxious: '<img class="nuo-cat-face" src="/mascot/fish-cat-anxious.png" alt="小猫：焦虑" decoding="async" draggable="false">',
      happy: '<img class="nuo-cat-face" src="/mascot/fish-cat-happy.png" alt="小猫：开心" decoding="async" draggable="false">',
      tired: '<img class="nuo-cat-face" src="/mascot/fish-cat-tired.png" alt="小猫：疲惫" decoding="async" draggable="false">',
    },
  },
  dog: {
    id: "dog",
    name: "小狗",
    greeting: "我是小狗Nuo，今天会一直陪着你",
    recommendedTheme: "dawn",
    svg: '<img class="nuo-dog-face" src="/mascot/cap-dog-wave.png" alt="挥手打招呼的小狗" decoding="async" draggable="false">',
    decor: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="8" cy="12" rx="3" ry="2"/><circle cx="5" cy="6" r="1.5"/><circle cx="8" cy="5" r="1.5"/><circle cx="11" cy="6" r="1.5"/></svg>`,
    emotions: {
      calm: '<img class="nuo-dog-face" src="/mascot/cap-dog-calm.png" alt="小狗：平静" decoding="async" draggable="false">',
      anxious: '<img class="nuo-dog-face" src="/mascot/cap-dog-anxious.png" alt="小狗：焦虑" decoding="async" draggable="false">',
      happy: '<img class="nuo-dog-face" src="/mascot/cap-dog-happy.png" alt="小狗：开心" decoding="async" draggable="false">',
      tired: '<img class="nuo-dog-face" src="/mascot/cap-dog-tired.png" alt="小狗：疲惫" decoding="async" draggable="false">',
    },
    emotionIcons: {
      calm: '<img class="nuo-dog-face" src="/mascot/cap-dog-calm.png" alt="小狗：平静" decoding="async" draggable="false">',
      anxious: '<img class="nuo-dog-face" src="/mascot/cap-dog-anxious.png" alt="小狗：焦虑" decoding="async" draggable="false">',
      happy: '<img class="nuo-dog-face" src="/mascot/cap-dog-happy.png" alt="小狗：开心" decoding="async" draggable="false">',
      tired: '<img class="nuo-dog-face" src="/mascot/cap-dog-tired.png" alt="小狗：疲惫" decoding="async" draggable="false">',
    },
  },
  sun: {
    id: "sun", name: "太阳", greeting: "我是太阳Nuo，今天也要温暖自己哦", recommendedTheme: "honey",
    svg: '<img class="nuo-sun-face" src="/mascot/sun-calm.png" alt="太阳：平静" decoding="async" draggable="false">',
    decor: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="4"/><line x1="8" y1="1" x2="8" y2="3"/><line x1="8" y1="13" x2="8" y2="15"/><line x1="1" y1="8" x2="3" y2="8"/><line x1="13" y1="8" x2="15" y2="8"/><line x1="3.5" y1="3.5" x2="4.8" y2="4.8"/><line x1="11.2" y1="11.2" x2="12.5" y2="12.5"/><line x1="3.5" y1="12.5" x2="4.8" y2="11.2"/><line x1="11.2" y1="4.8" x2="12.5" y2="3.5"/></svg>`,
    emotions: {
      calm: '<img class="nuo-sun-face" src="/mascot/sun-calm.png" alt="太阳：平静" decoding="async" draggable="false">',
      anxious: '<img class="nuo-sun-face" src="/mascot/sun-anxious.png" alt="太阳：焦虑" decoding="async" draggable="false">',
      happy: '<img class="nuo-sun-face" src="/mascot/sun-happy.png" alt="太阳：开心" decoding="async" draggable="false">',
      tired: '<img class="nuo-sun-face" src="/mascot/sun-tired.png" alt="太阳：疲惫" decoding="async" draggable="false">',
    },
    emotionIcons: {
      calm: '<img class="nuo-sun-face" src="/mascot/sun-calm.png" alt="太阳：平静" decoding="async" draggable="false">',
      anxious: '<img class="nuo-sun-face" src="/mascot/sun-anxious.png" alt="太阳：焦虑" decoding="async" draggable="false">',
      happy: '<img class="nuo-sun-face" src="/mascot/sun-happy.png" alt="太阳：开心" decoding="async" draggable="false">',
      tired: '<img class="nuo-sun-face" src="/mascot/sun-tired.png" alt="太阳：疲惫" decoding="async" draggable="false">',
    },
  },
  circle: {
    id: "circle", name: "小章鱼", greeting: "我是小章鱼Nuo，今天也会陪在你身边", recommendedTheme: "lilac",
    svg: '<img class="nuo-octopus-face" src="/mascot/octopus-wave.png" alt="挥手打招呼的小章鱼" decoding="async" draggable="false">',
    decor: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="3"/></svg>`,
    emotions: octopusEmotions,
    emotionIcons: octopusEmotions,
  },
  sprout: {
    id: "sprout", name: "小树苗", greeting: "我是小树苗Nuo，一起慢慢生长吧", recommendedTheme: "mist",
    svg: sproutExpression("摆动", 960, 74),
    decor: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12V6"/><path d="M8 6C6 4 4 5 3 7C5 6 7 6.5 8 7.5C9 6.5 11 6 13 7C12 5 10 4 8 6Z"/></svg>`,
    emotions: sproutEmotions,
    emotionIcons: sproutEmotions,
  },
  astronaut: {
    id: "astronaut", name: "宇航员", greeting: "我是宇航员Nuo，一起去探索吧", recommendedTheme: "blue",
    svg: '<img class="nuo-astronaut-face" src="/mascot/astronaut-wave.png" alt="挥手打招呼的宇航员" decoding="async" draggable="false">',
    decor: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2 L5 8 L8 10 L11 8 L8 2Z"/><path d="M5 8 L3 12 L8 10"/><path d="M11 8 L13 12 L8 10"/></svg>`,
    emotions: astronautEmotions,
    emotionIcons: astronautEmotions,
  },
};

export function getCurrentIP(): string {
  const stored = localStorage.getItem("nuo_mascot");
  if (stored === "moon") {
    localStorage.setItem("nuo_mascot", "sun");
    return "sun";
  }
  return stored || "cat";
}

export function getIPConfig(id = getCurrentIP()): IPConfig {
  return IP_CONFIG[id] || IP_CONFIG.cat;
}

export function getMascotSVG(size = 40, id?: string): string {
  return getIPConfig(id).svg.replace(/viewBox="0 0 40 40"/g, `viewBox="0 0 ${size} ${size}"`);
}

export function getDecorSVG(id?: string): string { return getIPConfig(id).decor; }
export function getIPName(id?: string): string { return getIPConfig(id).name; }
export function getIPGreeting(id?: string): string { return getIPConfig(id).greeting; }
export function getIPList(): IPConfig[] { return Object.values(IP_CONFIG); }

export function refreshAllMascots(): void {
  const id = getCurrentIP();
  const config = getIPConfig(id);
  const targets: Array<[string, string]> = [
    ["splash-mascot", getMascotSVG(80, id)], ["home-mascot", getMascotSVG(40, id)],
    ["ai-nav-mascot", getMascotSVG(24, id)], ["ai-typing-mascot", getMascotSVG(24, id)],
    ["profile-mascot", getMascotSVG(40, id)], ["encourage-mascot", getMascotSVG(40, id)],
  ];
  targets.forEach(([elementId, svg]) => { const element = document.getElementById(elementId); if (element) element.innerHTML = svg; });
  const greeting = document.getElementById("home-greeting");
  if (greeting) greeting.textContent = config.greeting;
  const name = document.getElementById("ai-nav-name");
  if (name) name.textContent = config.name;
  document.querySelectorAll<HTMLElement>(".ai-message-avatar").forEach((element) => { element.innerHTML = getMascotSVG(24, id); });
  document.querySelectorAll<HTMLElement>(".mascot-decor").forEach((element) => { element.innerHTML = getDecorSVG(id); });
}

export function applyMascot(id: string): void {
  if (!IP_CONFIG[id]) return;
  localStorage.setItem("nuo_mascot", id);
  refreshAllMascots();
  window.dispatchEvent(new CustomEvent("nuo:mascot-change", { detail: getIPConfig(id) }));
}

export function initIPManager(): void { refreshAllMascots(); }

export { IP_CONFIG };
