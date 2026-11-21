/** 功能构件：profileAccount。只通过 ctx 与外界通信。 */
import type { Feature } from '../../kernel/types'
import { DEFAULT_NICKNAME, NICKNAME_MAX_LENGTH, normalizeNickname } from '../../kernel/nickname.ts'
import './account.css'

export const profileAccountFeature: Feature = {
  id: 'profileAccount',
  init(ctx) {
    const profilePage = document.getElementById('page-profile')
    const sections = profilePage?.querySelectorAll('.profile-section')
    if (!profilePage || !sections?.length) return
    const accountEntry = document.createElement('button')
    accountEntry.className = 'profile-item profile-account-entry'
    accountEntry.type = 'button'
    accountEntry.innerHTML = '<span class="profile-item-main"><span class="profile-item-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M4 22c0-4 4-7 8-7s8 3 8 7"/></svg></span><span class="profile-item-label">账号与安全</span></span><span class="profile-item-arrow">›</span>'
    sections[0].append(accountEntry)

    const accountModal = document.createElement('div')
    accountModal.id = 'account-modal'
    accountModal.className = 'account-modal'
    accountModal.setAttribute('aria-hidden', 'true')
    const face = ctx.services.mascot?.getFace('normal') || ''
    accountModal.innerHTML = `
      <div class="account-panel" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <div class="account-header"><h2 class="account-title" id="account-title">账号设置</h2><button class="account-close" type="button" aria-label="关闭账号设置">×</button></div>
        <div class="account-avatar-area">
          <button class="account-avatar" id="account-avatar-button" type="button" aria-label="更换头像">${face}</button>
          <button class="account-avatar-label" id="account-avatar-label" type="button">点击更换头像</button>
        </div>
        <div class="account-info-list">
          <section class="account-nickname-section" aria-label="昵称设置">
            <div class="account-info-row">
              <div class="account-info-main">
                <span class="account-info-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M4 22c0-4 4-7 8-7s8 3 8 7"/></svg></span>
                <span class="account-info-label">昵称<span class="account-info-value" id="account-nickname-value"></span></span>
              </div>
              <button class="account-action" id="account-nickname-edit" type="button" aria-controls="account-nickname-form" aria-expanded="false">修改</button>
            </div>
            <form class="account-nickname-form" id="account-nickname-form" hidden>
              <label for="account-nickname-input">你希望我怎么称呼你？</label>
              <input id="account-nickname-input" name="nickname" type="text" autocomplete="nickname" maxlength="${NICKNAME_MAX_LENGTH * 2}" placeholder="输入昵称" aria-describedby="account-nickname-hint account-nickname-error">
              <p class="account-nickname-hint" id="account-nickname-hint">1–${NICKNAME_MAX_LENGTH} 个字符</p>
              <p class="account-nickname-error" id="account-nickname-error" role="alert"></p>
              <div class="account-nickname-actions"><button type="button" id="account-nickname-cancel">取消</button><button type="submit">保存</button></div>
            </form>
          </section>
          <div class="account-info-row">
            <div class="account-info-main">
              <span class="account-info-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg></span>
              <span class="account-info-label">手机号<span class="account-info-value">未绑定</span></span>
            </div>
            <button class="account-action" id="account-phone-bind" type="button">绑定</button>
          </div>
        </div>
        <p class="account-footnote">昵称保存在本设备</p>
      </div>`
    profilePage.appendChild(accountModal)
    const closeButton = accountModal.querySelector<HTMLButtonElement>('.account-close')!
    const nicknameValue = accountModal.querySelector<HTMLElement>('#account-nickname-value')!
    const editButton = accountModal.querySelector<HTMLButtonElement>('#account-nickname-edit')!
    const form = accountModal.querySelector<HTMLFormElement>('#account-nickname-form')!
    const input = accountModal.querySelector<HTMLInputElement>('#account-nickname-input')!
    const error = accountModal.querySelector<HTMLElement>('#account-nickname-error')!
    let noticeTimer: number | undefined

    function refreshNickname() { nicknameValue.textContent = ctx.storage.nickname.get() || DEFAULT_NICKNAME }
    function endEditing() {
      form.hidden = true
      editButton.setAttribute('aria-expanded', 'false')
      input.value = ''
      input.removeAttribute('aria-invalid')
      error.textContent = ''
    }
    function openAccountModal() {
      refreshNickname();endEditing()
      accountModal.classList.add('account-modal-visible')
      accountModal.setAttribute('aria-hidden', 'false')
      closeButton.focus()
    }
    function closeAccountModal() {
      endEditing()
      accountModal.classList.remove('account-modal-visible')
      accountModal.setAttribute('aria-hidden', 'true')
      accountEntry.focus()
    }
    function notice(message: string) {
      const toast = document.getElementById('toast')
      if (!toast) return
      toast.textContent = message;toast.classList.add('show')
      window.clearTimeout(noticeTimer)
      noticeTimer = window.setTimeout(() => toast.classList.remove('show'), 2400)
    }
    editButton.addEventListener('click', () => {
      form.hidden = false
      editButton.setAttribute('aria-expanded', 'true')
      input.value = ctx.storage.nickname.get() || ''
      error.textContent = '';input.removeAttribute('aria-invalid')
      input.focus();input.select()
    })
    input.addEventListener('input', () => { error.textContent = '';input.removeAttribute('aria-invalid') })
    form.addEventListener('submit', event => {
      event.preventDefault()
      const name = normalizeNickname(input.value)
      if (!name) {
        error.textContent = `请输入 1–${NICKNAME_MAX_LENGTH} 个字符的昵称`
        input.setAttribute('aria-invalid', 'true');input.focus()
        return
      }
      if (!ctx.storage.nickname.set(name)) { error.textContent = '暂时没能保存，请再试一次。';return }
      refreshNickname();endEditing()
      ctx.events.emit('account.nicknameChanged', { nickname: name })
      notice('昵称已保存');editButton.focus()
    })
    accountModal.querySelector('#account-nickname-cancel')!.addEventListener('click', () => { endEditing();editButton.focus() })
    accountEntry.addEventListener('click', openAccountModal)
    closeButton.addEventListener('click', closeAccountModal)
    accountModal.addEventListener('click', event => { if (event.target === accountModal) closeAccountModal() })
    accountModal.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!form.hidden) { endEditing();editButton.focus() } else closeAccountModal()
      }
      if (event.key === 'Tab') {
        const buttons = [...accountModal.querySelectorAll<HTMLElement>('button,input')].filter(el => el.getClientRects().length)
        const first = buttons[0], last = buttons[buttons.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault();last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault();first?.focus() }
      }
    })
    accountModal.querySelector('#account-phone-bind')!.addEventListener('click', () => notice('绑定手机号功能开发中，敬请期待 ✨'))
    accountModal.querySelector('#account-avatar-button')!.addEventListener('click', () => notice('头像上传功能开发中，敬请期待 ✨'))
    accountModal.querySelector('#account-avatar-label')!.addEventListener('click', () => notice('头像上传功能开发中，敬请期待 ✨'))
    ctx.events.on('account.nicknameChanged', refreshNickname)
    ctx.events.on('auth.loggedIn', refreshNickname)
    ctx.events.on('auth.loggedOut', refreshNickname)
    window.addEventListener('storage', refreshNickname)
    refreshNickname()
  }
}
