const DATA_URL = "./data/company_details_latest_all.json";

const state = {
  records: [],
  filtered: [],
  selectedId: null,
};

const els = {
  sourceLabel: document.getElementById("sourceLabel"),
  totalCount: document.getElementById("totalCount"),
  filteredCount: document.getElementById("filteredCount"),
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
};

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

function formatText(value, fallback = "-") {
  const text = asArray(value).join("、").trim();
  return text || fallback;
}

function normalizeDate(value) {
  if (!value) return 0;
  const timestamp = Date.parse(String(value).replace(" ", "T"));
  return Number.isFinite(timestamp) ? timestamp : 0;
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
  if (values.includes(selected)) {
    select.value = selected;
  }
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
  renderList();
  els.filteredCount.textContent = state.filtered.length.toLocaleString("zh-CN");

  if (!state.filtered.some((record) => record.id === state.selectedId)) {
    state.selectedId = state.filtered[0]?.id ?? null;
    renderDetail(state.filtered[0]);
  }
}

function sortFiltered() {
  const mode = els.sortSelect.value;
  state.filtered.sort((a, b) => {
    if (mode === "update_asc") return normalizeDate(a.update_time) - normalizeDate(b.update_time);
    if (mode === "name_asc") return String(a.name ?? "").localeCompare(String(b.name ?? ""), "zh-Hans-CN");
    if (mode === "deadline_asc") return normalizeDate(a.deadline) - normalizeDate(b.deadline);
    return normalizeDate(b.update_time) - normalizeDate(a.update_time);
  });
}

function renderList() {
  if (!state.filtered.length) {
    els.resultList.innerHTML = `<div class="empty-state">没有匹配记录</div>`;
    return;
  }

  els.resultList.innerHTML = state.filtered
    .map((record) => {
      const locations = formatText(record.locations);
      const positions = formatText(record.positions);
      const active = record.id === state.selectedId ? " active" : "";
      return `
        <button class="result-item${active}" type="button" data-id="${escapeHtml(record.id)}">
          <span class="result-title">
            <strong>${escapeHtml(record.name)}</strong>
            <span class="pill">${escapeHtml(formatText(record.type))}</span>
          </span>
          <span class="meta-line">
            <span>${escapeHtml(formatText(record.industry))}</span>
            <span>${escapeHtml(locations)}</span>
            <span>${escapeHtml(formatText(record.recruitment_type))}</span>
          </span>
          <span class="positions-preview">${escapeHtml(positions)}</span>
        </button>
      `;
    })
    .join("");
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
      <h2>${escapeHtml(record.name)}</h2>
      <div class="meta-line">
        <span class="pill">${escapeHtml(formatText(record.type))}</span>
        <span class="pill">${escapeHtml(formatText(record.recruitment_type))}</span>
        <span class="pill">${escapeHtml(formatText(record.target_candidates))}</span>
      </div>
    </div>

    <div class="detail-grid">
      ${infoBox("行业", record.industry)}
      ${infoBox("地点", record.locations)}
      ${infoBox("截止时间", record.deadline)}
      ${infoBox("更新时间", record.update_time)}
      ${infoBox("公司规模", record.company_size)}
      ${infoBox("投递状态", record.progress_status)}
      ${infoBox("笔面试", record.exam_info)}
      ${infoBox("内推码", record.referral_code || "-")}
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
                const safeLink = escapeHtml(link);
                return `<a href="${safeLink}" target="_blank" rel="noreferrer">${safeLink}</a>`;
              })
              .join("")
          : `<span class="warning">暂无链接</span>`
      }
    </div>

    <h3 class="section-title">备注</h3>
    <div class="notes">${escapeHtml(record.notes || "-")}</div>
  `;
}

function infoBox(label, value) {
  return `
    <div class="info-box">
      <span>${escapeHtml(label)}</span>
      <div>${escapeHtml(formatText(value))}</div>
    </div>
  `;
}

function selectRecord(id) {
  const numericId = Number(id);
  const record = state.filtered.find((item) => Number(item.id) === numericId);
  if (!record) return;
  state.selectedId = record.id;
  renderList();
  renderDetail(record);
}

async function init() {
  els.sourceLabel.textContent = DATA_URL.replace("../", "");
  els.resultList.innerHTML = `<div class="empty-state">正在加载数据</div>`;

  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const records = await response.json();
    state.records = Array.isArray(records) ? records : [];
    state.filtered = [...state.records];
    state.selectedId = state.records[0]?.id ?? null;
    els.totalCount.textContent = state.records.length.toLocaleString("zh-CN");
    buildFilters();
    applyFilters();
  } catch (error) {
    els.resultList.innerHTML = `<div class="empty-state">数据加载失败</div>`;
    els.detailPanel.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
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
  if (item) selectRecord(item.dataset.id);
});

init();
