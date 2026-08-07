const DATA_URL = "./data/company_details_latest_all.json";

const client = window.supabase.createClient(
  window.OFFERWEB_CONFIG.supabaseUrl,
  window.OFFERWEB_CONFIG.supabasePublishableKey,
);

const state = {
  records: [],
  applied: [],
  selectedId: null,
  updatedTimes: new Map(),
};

const els = {
  list: document.getElementById("resultList"),
  detail: document.getElementById("detailPanel"),
  search: document.getElementById("appliedSearch"),
  sort: document.getElementById("appliedSort"),
  count: document.getElementById("appliedCount"),
  user: document.getElementById("appliedUser"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function arr(v) {
  return Array.isArray(v) ? v : v ? [v] : [];
}

function key(v) {
  return String(v);
}

function formatText(v) {
  return arr(v).join("、") || "-";
}

function renderList() {
  const keyword = els.search.value.trim().toLowerCase();
  let list = state.applied.filter((item) => {
    const text = [item.name, item.positions, item.locations].flat().join(" ").toLowerCase();
    return !keyword || text.includes(keyword);
  });

  if (els.sort.value === "name_asc") {
    list.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  } else {
    list.sort((a, b) => (state.updatedTimes.get(key(b.id)) || "").localeCompare(state.updatedTimes.get(key(a.id)) || ""));
  }

  els.count.textContent = `${list.length} 个已投递`;

  els.list.innerHTML = list.length
    ? list.map((item) => `
      <button class="result-item${key(item.id) === key(state.selectedId) ? " active" : ""}" data-id="${escapeHtml(item.id)}" type="button">
        <span class="result-title">
          <strong>${escapeHtml(item.name)}</strong>
          <span class="status-label status-applied">已投递</span>
        </span>
        <span class="positions-preview">${escapeHtml(formatText(item.positions))}</span>
      </button>
    `).join("")
    : `<div class="empty-state compact">暂无已投递岗位</div>`;
}

function renderDetail(item) {
  if (!item) {
    els.detail.innerHTML = `<div class="empty-state">选择岗位查看详情</div>`;
    return;
  }

  els.detail.innerHTML = `
    <div class="detail-header">
      <div class="detail-title-row">
        <h2>${escapeHtml(item.name)}</h2>
        <span class="status-label status-applied">已投递</span>
      </div>
    </div>
    <div class="detail-grid">
      <div class="info-box"><span>岗位</span><div>${escapeHtml(formatText(item.positions))}</div></div>
      <div class="info-box"><span>地点</span><div>${escapeHtml(formatText(item.locations))}</div></div>
      <div class="info-box"><span>行业</span><div>${escapeHtml(formatText(item.industry))}</div></div>
      <div class="info-box"><span>截止时间</span><div>${escapeHtml(item.deadline || "-")}</div></div>
    </div>
    <a class="secondary-button" href="./index.html">返回详情管理</a>
  `;
}

async function loadApplied() {
  const { data: sessionData } = await client.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) {
    els.list.innerHTML = `<div class="empty-state compact">请先在首页登录</div>`;
    return;
  }

  els.user.textContent = user.email;

  const { data: statuses, error } = await client
    .from("job_application_status")
    .select("job_id,updated_at")
    .eq("status", "applied");

  if (error) {
    els.list.innerHTML = `<div class="empty-state compact">读取失败：${escapeHtml(error.message)}</div>`;
    return;
  }

  (statuses || []).forEach((item) => state.updatedTimes.set(key(item.job_id), item.updated_at));

  state.records = await fetch(DATA_URL).then((r) => r.json());
  const ids = new Set((statuses || []).map((item) => key(item.job_id)));
  state.applied = state.records.filter((item) => ids.has(key(item.id)));
  state.selectedId = state.applied[0]?.id;

  renderList();
  renderDetail(state.applied[0]);
}

els.list.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-id]");
  if (!button) return;
  state.selectedId = button.dataset.id;
  renderList();
  renderDetail(state.applied.find((item) => key(item.id) === key(state.selectedId)));
});

els.search.addEventListener("input", renderList);
els.sort.addEventListener("change", renderList);

loadApplied();
