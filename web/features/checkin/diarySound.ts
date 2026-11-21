const SOUND_KEY = 'nuo_diary_page_sound_v1'
let audio: HTMLAudioElement | undefined
let sessionEnabled: boolean | undefined
function enabled() { if (sessionEnabled !== undefined) return sessionEnabled; try { return localStorage.getItem(SOUND_KEY) !== 'off' } catch { return true } }

export function playDiaryPageSound(kind: 'page' | 'cover' = 'page') {
  if (!enabled()) return
  try {
    if (!audio) {
      audio = document.createElement('audio'); audio.src = new URL('../../assets/audio/diary-page-turn.wav', import.meta.url).href
      audio.preload = 'auto'; audio.hidden = true; audio.dataset.diaryPageAudio = ''; audio.setAttribute('aria-hidden','true'); document.body.append(audio)
    }
    audio.pause(); audio.currentTime = 0; audio.volume = .28; audio.playbackRate = kind === 'cover' ? .88 : 1
    // Called synchronously by the page/cover click, respecting browser audio activation rules.
    void audio.play().catch(() => { /* Muted/blocked audio must never prevent turning a page. */ })
  } catch { /* A browser without media playback still has a fully usable diary. */ }
}

export function createDiarySoundToggle() {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'diary-sound-toggle'
  button.setAttribute('aria-label','翻页声音')
  function render() {
    const on = enabled(); button.setAttribute('aria-pressed', String(on)); button.title = on ? '翻页声音已开启，点击静音' : '翻页声音已关闭，点击开启'
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4Z"/>' + (on ? '<path d="M16 8q4 4 0 8m3-11q7 7 0 14"/>' : '<path d="m17 9 5 6m0-6-5 6"/>') + '</svg>'
  }
  button.addEventListener('click', () => {
    const on = !enabled()
    sessionEnabled = on
    try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off') } catch { /* Browser preference storage may be unavailable. */ }
    if (!on) audio?.pause()
    render()
  })
  render(); return button
}
