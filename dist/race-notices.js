export const WARNING_HOLD_MS = 750;
export const NOTICE_FADE_MS = 200;

// One transient card shares the flag's column. Queue simultaneous warnings so
// a penalty cannot disappear behind a camera change or a lap announcement.
export class RaceNotices {
  constructor({flagPanel, messagePanel}) {
    this.flagPanel = flagPanel;
    this.messagePanel = messagePanel;
    this.flagLabel = flagPanel.querySelector('[data-notice-title]');
    this.flagText = flagPanel.querySelector('[data-notice-text]');
    this.messageTitle = messagePanel.querySelector('[data-notice-title]');
    this.messageText = messagePanel.querySelector('[data-notice-text]');
    this.clear();
  }

  setFlag(info) {
    const flag = info?.flag || 'green';
    if (this.flag === flag) return;
    this.flag = flag;
    this.flagPanel.classList.toggle('hidden', flag === 'green');
    this.flagPanel.dataset.flag = flag;
    if (flag === 'green') return;
    this.flagLabel.textContent = info.label;
    this.flagText.textContent = info.text;
    this.flagPanel.style.setProperty('--notice-color', info.color);
  }

  push({key, title, text = '', tone = 'info', icon = 'info', priority = 0, duration = 2500}, now = performance.now()) {
    const entry = {key: key || title, title, text, tone, icon, priority,
      duration: priority > 0 ? WARNING_HOLD_MS : duration};
    // Repeated events never keep an existing warning on screen indefinitely.
    if (this.current?.key === entry.key || this.queue.some(item => item.key === entry.key)) return;
    if (!this.current || (entry.priority > 0 && this.current.priority === 0)) {
      this.display(entry, now);
      return;
    }
    this.queue.push(entry);
    this.queue.sort((a, b) => b.priority - a.priority);
    this.queue.length = Math.min(this.queue.length, 8);
  }

  display(entry, now) {
    this.current = {...entry, started: now};
    const panel = this.messagePanel;
    this.messageTitle.textContent = entry.title;
    this.messageText.textContent = entry.text;
    this.messageText.classList.toggle('hidden', !entry.text);
    panel.dataset.tone = entry.tone;
    panel.dataset.icon = entry.icon;
    panel.dataset.phase = 'visible';
    panel.style.setProperty('--notice-progress', '1');
    panel.classList.remove('hidden', 'is-leaving');
  }

  tick(now = performance.now()) {
    if (!this.current) return;
    const elapsed = now - this.current.started;
    if (elapsed >= this.current.duration + NOTICE_FADE_MS) {
      const next = this.queue.shift();
      if (next) this.display(next, now);
      else {
        this.current = null;
        this.messagePanel.classList.add('hidden');
      }
      return;
    }
    this.messagePanel.style.setProperty('--notice-progress', String(Math.max(0, 1 - elapsed / this.current.duration)));
    if (elapsed >= this.current.duration && this.messagePanel.dataset.phase !== 'fading') {
      this.messagePanel.dataset.phase = 'fading';
      this.messagePanel.classList.add('is-leaving');
    }
  }

  clear() {
    this.current = null;
    this.queue = [];
    this.flag = null;
    this.setFlag({flag: 'green'});
    this.messagePanel.classList.add('hidden');
    this.messagePanel.classList.remove('is-leaving');
    this.messagePanel.dataset.phase = 'hidden';
  }
}
