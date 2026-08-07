const DATA_URL = "./data/company_details_latest_all.json";
const SUMMARY_URL = "./data/latest_summary.json";

const state = {
  records: [],
  filtered: [],
  selectedId: null,
  user: null,
  statuses: new Map(),
  statusTimes: new Map(),
};

const els = {
  sourceLabel: document.getElementById("sourceLabel"),
  totalCount: document.getElementById("totalCount"),
  filteredCount: document.getElementById("filteredCount"),
  appliedCount: document.getElementById("appliedCount"),
  lastUpdateCount: document.getElementById("lastUpdateCount"),
  lastUpdateTime: document.getElementById("lastUpdateTime"),
  keywordInput: document.getElementById("keywordInput"),
  industrySelect: document.getElementById("industrySelect"),
  typeSelect: document.getElementById("typeSelect"),
  locationInput: document.getElementById("locationInput"),
  recruitmentSelect: document.getElementById("recruitmentSelect"),
  targetSelect: document.getElementById("targetSelect"),
  sortSelect: document.getElementById("sortSelect"),
  resetButton: document.getElementById("resetButton"),
  resultList: document.getElementById("resultList"),
  detailPanel: document.getElementById("detailPanel"),
  signedOutPanel: document.getElementById("signedOutPanel"),
  signedInPanel: document.getElementById("signedInPanel"),
  emailInput: document.getElementById("emailInput"),
  passwordInput: document.getElementById("passwordInput"),
  loginButton: document.getElementById("loginButton"),
  logoutButton: document.getElementById("logoutButton"),
  userEmail: document.getElementById("userEmail"),
  authMessage: document.getElementById("authMessage"),
  toast: document.getElementById("toast"),
};

const config = window.OFFERWEB_CONFIG || {};
const supabaseClient =
  window.supabase && config.supabaseUrl && config.supabasePublishableKey
    ? window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey)
    : null;

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (value === undefined || value === null || value === "") return [];
  return [String(value)];
}

function splitTokens(value) {
  return asArray(value)
    .flatMap((item) => item.split(/[,\uFF0C/|;；、]/))
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseLocationQuery(value) {
  return splitTokens(value).reduce(
    (result, token) => {
      if (token.startsWith("-")) {
        const excluded = token.slice(1).trim();
        if (excluded) result.exclude.push(excluded);
      } else {
        result.include.push(token);
      }
      return result;
    },
    { include: [], exclude: [] },
  );
}

function matchesLocationQuery(locations, query) {
  const locationText = asArray(locations).join(" ");
  const hasIncludedLocation =
    query.include.length === 0 || query.include.some((item) => locationText.includes(item));
  const hasExcludedLocation = query.exclude.some((item) => locationText.includes(item));
  return hasIncludedLocation && !hasExcludedLocation;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value));
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function formatText(value, fallback = "-") {
  const text = asArray(value).join("、").trim();
  return text || fallback;
}

