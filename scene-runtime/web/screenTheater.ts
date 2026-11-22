/**
 * 3D 场景里的“电视节目”：镜头停在屏幕正前方后，把木偶舞台精确叠在屏幕上播放。
 * 舞台与 AI 页「演绎」弹窗是同一个组件（web/features/theater/stage.ts）。
 */
import { createTheaterStage, emptyNotice, type StageState, type TheaterEpisode } from '../../web/features/theater/stage';
import type { ScreenRect } from './screenProps';
import './screen-theater.css';

export interface ScreenTheater {
  open(rect: ScreenRect, label: string): void;
  setRect(rect: ScreenRect): void;
  setEpisodes(episodes: TheaterEpisode[], status: string): void;
  pause(): void;
  close(): void;
  isOpen(): boolean;
}

export function createScreenTheater(host: HTMLElement, options: { onLeave(): void }): ScreenTheater {
  const layer = document.createElement('div');
  layer.className = 'screen-theater';
  layer.hidden = true;
  const glass = document.createElement('div');
  glass.className = 'screen-theater-glass';
  const bar = document.createElement('div');
  bar.className = 'screen-theater-bar';
  bar.hidden = true;
  bar.innerHTML = `
    <button type="button" data-screen-prev aria-label="上一拍">‹</button>
    <button type="button" data-screen-play aria-label="暂停">❚❚</button>
    <button type="button" data-screen-next aria-label="下一拍">›</button>
    <button type="button" data-screen-version hidden>换一版</button>
    <span class="screen-theater-progress" aria-live="off"></span>
    <button type="button" data-screen-leave class="screen-theater-leave">离开电视</button>`;
  const playButton = bar.querySelector<HTMLButtonElement>('[data-screen-play]')!;
  const versionButton = bar.querySelector<HTMLButtonElement>('[data-screen-version]')!;
  const progress = bar.querySelector<HTMLElement>('.screen-theater-progress')!;

  const stage = createTheaterStage({ caption: 'inside', fit: 'fill', onChange: render });
  layer.append(stage.element, glass);
  host.append(layer, bar);

  let episodes: TheaterEpisode[] = [];
  let label = '电视';

  function render(state: StageState) {
    const ended = state.index >= state.total;
    playButton.textContent = state.playing ? '❚❚' : '▶';
    playButton.setAttribute('aria-label', state.playing ? '暂停' : ended ? '重新播放' : '播放');
    playButton.disabled = !state.episode;
    bar.querySelectorAll<HTMLButtonElement>('[data-screen-prev],[data-screen-next]').forEach(button => { button.disabled = !state.episode; });
    progress.textContent = !state.episode ? '' : state.index < 0 ? '开场' : ended ? '谢幕' : `${state.index + 1}/${state.total}`;
  }

  function play(id?: string) {
    const target = episodes.find(episode => episode.id === id) || episodes[episodes.length - 1];
    if (target) stage.load(target);
    versionButton.hidden = episodes.length < 2;
  }

  bar.addEventListener('click', event => {
    const el = event.target as HTMLElement;
    if (el.closest('[data-screen-leave]')) options.onLeave();
    else if (el.closest('[data-screen-play]')) stage.toggle();
    else if (el.closest('[data-screen-next]')) stage.next();
    else if (el.closest('[data-screen-prev]')) stage.prev();
    else if (el.closest('[data-screen-version]')) {
      // 依次换到上一版，转一圈回到最新一版。
      const currentId = stage.state().episode?.id;
      const at = episodes.findIndex(episode => episode.id === currentId);
      play(episodes[(at - 1 + episodes.length) % episodes.length]?.id);
    }
  });

  const handle: ScreenTheater = {
    open(rect, name) {
      label = name;
      handle.setRect(rect);
      layer.hidden = false; bar.hidden = false;
      layer.setAttribute('role', 'region');
      layer.setAttribute('aria-label', `${label}里的对话演绎`);
      stage.empty('调台中…', '正在接收这段对话的演绎');
      requestAnimationFrame(() => layer.classList.add('is-on'));
      bar.querySelector<HTMLButtonElement>('[data-screen-leave]')!.focus({ preventScroll: true });
    },
    setRect(rect) {
      Object.assign(layer.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    },
    setEpisodes(list, status) {
      const currentId = stage.state().episode?.id;
      episodes = list;
      if (!episodes.length) {
        const notice = emptyNotice(status, 'scene');
        stage.empty(notice.title, notice.body);
        versionButton.hidden = true;
      } else if (!currentId || !episodes.some(episode => episode.id === currentId)) {
        play();
      } else if (episodes[episodes.length - 1].id !== currentId && stage.state().index >= stage.state().total) {
        play(); // 上一出已经谢幕、又排好了新的一版：接着放新的
      } else {
        versionButton.hidden = episodes.length < 2;
      }
    },
    pause() { stage.pause(); },
    close() {
      stage.clear();
      layer.classList.remove('is-on');
      layer.hidden = true; bar.hidden = true;
      episodes = [];
    },
    isOpen() { return !layer.hidden; },
  };
  return handle;
}
