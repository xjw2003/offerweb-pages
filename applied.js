const DATA_URL = "./data/company_details_latest_all.json";
const client = window.supabase.createClient(
  window.OFFERWEB_CONFIG.supabaseUrl,
  window.OFFERWEB_CONFIG.supabasePublishableKey,
);

async function loadApplied() {
  const list = document.getElementById("resultList");
  const { data: sessionData } = await client.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) {
    list.innerHTML = "<p>请先登录后查看已投递岗位。</p>";
    return;
  }

  const { data: statuses } = await client
    .from("job_application_status")
    .select("job_id,updated_at")
    .eq("status", "applied");

  const records = await fetch(DATA_URL).then((r) => r.json());
  const ids = new Set((statuses || []).map((x) => String(x.job_id)));

  list.innerHTML = records
    .filter((x) => ids.has(String(x.id)))
    .map((x) => `<article class="result-item"><strong>${x.name}</strong><p>${(x.positions || []).join("、")}</p><span class="status-applied">已投递</span></article>`)
    .join("") || "<p>暂无已投递岗位</p>";
}

loadApplied();
