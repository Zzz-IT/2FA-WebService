import "./style.css";
import type { ParsedOtpAuth, SupportedAlgorithm } from "./types";
import { normalizeBase32, isValidBase32 } from "./utils/base32";
import { copyText } from "./utils/clipboard";
import { qs } from "./utils/dom";
import { generateTotp } from "./utils/otp";
import { parseOtpAuthUri } from "./utils/otpauth";

const DEFAULTS: ParsedOtpAuth = {
  secret: "",
  issuer: "",
  account: "",
  digits: 6,
  period: 30,
  algorithm: "SHA1"
};

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
  app.innerHTML = `
    <div class="app">
      <header class="topbar">
        <div>
          <h1>TOTP 验证器</h1>
          <p class="subtitle">纯前端本地计算，不上传 secret</p>
        </div>
        <button id="themeToggle" class="theme-btn" type="button" aria-label="切换主题">🌙</button>
      </header>

      <main class="card">
        <section class="notice">
          这个页面只在你的浏览器本地计算 TOTP 动态验证码。不要把 secret 输入到你不信任的页面里。
        </section>

        <section class="form-grid">
          <div class="field">
            <label for="otpauthInput">otpauth:// 链接（可选）</label>
            <textarea
              id="otpauthInput"
              placeholder="粘贴 otpauth://totp/... 链接，系统会自动解析"
            ></textarea>
            <small class="help">如果这里有内容，点击“解析链接”后会自动填充下面的字段。</small>
          </div>

          <div class="actions">
            <button id="parseBtn" class="btn" type="button">解析链接</button>
            <button id="clearBtn" class="btn" type="button">清空</button>
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
            <small class="help">支持空格，系统会自动去掉并转成大写。</small>
          </div>

          <div class="row">
            <div class="field">
              <label for="issuerInput">Issuer</label>
              <input
                id="issuerInput"
                type="text"
                autocomplete="off"
                placeholder="例如：GitHub"
              />
            </div>

            <div class="field">
              <label for="accountInput">Account</label>
              <input
                id="accountInput"
                type="text"
                autocomplete="off"
                placeholder="例如：name@example.com"
              />
            </div>
          </div>

          <div class="row">
            <div class="field">
              <label for="algorithmSelect">算法</label>
              <select id="algorithmSelect">
                <option value="SHA1">SHA1</option>
                <option value="SHA256">SHA256</option>
                <option value="SHA512">SHA512</option>
              </select>
            </div>

            <div class="field">
              <label for="digitsSelect">位数</label>
              <select id="digitsSelect">
                <option value="6">6</option>
                <option value="7">7</option>
                <option value="8">8</option>
              </select>
            </div>
          </div>

          <div class="field">
            <label for="periodInput">周期（秒）</label>
            <input
              id="periodInput"
              type="number"
              min="1"
              step="1"
              value="30"
              inputmode="numeric"
            />
          </div>
        </section>

        <section class="output">
          <div class="meta">
            <div class="meta-item">
              <span class="meta-label">Issuer</span>
              <strong id="issuerText">-</strong>
            </div>
            <div class="meta-item">
              <span class="meta-label">Account</span>
              <strong id="accountText">-</strong>
            </div>
            <div class="meta-item">
              <span class="meta-label">算法 / 位数 / 周期</span>
              <strong id="configText">SHA1 / 6 / 30s</strong>
            </div>
          </div>

          <div class="code-wrap">
            <div id="codeText" class="code">------</div>
            <button id="copyBtn" class="btn primary" type="button">复制验证码</button>
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

          <div id="message" class="message" aria-live="polite"></div>
        </section>

        <section class="footer-note">
          提示：secret 是生成动态码的核心密钥。谁拿到 secret，谁就能生成正确验证码。
          这个项目默认不会把 secret 发到服务器，也不会主动持久化保存。
        </section>
      </main>
    </div>
  `;
}

