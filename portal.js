const money = cents => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const rate = bps => `${bps / 100}%`;

async function callAffiliateAPI(action, data) {
  const base = window.SCRUFFY_PAYMENT_CONFIG?.apiBaseUrl?.trim().replace(/\/+$/, "");
  if (!base || new URL(base).protocol !== "https:") throw new Error("The portal is awaiting its Cloudflare Worker connection.");
  const response = await fetch(base + "/api/affiliate/" + action, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The affiliate service is unavailable.");
  return result;
}

const login = document.getElementById("affiliate-login");
const affiliateStatus = document.getElementById("affiliate-status");
const dashboard = document.getElementById("affiliate-dashboard");
login.addEventListener("submit", async event => {
  event.preventDefault();
  dashboard.hidden = true;
  affiliateStatus.textContent = "Loading affiliate account…";
  const values = Object.fromEntries(new FormData(login));
  try {
    const { account } = await callAffiliateAPI("stats", { code: values.code.trim(), token: values.token.trim() });
    const link = new URL("../index.html", location.href);
    link.searchParams.set("ref", account.code);
    link.hash = "digital-links";
    document.getElementById("affiliate-link").value = link.href;
    document.getElementById("affiliate-promo").value =
      `Explore Scruffy Butt Digital Designs’ digital bookstore: ${link.href}\nI may earn a commission if you buy through this link.`;
    document.getElementById("affiliate-totals").textContent =
      `${account.name} · ${rate(account.rate_bps)} current rate · ${account.tracked_clicks} tracked clicks · ${account.qualifying_clicks} qualifying clicks · ${money(account.pending_cents)} pending · ${money(account.paid_cents)} paid`;
    dashboard.hidden = false;
    affiliateStatus.textContent = "";
  } catch (error) {
    affiliateStatus.textContent = error.message;
  } finally {
    login.elements.namedItem("token").value = "";
  }
});
for (const [button, field] of [["copy-link", "affiliate-link"], ["copy-promo", "affiliate-promo"]]) {
  document.getElementById(button).addEventListener("click", async () => {
    const input = document.getElementById(field);
    try {
      await navigator.clipboard.writeText(input.value);
      affiliateStatus.textContent = "Copied.";
    } catch {
      input.select();
      affiliateStatus.textContent = "Text selected. Use your device’s Copy command.";
    }
  });
}

const admin = document.getElementById("affiliate-admin");
const adminAction = admin.elements.namedItem("action");
const adminFields = document.getElementById("admin-fields");
const adminStatus = document.getElementById("admin-status");
const adminResults = document.getElementById("admin-results");
const issuedKeyLabel = document.getElementById("issued-key-label");
const issuedKey = document.getElementById("issued-key");
const fieldsByAction = {
  list: [],
  create: [["code", "Unique lowercase referral code"], ["name", "Affiliate display name"]],
  qualify: [["code", "Referral code"], ["clicks", "Approved qualifying clicks", "number"]],
  tier: [["minimum", "Minimum qualifying clicks", "number"], ["rate", "Commission rate (%)", "number"]],
  settle: [["order", "PayPal order ID"], ["status", "Enter paid or void"]]
};

function buildAdminFields() {
  adminFields.replaceChildren();
  for (const [name, title, type = "text"] of fieldsByAction[adminAction.value]) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.name = name;
    input.type = type;
    input.required = true;
    if (name === "rate") input.step = "0.01";
    label.append(title, input);
    adminFields.append(label);
  }
}
adminAction.addEventListener("change", buildAdminFields);
buildAdminFields();

function renderList(title, items) {
  const heading = document.createElement("h3");
  heading.textContent = title;
  const list = document.createElement("ul");
  for (const text of items.length ? items : ["None yet."]) {
    const item = document.createElement("li");
    item.textContent = text;
    list.append(item);
  }
  adminResults.append(heading, list);
}
admin.addEventListener("submit", async event => {
  event.preventDefault();
  const submit = admin.querySelector("button");
  submit.disabled = true;
  issuedKey.value = "";
  issuedKeyLabel.hidden = true;
  adminResults.hidden = true;
  adminResults.replaceChildren();
  adminStatus.textContent = "Working…";
  const data = Object.fromEntries([...new FormData(admin)].map(([key, value]) => [key, value.trim()]));
  for (const key of ["clicks", "minimum"]) if (key in data) data[key] = Number(data[key]);
  if ("rate" in data) data.rate = Math.round(Number(data.rate) * 100);
  try {
    const result = await callAffiliateAPI("admin", data);
    if (result.accessKey) {
      issuedKey.value = result.accessKey;
      issuedKeyLabel.hidden = false;
      adminStatus.textContent = "Account created. Copy this key and send it privately to the affiliate. It is shown once.";
      return;
    }
    const accounts = result.accounts || (result.account ? [result.account] : []);
    renderList("Affiliates", accounts.map(a => `${a.name} (${a.code}) · ${a.qualifying_clicks}/${a.tracked_clicks} qualifying clicks · ${rate(a.rate_bps)} · ${money(a.pending_cents)} pending · ${money(a.paid_cents)} paid`));
    if (result.tiers) renderList("Commission tiers", result.tiers.map(t => `${t.minimum_clicks} qualifying clicks · ${rate(t.rate_bps)}`));
    if (result.orders) renderList("Recent commissions", result.orders.map(o => `${o.order_id} · ${o.code} · ${money(o.commission_cents)} · ${o.status}`));
    adminResults.hidden = false;
    adminStatus.textContent = "Done.";
  } catch (error) {
    adminStatus.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});