function normalizeDate(value) {
  if (!value) return 0;
  const timestamp = Date.parse(String(value).replace(" ", "T"));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatDateTime(value, fallback = "-") {
  const timestamp = normalizeDate(value);
  if (!timestamp) return fallback;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function jobKey(id) {
  return String(id ?? "");
}

function getStatus(record) {
  return state.statuses.get(jobKey(record.id)) || "unapplied";
}

function getStatusLabel(status) {
  return status === "applied" ? "已投递" : "未投递";
}

function statusBadge(status) {
  return `<span class="status-label status-${status}">${getStatusLabel(status)}</span>`;
}

function showToast(message, type = "success") {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.className = `toast toast-${type}`;
  els.toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, 2600);
}

function setAuthMessage(message, isError = false) {
  els.authMessage.textContent = message;
  els.authMessage.classList.toggle("error", isError);
}

function getSearchText(record) {
  return [
    record.name,
    record.type,
    record.industry,
    record.recruitment_type,
    record.target_candidates,
    record.company_size,
    record.deadline,
    record.update_time,
    record.exam_info,
    record.notes,
    ...asArray(record.locations),
    ...asArray(record.positions),
  ]
    .join(" ")
    .toLowerCase();
}

function populateSelect(select, values, allLabel) {
  const selected = select.value;
  select.innerHTML = `<option value="">${escapeHtml(allLabel)}</option>`;
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
  if (values.includes(selected)) select.value = selected;
}

function uniqueSorted(records, getter) {
  return [...new Set(records.flatMap(getter).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "zh-Hans-CN"),
  );
}

function buildFilters() {
  populateSelect(
    els.industrySelect,
    uniqueSorted(state.records, (record) => splitTokens(record.industry)),
    "全部行业",
  );
  populateSelect(
    els.typeSelect,
    uniqueSorted(state.records, (record) => splitTokens(record.type)),
    "全部性质",
  );
  populateSelect(
    els.recruitmentSelect,
    uniqueSorted(state.records, (record) => splitTokens(record.recruitment_type)),
    "全部类型",
  );
  populateSelect(
    els.targetSelect,
    uniqueSorted(state.records, (record) => splitTokens(record.target_candidates)),
    "全部届别",
  );
}

function matchesSelect(value, selected, splitter = splitTokens) {
  if (!selected) return true;
  return splitter(value).includes(selected);
}

function applyFilters() {
  const keyword = els.keywordInput.value.trim().toLowerCase();
  const industry = els.industrySelect.value;
  const type = els.typeSelect.value;
  const locationQuery = parseLocationQuery(els.locationInput.value);
  const recruitment = els.recruitmentSelect.value;
  const target = els.targetSelect.value;

  state.filtered = state.records.filter((record) => {
    if (keyword && !getSearchText(record).includes(keyword)) return false;
    if (!matchesSelect(record.industry, industry)) return false;
    if (!matchesSelect(record.type, type)) return false;
    if (!matchesLocationQuery(record.locations, locationQuery)) return false;
    if (!matchesSelect(record.recruitment_type, recruitment)) return false;
    if (!matchesSelect(record.target_candidates, target)) return false;
    return true;
  });

  sortFiltered();
  els.filteredCount.textContent = state.filtered.length.toLocaleString("zh-CN");

  if (!state.filtered.some((record) => jobKey(record.id) === jobKey(state.selectedId))) {
    state.selectedId = state.filtered[0]?.id ?? null;
  }

  renderList();
  renderSelectedDetail();
}

function sortFiltered() {
  const mode = els.sortSelect.value;
  state.filtered.sort((a, b) => {
    if (mode === "update_asc") return normalizeDate(a.update_time) - normalizeDate(b.update_time);
    if (mode === "name_asc") {
      return String(a.name ?? "").localeCompare(String(b.name ?? ""), "zh-Hans-CN");
    }
    if (mode === "deadline_asc") {
      const aDate = normalizeDate(a.deadline) || Number.MAX_SAFE_INTEGER;
      const bDate = normalizeDate(b.deadline) || Number.MAX_SAFE_INTEGER;
      return aDate - bDate;
    }
    return normalizeDate(b.update_time) - normalizeDate(a.update_time);
  });
}

function renderList() {
  if (!state.filtered.length) {
    els.resultList.innerHTML = `<div class="empty-state compact">没有匹配记录</div>`;
    return;
  }

  els.resultList.innerHTML = state.filtered
    .map((record) => {
      const status = getStatus(record);
      const active = jobKey(record.id) === jobKey(state.selectedId) ? " active" : "";
      return `
        <button class="result-item${active}" type="button" data-id="${escapeHtml(jobKey(record.id))}">
          <span class="result-title">
            <strong>${escapeHtml(record.name)}</strong>
            ${statusBadge(status)}
          </span>
          <span class="meta-line">
            <span class="pill">${escapeHtml(formatText(record.type))}</span>
            <span>${escapeHtml(formatText(record.industry))}</span>
            <span>${escapeHtml(formatText(record.locations))}</span>
            <span>${escapeHtml(formatText(record.recruitment_type))}</span>
          </span>
          <span class="positions-preview">${escapeHtml(formatText(record.positions))}</span>
        </button>
      `;
    })
    .join("");
}

function infoBox(label, value) {
  return `
    <div class="info-box">
      <span>${escapeHtml(label)}</span>
      <div>${escapeHtml(formatText(value))}</div>
    </div>
  `;
}

function renderStatusControl(record) {
  const status = getStatus(record);
  const disabled = state.user ? "" : " disabled";
  const hint = state.user
    ? `状态会永久保存到账号 ${escapeHtml(state.user.email || "")}`
    : "登录后才可以永久修改投递状态";
  const updatedAt = state.statusTimes.get(jobKey(record.id));

  return `
    <section class="application-box">
      <div class="application-heading">
        <div>
          <span class="field-label">投递状态</span>
          ${statusBadge(status)}
        </div>
        ${updatedAt ? `<small>修改于 ${escapeHtml(formatDateTime(updatedAt))}</small>` : ""}
      </div>
      <div class="status-toggle" role="group" aria-label="修改投递状态">
        <button class="status-choice status-choice-applied${status === "applied" ? " selected" : ""}" type="button" data-status="applied" data-job-id="${escapeHtml(jobKey(record.id))}"${disabled}>已投递</button>
        <button class="status-choice status-choice-unapplied${status === "unapplied" ? " selected" : ""}" type="button" data-status="unapplied" data-job-id="${escapeHtml(jobKey(record.id))}"${disabled}>未投递</button>
      </div>
      <p>${hint}</p>
    </section>
  `;
}

function renderDetail(record) {
  if (!record) {
    els.detailPanel.innerHTML = `<div class="empty-state">没有可显示的记录</div>`;
    return;
  }

  const links = [...asArray(record.related_links), record.recruitment_notice]
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index);
  const positions = asArray(record.positions);

  els.detailPanel.innerHTML = `
    <div class="detail-header">
      <div class="detail-title-row">
        <h2>${escapeHtml(record.name)}</h2>
        ${statusBadge(getStatus(record))}
      </div>
      <div class="meta-line">
        <span class="pill">${escapeHtml(formatText(record.type))}</span>
        <span class="pill">${escapeHtml(formatText(record.recruitment_type))}</span>
        <span class="pill">${escapeHtml(formatText(record.target_candidates))}</span>
      </div>
    </div>

    ${renderStatusControl(record)}

    <div class="detail-grid">
      ${infoBox("行业", record.industry)}
      ${infoBox("地点", record.locations)}
      ${infoBox("截止时间", record.deadline)}
      ${infoBox("岗位更新时间", record.update_time)}
      ${infoBox("公司规模", record.company_size)}
      ${infoBox("笔面试", record.exam_info)}
      ${infoBox("内推码", record.referral_code || "-")}
      ${infoBox("原始状态", record.progress_status || "-")}
    </div>

    <h3 class="section-title">岗位</h3>
    <ul class="position-list">
      ${
        positions.length
          ? positions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
          : `<li class="warning">未提供岗位字段</li>`
      }
    </ul>

    <h3 class="section-title">链接</h3>
    <div class="link-list">
      ${
        links.length
          ? links
              .map((link) => {
                const safeLink = safeHttpUrl(link);
                if (!safeLink) return `<span class="warning">无效链接：${escapeHtml(link)}</span>`;
                return `<a href="${escapeHtml(safeLink)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link)}</a>`;
              })
              .join("")
          : `<span class="warning">暂无链接</span>`
      }
    </div>

    <h3 class="section-title">备注</h3>
    <div class="notes">${escapeHtml(record.notes || "-")}</div>
  `;
}

function renderSelectedDetail() {
  const selected = state.filtered.find(
    (record) => jobKey(record.id) === jobKey(state.selectedId),
  );
  renderDetail(selected);
}

function updateAppliedCount() {
  const count = [...state.statuses.values()].filter((status) => status === "applied").length;
  els.appliedCount.textContent = count.toLocaleString("zh-CN");
}

function renderAuth() {
  const signedIn = Boolean(state.user);
  els.signedOutPanel.hidden = signedIn;
  els.signedInPanel.hidden = !signedIn;
  els.userEmail.textContent = state.user?.email || "-";
  if (signedIn) setAuthMessage("投递状态已连接云端");
  else setAuthMessage("登录后可跨设备永久保存");
}

async function loadStatuses() {
  state.statuses.clear();
  state.statusTimes.clear();

  if (!state.user || !supabaseClient) {
    updateAppliedCount();
    renderList();
    renderSelectedDetail();
    return;
  }

  const { data, error } = await supabaseClient
    .from("job_application_status")
    .select("job_id,status,updated_at");

  if (error) {
    setAuthMessage(`状态读取失败：${error.message}`, true);
    showToast("投递状态读取失败", "error");
    return;
  }

  (data || []).forEach((item) => {
    const key = jobKey(item.job_id);
    state.statuses.set(key, item.status === "applied" ? "applied" : "unapplied");
    if (item.updated_at) state.statusTimes.set(key, item.updated_at);
  });

  updateAppliedCount();
  renderList();
  renderSelectedDetail();
}

async function setJobStatus(jobId, status, button) {
  if (!state.user || !supabaseClient) {
    showToast("请先登录后再修改投递状态", "error");
    els.emailInput?.focus();
    return;
  }

  const key = jobKey(jobId);
  const previousStatus = state.statuses.get(key);
  const previousTime = state.statusTimes.get(key);
  const buttons = [...els.detailPanel.querySelectorAll(".status-choice")];
  buttons.forEach((item) => (item.disabled = true));
  if (button) button.textContent = "保存中…";

  state.statuses.set(key, status);
  state.statusTimes.set(key, new Date().toISOString());
  updateAppliedCount();
  renderList();

  const { data, error } = await supabaseClient
    .from("job_application_status")
    .upsert(
      {
        user_id: state.user.id,
        job_id: key,
        status,
      },
      { onConflict: "user_id,job_id" },
    )
    .select("updated_at")
    .single();

  if (error) {
    if (previousStatus) state.statuses.set(key, previousStatus);
    else state.statuses.delete(key);
    if (previousTime) state.statusTimes.set(key, previousTime);
    else state.statusTimes.delete(key);
    updateAppliedCount();
    renderList();
    renderSelectedDetail();
    showToast(`保存失败：${error.message}`, "error");
    return;
  }

  if (data?.updated_at) state.statusTimes.set(key, data.updated_at);
  renderSelectedDetail();
  showToast(`已标记为${getStatusLabel(status)}`);
}

async function login() {
  if (!supabaseClient) {
    setAuthMessage("Supabase 配置未加载", true);
    return;
  }

  const email = els.emailInput.value.trim();
  const password = els.passwordInput.value;
  if (!email || !password) {
    setAuthMessage("请输入邮箱和密码", true);
    return;
  }

  els.loginButton.disabled = true;
  els.loginButton.textContent = "登录中…";
  setAuthMessage("正在验证账号");

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  els.loginButton.disabled = false;
  els.loginButton.textContent = "登录";

  if (error) {
    setAuthMessage(`登录失败：${error.message}`, true);
    return;
  }

  els.passwordInput.value = "";
  showToast("登录成功，投递状态已同步");
}

async function logout() {
  if (!supabaseClient) return;
  els.logoutButton.disabled = true;
  const { error } = await supabaseClient.auth.signOut();
  els.logoutButton.disabled = false;
  if (error) {
    showToast(`退出失败：${error.message}`, "error");
    return;
  }
  showToast("已退出登录");
}

async function loadSummary(records) {
  let summary = {};
  try {
    const response = await fetch(SUMMARY_URL, { cache: "no-store" });
    if (response.ok) summary = await response.json();
  } catch {
    summary = {};
  }

  const updateCount =
    summary.new_ids ?? summary.updated_ids ?? summary.updated_count ?? summary.new_count ?? "-";
  els.lastUpdateCount.textContent =
    typeof updateCount === "number" ? updateCount.toLocaleString("zh-CN") : String(updateCount);

  const recordTimes = records.map((record) => normalizeDate(record.update_time)).filter(Boolean);
  const latestRecordTime = recordTimes.length ? Math.max(...recordTimes) : 0;
  const summaryTime =
    summary.updated_at || summary.update_time || summary.generated_at || summary.last_update_time;
  els.lastUpdateTime.textContent = formatDateTime(summaryTime || latestRecordTime);
}

async function loadRecords() {
  const response = await fetch(DATA_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const records = await response.json();
  state.records = Array.isArray(records) ? records : [];
  state.selectedId = state.records[0]?.id ?? null;
  els.totalCount.textContent = state.records.length.toLocaleString("zh-CN");
  els.sourceLabel.textContent = `数据源：${DATA_URL.replace("./", "")}`;
  buildFilters();
  applyFilters();
  await loadSummary(state.records);
}

async function initAuth() {
  if (!supabaseClient) {
    setAuthMessage("Supabase SDK 或配置加载失败", true);
    els.loginButton.disabled = true;
    return;
  }

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) setAuthMessage(`会话读取失败：${error.message}`, true);
  state.user = data?.session?.user || null;
  renderAuth();
  await loadStatuses();

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(async () => {
      state.user = session?.user || null;
      renderAuth();
      await loadStatuses();
    }, 0);
  });
}

async function init() {
  els.resultList.innerHTML = `<div class="empty-state compact">正在加载数据</div>`;

  try {
    await loadRecords();
  } catch (error) {
    els.resultList.innerHTML = `<div class="empty-state compact">数据加载失败</div>`;
    els.detailPanel.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }

  await initAuth();
}

[
  els.keywordInput,
  els.industrySelect,
  els.typeSelect,
  els.locationInput,
  els.recruitmentSelect,
  els.targetSelect,
].forEach((element) => element.addEventListener("input", applyFilters));

els.sortSelect.addEventListener("input", applyFilters);
els.resetButton.addEventListener("click", () => {
  els.keywordInput.value = "";
  els.industrySelect.value = "";
  els.typeSelect.value = "";
  els.locationInput.value = "";
  els.recruitmentSelect.value = "";
  els.targetSelect.value = "";
  applyFilters();
});

els.resultList.addEventListener("click", (event) => {
  const item = event.target.closest(".result-item");
  if (!item) return;
  state.selectedId = item.dataset.id;
  renderList();
  renderSelectedDetail();
});

els.detailPanel.addEventListener("click", (event) => {
  const button = event.target.closest(".status-choice");
  if (!button) return;
  setJobStatus(button.dataset.jobId, button.dataset.status, button);
});

els.loginButton.addEventListener("click", login);
els.logoutButton.addEventListener("click", logout);
els.passwordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") login();
});

init();
