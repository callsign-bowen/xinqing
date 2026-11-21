// @ts-nocheck
/** 功能构件：mascot。简约线条 IP：小猫 / 小狗 / 宇航员。 */
import type { AppContext } from '../../kernel/context'
import './mascotArt.css'
import {
  IP_CONFIG,
  getIPConfig,
  getMascotSVG,
  getDecorSVG,
  getIPGreeting,
} from './ipManager'

const MASCOT_ORDER = ['cat', 'dog', 'sun', 'circle', 'sprout', 'astronaut'] as const
const DEFAULT_MASCOT = 'cat'
const MASCOT_STORAGE_KEY = 'nuo_mascot'

const STATE_TO_EMOTION: Record<string, string> = {
  normal: 'calm',
  calm: 'calm',
  happy: 'happy',
  concern: 'anxious',
  anxious: 'anxious',
  tired: 'tired',
  full: 'calm',
}

export const mascotFeature = {
  id: 'mascot',
  init(ctx: AppContext) {
    ;(function initLineMascot() {
      function normalizeId(id: string) {
        if (id === 'panda') return DEFAULT_MASCOT
        if (id === 'moon') return 'sun'
        if (MASCOT_ORDER.includes(id)) return id
        if (IP_CONFIG[id] && MASCOT_ORDER.includes(id)) return id
        return DEFAULT_MASCOT
      }

      function getStoredMascot() {
        try {
          const stored = localStorage.getItem(MASCOT_STORAGE_KEY)
          if (stored) return normalizeId(stored)
        } catch {
          /* 静默 */
        }
        return DEFAULT_MASCOT
      }

      let currentMascot = getStoredMascot()

      function faceSvg(id: string, state = 'normal') {
        const ip = normalizeId(id)
        if (state === 'normal' || state === 'full') return getMascotSVG(40, ip)
        const emotion = STATE_TO_EMOTION[state] || 'calm'
        const config = getIPConfig(ip)
        const emotionSvg = config.emotions?.[emotion]
        if (emotionSvg) return emotionSvg
        return getMascotSVG(40, ip)
      }

      function getEmotionSVG(emotion: string, ipId = currentMascot, icon = false) {
        const key = STATE_TO_EMOTION[emotion] || 'calm'
        if (icon && getIPConfig(normalizeId(ipId)).emotionIcons?.[key]) return getIPConfig(normalizeId(ipId)).emotionIcons[key]
        return faceSvg(ipId, emotion || 'calm')
      }

      function updateEmotions() {
        const mainEmotion = document.getElementById('emotionFace')
        const tabs = Array.from(document.querySelectorAll('.emotion-tab'))
        const activeTab = document.querySelector('.emotion-tab.active')
        const activeIndex = Math.max(0, tabs.indexOf(activeTab))
        const states = ['calm', 'anxious', 'happy', 'tired']
        if (mainEmotion) mainEmotion.innerHTML = getEmotionSVG(states[activeIndex])
        tabs.forEach((tab, index) => {
          const icon = tab.querySelector('.emotion-tab-icon')
          if (icon) icon.innerHTML = getEmotionSVG(states[index], currentMascot, true)
        })
      }

      function writeFace(targetEl, faceHtml) {
        if (!targetEl || !faceHtml) return
        const tn = String(targetEl.tagName || '').toUpperCase()
        if (tn === 'IMG') {
          const span = document.createElement('span')
          span.className = targetEl.getAttribute('class') || ''
          if (targetEl.id) span.id = targetEl.id
          span.setAttribute('aria-hidden', 'true')
          span.innerHTML = faceHtml
          targetEl.replaceWith(span)
          return
        }
        if (tn === 'SVG') {
          const span = document.createElement('span')
          span.className = targetEl.getAttribute('class') || ''
          if (targetEl.id) span.id = targetEl.id
          span.setAttribute('aria-hidden', 'true')
          span.innerHTML = faceHtml
          targetEl.replaceWith(span)
          return
        }
        targetEl.innerHTML = faceHtml
      }

      function applyMascot(id, opts) {
        id = normalizeId(id)
        currentMascot = id
        try {
          localStorage.setItem(MASCOT_STORAGE_KEY, id)
        } catch {
          /* 静默 */
        }
        const meta = getIPConfig(id)
        const faceNormal = faceSvg(id, 'normal')
        const theme = opts?.applyTheme === true
          ? meta.recommendedTheme || 'mono'
          : localStorage.getItem('nuo_theme') || 'mono'

        if (!opts || opts.applyTheme !== false) {
          document.documentElement.dataset.theme = theme
          try {
            localStorage.setItem('nuo_theme', theme)
          } catch {
            /* 静默 */
          }
          ctx.events.emit('theme.changed', { theme })
        }

        writeFace(document.querySelector('.splash-cat'), faceNormal)
        writeFace(document.getElementById('home-mascot') || document.querySelector('.cat-avatar'), faceNormal)
        updateEmotions()
        writeFace(document.querySelector('.ai-header-cat'), faceNormal)

        document.querySelectorAll('.ai-message-avatar').forEach((el) => {
          let state = 'normal'
          if (el.classList.contains('cat-happy')) state = 'happy'
          else if (el.classList.contains('cat-concern')) state = 'concern'
          writeFace(el, id === 'cat' ? faceNormal : faceSvg(id, state))
        })
        document.querySelectorAll('.ai-typing').forEach((wrap) => {
          const av = wrap.querySelector('.ai-message-avatar, .typing-avatar, [data-typing-avatar]')
          if (av) writeFace(av, faceNormal)
        })

        writeFace(document.querySelector('.profile-greeting-icon'), faceNormal)
        const profileStage = document.querySelector('.profile-stage')
        if (profileStage) {
          let profileFace = profileStage.querySelector('.profile-mascot-face')
          if (!profileFace) {
            profileStage.querySelectorAll('img,svg').forEach(node => node.remove())
            profileFace = document.createElement('span')
            profileFace.className = 'profile-mascot-face'
            profileStage.append(profileFace)
          }
          writeFace(profileFace, faceNormal)
        }

        const greetingEl = document.querySelector('.profile-greeting-text')
        if (greetingEl) greetingEl.textContent = getIPGreeting(id)
        const homeSubtitleEl = document.querySelector('.greeting-subtitle')
        if (homeSubtitleEl) homeSubtitleEl.textContent = getIPGreeting(id)

        writeFace(document.querySelector('.encourage-cat'), faceNormal)
        document
          .querySelectorAll('.history-cat, .history-item .mascot-face, #history-modal svg[data-mascot-face]')
          .forEach((el) => writeFace(el, faceNormal))
        writeFace(document.querySelector('#account-avatar-button'), faceNormal)

        const decoEl = document.getElementById('mascotDeco')
        if (decoEl) decoEl.innerHTML = getDecorSVG(id)

        syncLauncherIcon(currentMascot)
        renderMascotGrid()
        ctx.events.emit('mascot.changed', { id: currentMascot })
      }

      function renderMascotGrid() {
        const grid = document.getElementById('mascotGrid')
        if (!grid) return
        grid.innerHTML = ''
        MASCOT_ORDER.forEach((id) => {
          const meta = getIPConfig(id)
          const item = document.createElement('button')
          item.type = 'button'
          item.className = 'mascot-item' + (id === currentMascot ? ' active' : '')
          item.dataset.mascot = id
          item.innerHTML = faceSvg(id, 'normal') + '<span class="mascot-item-label">' + meta.name + '</span>'
          item.addEventListener('click', () => {
            applyMascot(id)
            closeMascotSheet()
          })
          grid.appendChild(item)
        })
      }

      function syncLauncherIcon(id) {
        try {
          const bridge = window.NuoAndroid
          if (bridge && typeof bridge.setLauncherIcon === 'function') bridge.setLauncherIcon(id)
        } catch {
          /* 浏览器里没有安卓接口 */
        }
      }

      function openMascotSheet() {
        renderMascotGrid()
        document.getElementById('mascotSheet')?.classList.add('open')
      }
      function closeMascotSheet() {
        document.getElementById('mascotSheet')?.classList.remove('open')
      }

      ctx.services.mascot = {
        getEmotionSVG,
        updateEmotions,
        getFace(state) {
          if (currentMascot === 'cat') return getMascotSVG(40, currentMascot)
          return faceSvg(currentMascot, state || 'normal')
        },
        getDeco() {
          return getDecorSVG(currentMascot)
        },
        getGreeting() {
          return getIPGreeting(currentMascot)
        },
        getId() {
          return currentMascot
        },
        apply: applyMascot,
        openSheet: openMascotSheet,
      }

      function init() {
        // 旧版若存了 panda，迁移为小猫
        try {
          const raw = localStorage.getItem(MASCOT_STORAGE_KEY)
          if (raw === 'panda') localStorage.setItem(MASCOT_STORAGE_KEY, DEFAULT_MASCOT)
        } catch {
          /* 静默 */
        }
        currentMascot = getStoredMascot()
        applyMascot(currentMascot, localStorage.getItem('nuo_theme') ? { applyTheme: false } : undefined)
        document.getElementById('profile-mascot-button')?.addEventListener('click', openMascotSheet)
        document.querySelectorAll('.mascot-sheet-close').forEach((b) => b.addEventListener('click', closeMascotSheet))
        document.querySelectorAll('.mascot-sheet-backdrop').forEach((bd) => bd.addEventListener('click', closeMascotSheet))
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') closeMascotSheet()
        })
      }

      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
      else init()
    })()
  },
}
