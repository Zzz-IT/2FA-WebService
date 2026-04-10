import "./style.css";
import type { ParsedOtpAuth, SupportedAlgorithm } from "./types";
import { normalizeBase32, isValidBase32 } from "./utils/base32";
import { copyText } from "./utils/clipboard";
import { qs } from "./utils/dom";
import { generateTotp } from "./utils/otp";
import { parseOtpAuthUri } from "./utils/otpauth";

// SVG 图标定义
const ICON_SUN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
const ICON_MOON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;

const DEFAULTS: Omit<ParsedOtpAuth, "issuer" | "account" | "secret"> = {
  digits: 6,
  period: 30,
  algorithm: "SHA1"
};

let tickerTimer: number | null = null;

function getStoredTheme(): "light" | "dark" {
  const saved = localStorage.getItem("totp-theme");
  if (saved === "light" || saved === "dark") {
    return saved;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function setTheme(theme: "light" | "dark"): void {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("totp-theme", theme);
}

function renderApp(): void {
  const app = qs<HTMLDivElement>("#app");
  
  if (!document.querySelector(".bg-blobs")) {
    document.body.insertAdjacentHTML("afterbegin", `
      <div class="bg-blobs">
        <div class="blob blob-1"></div>
        <div class="blob blob-2"></div>
        <div class="blob blob-3"></div>
      </div>
    `);
  }

  app.innerHTML = `
    <div class="app">
      <header class="topbar">
        <div>
          <h1>TOTP 验证器</h1>
          <p class="subtitle">纯前端本地计算，安全可靠</p>
        </div>
        <button id="themeToggle" class="theme-btn" type="button" aria-label="切换主题"></button>
      </header>

      <div class="view-container">
        <main id="view-setup" class="view active">
          <section class="notice">
            验证码仅在本地生成，您的 Secret 密钥不会被上传到任何服务器。
          </section>

          <section class="form-grid">
            <div class="field">
              <label for="mainInput">Secret 或 otpauth:// 链接</label>
              <textarea
                id="mainInput"
                placeholder="在此粘贴 otpauth:// 链接自动解析，或直接输入 Base32 Secret..."
                spellcheck="false"
                autocomplete="off"
              ></textarea>
              <small class="help">自动识别并解析。若为 Secret 会自动忽略空格并转大写。</small>
            </div>
          </section>

          <div id="setupMessage" class="message" aria-live="polite"></div>

          <div class="actions">
            <button id="openSettingsBtn" class="btn btn-icon" type="button">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              设置
            </button>
            <button id="clearBtn" class="btn" type="button">清空</button>
            <button id="nextBtn" class="btn primary" type="button" style="flex: 2;">生成验证码</button>
          </div>
        </main>

        <main id="view-display" class="view">
          <section class="output">
            <div class="meta">
              <span id="configText">SHA1 • 6位 • 30s</span>
            </div>

            <div class="code-wrap">
              <div id="codeText" class="code">------</div>
              <button id="copyBtn" class="btn primary" type="button" style="width: 100%; max-width: 240px;">复制验证码</button>
            </div>

            <div class="progress-wrap">
              <div class="progress-text">
                <span>剩余时间</span>
                <strong id="remainingText">-- s</strong>
              </div>
              <div class="progress" aria-hidden="true">
                <div id="progressBar" class="progress-bar"></div>
              </div>
            </div>
          </section>

          <div id="displayMessage" class="message" aria-live="polite"></div>

          <div class="actions">
            <button id="backBtn" class="btn" type="button">返回修改</button>
          </div>
        </main>
      </div>
    </div>
  `;

  const oldModal = document.getElementById("settingsModal");
  if (oldModal) oldModal.remove();

  document.body.insertAdjacentHTML("beforeend", `
    <div id="settingsModal" class="modal-overlay" aria-hidden="true">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h2>高级设置</h2>
          <button id="closeSettingsBtn" class="close-btn" aria-label="关闭">&times;</button>
        </div>
        <div class="row">
          <div class="field">
            <label>加密算法</label>
            <div class="custom-select" id="algorithmSelect" data-value="SHA1">
              <div class="select-trigger">SHA1 (默认)</div>
              <div class="select-options">
                <div class="select-option active" data-val="SHA1">SHA1 (默认)</div>
                <div class="select-option" data-val="SHA256">SHA256</div>
                <div class="select-option" data-val="SHA512">SHA512</div>
              </div>
            </div>
          </div>
          <div class="field">
            <label>验证码位数</label>
            <div class="custom-select" id="digitsSelect" data-value="6">
              <div class="select-trigger">6 位</div>
              <div class="select-options">
                <div class="select-option active" data-val="6">6 位</div>
                <div class="select-option" data-val="7">7 位</div>
                <div class="select-option" data-val="8">8 位</div>
              </div>
            </div>
          </div>
        </div>
        <div class="field">
          <label for="periodInput">刷新周期（秒）</label>
          <input
            id="periodInput"
            type="number"
            min="1"
            step="1"
            value="30"
            inputmode="numeric"
          />
        </div>
        <div class="actions" style="margin-top: 8px;">
          <button id="saveSettingsBtn" class="btn primary" type="button">完成</button>
        </div>
      </div>
    </div>
  `);
}

function groupCode(code: string): string {
  if (code.length === 6) return `${code.slice(0, 3)} ${code.slice(3)}`;
  if (code.length === 7) return `${code.slice(0, 3)} ${code.slice(3)}`;
  if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`;
  return code;
}

function setMessage(viewId: "setupMessage" | "displayMessage", text: string, type: "error" | "success" | "" = ""): void {
  const el = qs<HTMLDivElement>(`#${viewId}`);
  el.className = `message${type ? ` ${type}` : ""}`;
  el.textContent = text;
}

function getCurrentFormState(): Omit<ParsedOtpAuth, "issuer" | "account"> {
  const mainInput = document.querySelector<HTMLTextAreaElement>("#mainInput")!;
  const algoSelectVal = document.querySelector<HTMLDivElement>("#algorithmSelect")!.dataset.value;
  const digitsSelectVal = document.querySelector<HTMLDivElement>("#digitsSelect")!.dataset.value;
  const periodInput = document.querySelector<HTMLInputElement>("#periodInput")!;

  const val = mainInput.value.trim();
  let secret = val;

  if (val.startsWith("otpauth://")) {
    try {
      secret = parseOtpAuthUri(val).secret;
    } catch {
      secret = ""; 
    }
  } else {
    secret = normalizeBase32(val);
  }

  return {
    secret,
    algorithm: algoSelectVal as SupportedAlgorithm,
    digits: Number.parseInt(digitsSelectVal || "6", 10),
    period: Number.parseInt(periodInput.value, 10)
  };
}

function setCustomSelectValue(id: string, value: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.dataset.value = value;
  const targetOption = el.querySelector(`.select-option[data-val="${value}"]`);
  if (targetOption) {
    el.querySelector('.select-trigger')!.textContent = targetOption.textContent;
    el.querySelectorAll('.select-option').forEach(opt => opt.classList.remove('active'));
    targetOption.classList.add('active');
  }
}

function fillAdvancedForm(data: Partial<ParsedOtpAuth>): void {
  if (data.algorithm !== undefined) setCustomSelectValue("algorithmSelect", data.algorithm);
  if (data.digits !== undefined) setCustomSelectValue("digitsSelect", String(data.digits));
  if (data.period !== undefined) document.querySelector<HTMLInputElement>("#periodInput")!.value = String(data.period);
}

function resetForm(): void {
  document.querySelector<HTMLTextAreaElement>("#mainInput")!.value = "";
  fillAdvancedForm(DEFAULTS);
  setMessage("setupMessage", "");
}

function switchView(target: "setup" | "display"): void {
  const viewSetup = qs<HTMLElement>("#view-setup");
  const viewDisplay = qs<HTMLElement>("#view-display");
  
  if (target === "display") {
    viewSetup.classList.remove("active");
    viewDisplay.classList.add("active");
    setMessage("displayMessage", "");
  } else {
    viewDisplay.classList.remove("active");
    viewSetup.classList.add("active");
    setMessage("setupMessage", "");
  }
}

async function refreshOtp(): Promise<void> {
  const state = getCurrentFormState();
  qs<HTMLElement>("#configText").textContent = `${state.algorithm} • ${state.digits}位 • ${state.period}s`;

  // 缓存 DOM 节点
  const codeTextEl = qs<HTMLDivElement>("#codeText");
  const remainingTextEl = qs<HTMLElement>("#remainingText");
  const progressBar = qs<HTMLDivElement>("#progressBar");

  try {
    const result = await generateTotp({
      secret: state.secret,
      digits: state.digits,
      period: state.period,
      algorithm: state.algorithm
    });

    codeTextEl.textContent = groupCode(result.code);
    remainingTextEl.textContent = `${result.remainingSeconds} s`;

    const progress = result.remainingSeconds / state.period;
    progressBar.style.transition = result.remainingSeconds === state.period ? "none" : "transform 1s linear";
    progressBar.style.transform = `scaleX(${progress})`;

    // <= 3秒 红色警告状态切换
    if (result.remainingSeconds <= 3) {
      codeTextEl.classList.add("text-danger-flash");
      remainingTextEl.classList.add("text-danger-flash");
      progressBar.classList.add("bg-danger");
    } else {
      codeTextEl.classList.remove("text-danger-flash");
      remainingTextEl.classList.remove("text-danger-flash");
      progressBar.classList.remove("bg-danger");
    }

  } catch (error) {
    codeTextEl.textContent = "------";
    remainingTextEl.textContent = "-- s";
    progressBar.style.transform = "scaleX(0)";
    
    // 如果发生错误，也要清除警告状态
    codeTextEl.classList.remove("text-danger-flash");
    remainingTextEl.classList.remove("text-danger-flash");
    progressBar.classList.remove("bg-danger");

    const message = error instanceof Error ? error.message : "生成验证码失败。";
    setMessage("displayMessage", message, "error");
  }
}

function startTicker(): void {
  void refreshOtp();
  if (tickerTimer) clearInterval(tickerTimer);
  tickerTimer = window.setInterval(() => {
    void refreshOtp();
  }, 1000);
}

function stopTicker(): void {
  if (tickerTimer) {
    clearInterval(tickerTimer);
    tickerTimer = null;
  }
}

function bindEvents(): void {
  const themeToggle = document.querySelector<HTMLButtonElement>("#themeToggle")!;
  const clearBtn = document.querySelector<HTMLButtonElement>("#clearBtn")!;
  const nextBtn = document.querySelector<HTMLButtonElement>("#nextBtn")!;
  const backBtn = document.querySelector<HTMLButtonElement>("#backBtn")!;
  const copyBtn = document.querySelector<HTMLButtonElement>("#copyBtn")!;
  const mainInput = document.querySelector<HTMLTextAreaElement>("#mainInput")!;

  const customSelects = document.querySelectorAll('.custom-select');
  
  document.addEventListener('click', (e) => {
    customSelects.forEach(select => {
      if (!select.contains(e.target as Node)) {
        select.classList.remove('open');
      }
    });
  });

  customSelects.forEach(select => {
    const trigger = select.querySelector('.select-trigger')!;
    const options = select.querySelectorAll('.select-option');

    trigger.addEventListener('click', () => {
      customSelects.forEach(other => {
        if (other !== select) other.classList.remove('open');
      });
      select.classList.toggle('open');
    });

    options.forEach(opt => {
      opt.addEventListener('click', () => {
        const val = (opt as HTMLElement).dataset.val!;
        setCustomSelectValue(select.id, val);
        select.classList.remove('open');
      });
    });
  });

  const modalOverlay = document.querySelector<HTMLDivElement>("#settingsModal")!;
  const openSettingsBtn = document.querySelector<HTMLButtonElement>("#openSettingsBtn")!;
  const closeSettingsBtn = document.querySelector<HTMLButtonElement>("#closeSettingsBtn")!;
  const saveSettingsBtn = document.querySelector<HTMLButtonElement>("#saveSettingsBtn")!;

  const toggleModal = (show: boolean) => {
    if (show) {
      modalOverlay.classList.add("open");
      modalOverlay.setAttribute("aria-hidden", "false");
    } else {
      modalOverlay.classList.remove("open");
      modalOverlay.setAttribute("aria-hidden", "true");
      customSelects.forEach(s => s.classList.remove('open'));
    }
  };

  openSettingsBtn.addEventListener("click", () => toggleModal(true));
  closeSettingsBtn.addEventListener("click", () => toggleModal(false));
  saveSettingsBtn.addEventListener("click", () => toggleModal(false));
  
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) toggleModal(false);
  });

  themeToggle.addEventListener("click", () => {
    themeToggle.classList.add("spin");
    setTimeout(() => themeToggle.classList.remove("spin"), 400);

    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    setTheme(next);
    themeToggle.innerHTML = next === "dark" ? ICON_MOON : ICON_SUN;
  });

  mainInput.addEventListener("input", () => {
    const val = mainInput.value.trim();
    if (val.startsWith("otpauth://")) {
      try {
        const parsed = parseOtpAuthUri(val);
        fillAdvancedForm(parsed);
        setMessage("setupMessage", "已智能识别链接，并应用高级配置", "success");
      } catch {
        setMessage("setupMessage", ""); 
      }
    } else {
      setMessage("setupMessage", "");
    }
  });

  clearBtn.addEventListener("click", () => resetForm());

  nextBtn.addEventListener("click", () => {
    const state = getCurrentFormState();
    const rawVal = mainInput.value.trim();
    
    if (!rawVal) {
      setMessage("setupMessage", "请输入 Secret 或粘贴链接。", "error");
      return;
    }
    if (!state.secret || !isValidBase32(state.secret)) {
      setMessage("setupMessage", "识别不到合法的 Base32 密钥，请检查输入。", "error");
      return;
    }
    if (!Number.isFinite(state.period) || state.period <= 0) {
      setMessage("setupMessage", "周期必须是大于 0 的整数。", "error");
      return;
    }

    switchView("display");
    startTicker();
  });

  backBtn.addEventListener("click", () => {
    stopTicker();
    switchView("setup");
  });

  copyBtn.addEventListener("click", async () => {
    const codeTextEl = document.querySelector<HTMLDivElement>("#codeText")!;
    const codeStr = codeTextEl.textContent?.replace(/\s+/g, "");
    if (!codeStr || codeStr === "------") return;

    try {
      await copyText(codeStr);
      setMessage("displayMessage", "验证码已成功复制。", "success");
      setTimeout(() => setMessage("displayMessage", ""), 2000);
    } catch {
      setMessage("displayMessage", "复制失败，请手动选择复制。", "error");
    }
  });
}

function bootstrap(): void {
  renderApp();
  const theme = getStoredTheme();
  setTheme(theme);
  
  document.querySelector<HTMLButtonElement>("#themeToggle")!.innerHTML = theme === "dark" ? ICON_MOON : ICON_SUN;
  
  bindEvents();
  resetForm();
}

bootstrap();
