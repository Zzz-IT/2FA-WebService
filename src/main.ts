import "./style.css";
import type { ParsedOtpAuth, SupportedAlgorithm } from "./types";
import { normalizeBase32, isValidBase32 } from "./utils/base32";
import { copyText } from "./utils/clipboard";
import { qs } from "./utils/dom";
import { generateTotp } from "./utils/otp";
import { parseOtpAuthUri } from "./utils/otpauth";

const DEFAULTS: Omit<ParsedOtpAuth, "issuer" | "account"> = {
  secret: "",
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
  
  // 插入流动背景和应用主体
  document.body.insertAdjacentHTML("afterbegin", `
    <div class="bg-blobs">
      <div class="blob blob-1"></div>
      <div class="blob blob-2"></div>
    </div>
  `);

  app.innerHTML = `
    <div class="app">
      <header class="topbar">
        <div>
          <h1>TOTP 验证器</h1>
          <p class="subtitle">纯前端本地计算，安全可靠</p>
        </div>
        <button id="themeToggle" class="theme-btn" type="button" aria-label="切换主题">🌙</button>
      </header>

      <div class="view-container">
        <main id="view-setup" class="view active">
          <section class="notice">
            验证码仅在本地生成，您的 Secret 密钥不会被上传到任何服务器。
          </section>

          <section class="form-grid">
            <div class="field">
              <label for="otpauthInput">快捷导入 (otpauth://)</label>
              <textarea
                id="otpauthInput"
                placeholder="粘贴 otpauth:// 链接，自动解析填充"
              ></textarea>
            </div>

            <div class="field">
              <label for="secretInput">Base32 Secret</label>
              <input
                id="secretInput"
                type="text"
                inputmode="text"
                autocomplete="off"
                spellcheck="false"
                placeholder="例如：JBSWY3DPEHPK3PXP"
              />
              <small class="help">自动忽略空格并转为大写。</small>
            </div>

            <details class="advanced-settings">
              <summary>高级设置 ⚙️</summary>
              <div class="advanced-settings-content">
                <div class="row">
                  <div class="field">
                    <label for="algorithmSelect">加密算法</label>
                    <select id="algorithmSelect">
                      <option value="SHA1">SHA1 (默认)</option>
                      <option value="SHA256">SHA256</option>
                      <option value="SHA512">SHA512</option>
                    </select>
                  </div>
                  <div class="field">
                    <label for="digitsSelect">验证码位数</label>
                    <select id="digitsSelect">
                      <option value="6">6 位</option>
                      <option value="7">7 位</option>
                      <option value="8">8 位</option>
                    </select>
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
              </div>
            </details>
          </section>

          <div id="setupMessage" class="message" aria-live="polite"></div>

          <div class="actions">
            <button id="clearBtn" class="btn" type="button">清空内容</button>
            <button id="nextBtn" class="btn primary" type="button">生成验证码</button>
          </div>
        </main>

        <main id="view-display" class="view">
          <section class="output">
            <div class="meta">
              <span id="configText">SHA1 • 6位 • 30s</span>
            </div>

            <div class="code-wrap">
              <div id="codeText" class="code">------</div>
              <button id="copyBtn" class="btn primary" type="button" style="width: 100%; max-width: 200px;">复制验证码</button>
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
  return {
    secret: normalizeBase32(qs<HTMLInputElement>("#secretInput").value),
    algorithm: qs<HTMLSelectElement>("#algorithmSelect").value as SupportedAlgorithm,
    digits: Number.parseInt(qs<HTMLSelectElement>("#digitsSelect").value, 10),
    period: Number.parseInt(qs<HTMLInputElement>("#periodInput").value, 10)
  };
}

function fillForm(data: Partial<ParsedOtpAuth>): void {
  if (data.secret !== undefined) qs<HTMLInputElement>("#secretInput").value = data.secret;
  if (data.algorithm !== undefined) qs<HTMLSelectElement>("#algorithmSelect").value = data.algorithm;
  if (data.digits !== undefined) qs<HTMLSelectElement>("#digitsSelect").value = String(data.digits);
  if (data.period !== undefined) qs<HTMLInputElement>("#periodInput").value = String(data.period);
}

function resetForm(): void {
  qs<HTMLTextAreaElement>("#otpauthInput").value = "";
  fillForm(DEFAULTS);
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

  try {
    const result = await generateTotp({
      secret: state.secret,
      digits: state.digits,
      period: state.period,
      algorithm: state.algorithm
    });

    qs<HTMLDivElement>("#codeText").textContent = groupCode(result.code);
    qs<HTMLElement>("#remainingText").textContent = `${result.remainingSeconds} s`;

    const progress = result.remainingSeconds / state.period;
    // 移除动画以防止进度条回弹瞬间闪烁，如果需要平滑可交由 css transform 结合 requestAnimationFrame 处理
    const progressBar = qs<HTMLDivElement>("#progressBar");
    progressBar.style.transition = result.remainingSeconds === state.period ? "none" : "transform 1s linear";
    progressBar.style.transform = `scaleX(${progress})`;

  } catch (error) {
    qs<HTMLDivElement>("#codeText").textContent = "------";
    qs<HTMLElement>("#remainingText").textContent = "-- s";
    qs<HTMLDivElement>("#progressBar").style.transform = "scaleX(0)";
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
  const themeToggle = qs<HTMLButtonElement>("#themeToggle");
  const clearBtn = qs<HTMLButtonElement>("#clearBtn");
  const nextBtn = qs<HTMLButtonElement>("#nextBtn");
  const backBtn = qs<HTMLButtonElement>("#backBtn");
  const copyBtn = qs<HTMLButtonElement>("#copyBtn");
  const otpauthInput = qs<HTMLTextAreaElement>("#otpauthInput");

  themeToggle.addEventListener("click", () => {
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    setTheme(next);
    themeToggle.textContent = next === "dark" ? "🌙" : "☀️";
  });

  // 监听 URI 解析
  otpauthInput.addEventListener("input", () => {
    const raw = otpauthInput.value.trim();
    if (!raw) return;
    try {
      const parsed = parseOtpAuthUri(raw);
      fillForm(parsed);
      setMessage("setupMessage", "链接已自动解析填充。", "success");
    } catch {
      // 在输入过程中不强制报错，静默失败即可
    }
  });

  clearBtn.addEventListener("click", () => {
    resetForm();
  });

  // 前往展示页
  nextBtn.addEventListener("click", () => {
    const state = getCurrentFormState();
    
    if (!state.secret) {
      setMessage("setupMessage", "请输入 Base32 secret。", "error");
      return;
    }
    if (!isValidBase32(state.secret)) {
      setMessage("setupMessage", "Secret 不是合法的 Base32 格式。", "error");
      return;
    }
    if (!Number.isFinite(state.period) || state.period <= 0) {
      setMessage("setupMessage", "周期必须是大于 0 的整数。", "error");
      return;
    }

    switchView("display");
    startTicker();
  });

  // 返回修改页
  backBtn.addEventListener("click", () => {
    stopTicker();
    switchView("setup");
  });

  // 复制动态码
  copyBtn.addEventListener("click", async () => {
    const codeStr = qs<HTMLDivElement>("#codeText").textContent?.replace(/\s+/g, "");
    if (!codeStr || codeStr === "------") return;

    try {
      await copyText(codeStr);
      setMessage("displayMessage", "验证码已成功复制。", "success");
      setTimeout(() => setMessage("displayMessage", ""), 2000);
    } catch (error) {
      setMessage("displayMessage", "复制失败，请手动选择复制。", "error");
    }
  });
}

function bootstrap(): void {
  renderApp();
  const theme = getStoredTheme();
  setTheme(theme);
  qs<HTMLButtonElement>("#themeToggle").textContent = theme === "dark" ? "🌙" : "☀️";
  bindEvents();
  resetForm();
}

bootstrap();