function groupCode(code: string): string {
  if (code.length === 6) return `${code.slice(0, 3)} ${code.slice(3)}`;
  if (code.length === 7) return `${code.slice(0, 3)} ${code.slice(3)}`;
  if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`;
  return code;
}

function setMessage(text: string, type: "error" | "success" | "" = ""): void {
  const el = qs<HTMLDivElement>("#message");
  el.className = `message${type ? ` ${type}` : ""}`;
  el.textContent = text;
}

function getCurrentFormState(): ParsedOtpAuth {
  const secret = normalizeBase32(qs<HTMLInputElement>("#secretInput").value);
  const issuer = qs<HTMLInputElement>("#issuerInput").value.trim();
  const account = qs<HTMLInputElement>("#accountInput").value.trim();
  const algorithm = qs<HTMLSelectElement>("#algorithmSelect").value as SupportedAlgorithm;
  const digits = Number.parseInt(qs<HTMLSelectElement>("#digitsSelect").value, 10);
  const period = Number.parseInt(qs<HTMLInputElement>("#periodInput").value, 10);

  return {
    secret,
    issuer,
    account,
    algorithm,
    digits,
    period
  };
}

function fillForm(data: ParsedOtpAuth): void {
  qs<HTMLInputElement>("#secretInput").value = data.secret;
  qs<HTMLInputElement>("#issuerInput").value = data.issuer;
  qs<HTMLInputElement>("#accountInput").value = data.account;
  qs<HTMLSelectElement>("#algorithmSelect").value = data.algorithm;
  qs<HTMLSelectElement>("#digitsSelect").value = String(data.digits);
  qs<HTMLInputElement>("#periodInput").value = String(data.period);
}

function resetForm(): void {
  qs<HTMLTextAreaElement>("#otpauthInput").value = "";
  fillForm(DEFAULTS);
  qs<HTMLDivElement>("#codeText").textContent = "------";
  qs<HTMLElement>("#issuerText").textContent = "-";
  qs<HTMLElement>("#accountText").textContent = "-";
  qs<HTMLElement>("#configText").textContent = "SHA1 / 6 / 30s";
  qs<HTMLElement>("#remainingText").textContent = "-- s";
  qs<HTMLDivElement>("#progressBar").style.transform = "scaleX(0)";
  setMessage("");
}

async function refreshOtp(): Promise<void> {
  const state = getCurrentFormState();

  qs<HTMLElement>("#issuerText").textContent = state.issuer || "-";
  qs<HTMLElement>("#accountText").textContent = state.account || "-";
  qs<HTMLElement>("#configText").textContent =
    `${state.algorithm} / ${state.digits} / ${state.period}s`;

  if (!state.secret) {
    qs<HTMLDivElement>("#codeText").textContent = "------";
    qs<HTMLElement>("#remainingText").textContent = "-- s";
    qs<HTMLDivElement>("#progressBar").style.transform = "scaleX(0)";
    setMessage("请输入 Base32 secret，或先解析 otpauth:// 链接。");
    return;
  }

  if (!isValidBase32(state.secret)) {
    qs<HTMLDivElement>("#codeText").textContent = "------";
    qs<HTMLElement>("#remainingText").textContent = "-- s";
    qs<HTMLDivElement>("#progressBar").style.transform = "scaleX(0)";
    setMessage("Secret 不是合法的 Base32 格式。", "error");
    return;
  }

  if (!Number.isFinite(state.period) || state.period <= 0) {
    qs<HTMLDivElement>("#codeText").textContent = "------";
    qs<HTMLElement>("#remainingText").textContent = "-- s";
    qs<HTMLDivElement>("#progressBar").style.transform = "scaleX(0)";
    setMessage("周期必须是大于 0 的整数。", "error");
    return;
  }

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
    qs<HTMLDivElement>("#progressBar").style.transform = `scaleX(${progress})`;

    setMessage("验证码已在本地生成。", "success");
  } catch (error) {
    qs<HTMLDivElement>("#codeText").textContent = "------";
    qs<HTMLElement>("#remainingText").textContent = "-- s";
    qs<HTMLDivElement>("#progressBar").style.transform = "scaleX(0)";

    const message = error instanceof Error ? error.message : "生成验证码失败。";
    setMessage(message, "error");
  }
}

function bindEvents(): void {
  const themeToggle = qs<HTMLButtonElement>("#themeToggle");
  const parseBtn = qs<HTMLButtonElement>("#parseBtn");
  const clearBtn = qs<HTMLButtonElement>("#clearBtn");
  const copyBtn = qs<HTMLButtonElement>("#copyBtn");

  const inputs = [
    qs<HTMLTextAreaElement>("#otpauthInput"),
    qs<HTMLInputElement>("#secretInput"),
    qs<HTMLInputElement>("#issuerInput"),
    qs<HTMLInputElement>("#accountInput"),
    qs<HTMLSelectElement>("#algorithmSelect"),
    qs<HTMLSelectElement>("#digitsSelect"),
    qs<HTMLInputElement>("#periodInput")
  ];

  themeToggle.addEventListener("click", () => {
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    setTheme(next);
    themeToggle.textContent = next === "dark" ? "🌙" : "☀️";
  });

  parseBtn.addEventListener("click", async () => {
    const raw = qs<HTMLTextAreaElement>("#otpauthInput").value.trim();
    if (!raw) {
      setMessage("请先粘贴 otpauth:// 链接。", "error");
      return;
    }

    try {
      const parsed = parseOtpAuthUri(raw);
      fillForm(parsed);
      setMessage("otpauth 链接解析成功。", "success");
      await refreshOtp();
    } catch (error) {
      const message = error instanceof Error ? error.message : "解析失败。";
      setMessage(message, "error");
    }
  });

  clearBtn.addEventListener("click", () => {
    resetForm();
  });

  copyBtn.addEventListener("click", async () => {
    const state = getCurrentFormState();

    if (!state.secret || !isValidBase32(state.secret)) {
      setMessage("当前没有可复制的有效验证码。", "error");
      return;
    }

    try {
      const result = await generateTotp({
        secret: state.secret,
        digits: state.digits,
        period: state.period,
        algorithm: state.algorithm
      });

      await copyText(result.code);
      setMessage("验证码已复制。", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "复制失败。";
      setMessage(message, "error");
    }
  });

  for (const input of inputs) {
    input.addEventListener("input", () => {
      void refreshOtp();
    });

    input.addEventListener("change", () => {
      void refreshOtp();
    });
  }
}

function startTicker(): void {
  void refreshOtp();
  window.setInterval(() => {
    void refreshOtp();
  }, 1000);
}

function bootstrap(): void {
  renderApp();

  const theme = getStoredTheme();
  setTheme(theme);

  const themeToggle = qs<HTMLButtonElement>("#themeToggle");
  themeToggle.textContent = theme === "dark" ? "🌙" : "☀️";

  bindEvents();
  resetForm();
  startTicker();
}

bootstrap();
