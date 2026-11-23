const codePattern = /^[a-z0-9-]{3,40}$/;
const tokenPattern = /^[a-f0-9]{64}$/;

async function digest(value) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function isAdministrator(token, secret) {
  if (typeof token !== "string" || !tokenPattern.test(token) ||
      typeof secret !== "string" || !tokenPattern.test(secret)) return false;
  const expected = await digest(secret);
  const actual = await digest(token);
  let difference = 0;
  for (let i = 0; i < expected.length; i++) {
    difference |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  }
  return difference === 0;
}

const statsQuery = `
    SELECT affiliates.code, name, qualifying_clicks,
      (SELECT COUNT(*) FROM affiliate_clicks WHERE code = affiliates.code) AS tracked_clicks,
      (SELECT rate_bps FROM affiliate_tiers WHERE minimum_clicks <= affiliates.qualifying_clicks ORDER BY minimum_clicks DESC LIMIT 1) AS rate_bps,
      COALESCE((SELECT SUM(commission_cents) FROM affiliate_orders WHERE code = affiliates.code AND status = 'pending'), 0) AS pending_cents,
      COALESCE((SELECT SUM(commission_cents) FROM affiliate_orders WHERE code = affiliates.code AND status = 'paid'), 0) AS paid_cents
    FROM affiliates
`;

async function affiliateStats(db, code) {
  return db.prepare(statsQuery + " WHERE affiliates.code = ?").bind(code).first();
}

export async function affiliateApi(request, env, path, send) {
  const db = env.AFFILIATES_DB;
  if (!db) return send({ error: "Affiliate tracking is awaiting setup." }, 503);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return send({ error: "Invalid request." }, 400);
  const { code, token } = body;

  if (path === "/api/affiliate/click") {
    if (typeof code !== "string" || !codePattern.test(code) ||
        typeof body.visitor !== "string" || !/^[a-f0-9-]{36}$/.test(body.visitor)) {
      return send({ error: "Invalid referral." }, 400);
    }
    await db.prepare("INSERT OR IGNORE INTO affiliate_clicks (code, visitor) SELECT code, ? FROM affiliates WHERE code = ?")
      .bind(body.visitor, code).run();
    return send({ recorded: true }, 200);
  }

  if (path === "/api/affiliate/stats") {
    if (typeof code !== "string" || !codePattern.test(code) ||
        typeof token !== "string" || !tokenPattern.test(token)) {
      return send({ error: "Invalid affiliate credentials." }, 401);
    }
    const account = await db.prepare("SELECT code FROM affiliates WHERE code = ? AND token_hash = ?")
      .bind(code, await digest(token)).first();
    if (!account) return send({ error: "Invalid affiliate credentials." }, 401);
    return send({ account: await affiliateStats(db, code) }, 200);
  }

  if (path !== "/api/affiliate/admin") return send({ error: "Endpoint not found." }, 404);
  if (!await isAdministrator(token, env.AFFILIATE_ADMIN_TOKEN)) {
    return send({ error: "Administrator access denied." }, 401);
  }

  if (body.action === "create") {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (typeof code !== "string" || !codePattern.test(code) || !name || name.length > 100) {
      return send({ error: "Enter a name and a 3–40 character lowercase referral code." }, 400);
    }
    const accessKey = [...crypto.getRandomValues(new Uint8Array(32))]
      .map(byte => byte.toString(16).padStart(2, "0")).join("");
    const result = await db.prepare("INSERT OR IGNORE INTO affiliates (code, name, token_hash) VALUES (?, ?, ?)")
      .bind(code, name, await digest(accessKey)).run();
    if (result.meta.changes !== 1) return send({ error: "That referral code is already in use." }, 409);
    return send({ accessKey }, 201);
  }

  if (body.action === "qualify") {
    if (typeof code !== "string" || !codePattern.test(code) ||
        !Number.isSafeInteger(body.clicks) || body.clicks < 0) {
      return send({ error: "Invalid qualifying click count." }, 400);
    }
    const account = await affiliateStats(db, code);
    if (!account || body.clicks > account.tracked_clicks) {
      return send({ error: "Qualifying clicks cannot exceed tracked clicks." }, 400);
    }
    await db.prepare("UPDATE affiliates SET qualifying_clicks = ? WHERE code = ?")
      .bind(body.clicks, code).run();
    return send({ account: await affiliateStats(db, code) }, 200);
  }

  if (body.action === "tier") {
    const { minimum, rate } = body;
    if (!Number.isSafeInteger(minimum) || minimum < 1 ||
        !Number.isSafeInteger(rate) || rate <= 1500 || rate > 10000) {
      return send({ error: "Enter a positive click threshold and a rate above 15%, up to 100%." }, 400);
    }
    const result = await db.prepare(`
      INSERT INTO affiliate_tiers (minimum_clicks, rate_bps)
      SELECT ?1, ?2 WHERE NOT EXISTS (
        SELECT 1 FROM affiliate_tiers WHERE
        (minimum_clicks < ?1 AND rate_bps > ?2) OR (minimum_clicks > ?1 AND rate_bps < ?2)
      ) ON CONFLICT(minimum_clicks) DO UPDATE SET rate_bps = excluded.rate_bps
    `).bind(minimum, rate).run();
    if (result.meta.changes !== 1) {
      return send({ error: "Commission tiers must increase with qualifying clicks." }, 400);
    }
  } else if (body.action === "settle") {
    if (typeof body.order !== "string" || !/^[A-Za-z0-9-]{1,100}$/.test(body.order) ||
        !["paid", "void"].includes(body.status)) {
      return send({ error: "Invalid order or settlement status." }, 400);
    }
    const result = await db.prepare("UPDATE affiliate_orders SET status = ? WHERE order_id = ? AND status IN ('pending', 'paid')")
      .bind(body.status, body.order).run();
    if (result.meta.changes !== 1) return send({ error: "No matching commission entry." }, 404);
  } else if (body.action !== "list") {
    return send({ error: "Unknown administrator action." }, 400);
  }

  const { results: accounts } = await db.prepare(statsQuery + " ORDER BY affiliates.code LIMIT 100").all();
  const { results: tiers } = await db.prepare("SELECT * FROM affiliate_tiers ORDER BY minimum_clicks").all();
  const { results: orders } = await db.prepare("SELECT order_id, code, commission_cents, status FROM affiliate_orders WHERE status IS NOT NULL ORDER BY rowid DESC LIMIT 100").all();
  return send({ accounts, tiers, orders }, 200);
}

export async function rememberAffiliateOrder(db, orderId, code) {
  if (!db || typeof code !== "string" || !codePattern.test(code)) return;
  await db.prepare(`
    INSERT OR IGNORE INTO affiliate_orders (order_id, code, rate_bps)
    SELECT ?, affiliates.code, (
      SELECT rate_bps FROM affiliate_tiers WHERE minimum_clicks <= affiliates.qualifying_clicks
      ORDER BY minimum_clicks DESC LIMIT 1
    ) FROM affiliates WHERE affiliates.code = ?
  `).bind(orderId, code).run();
}

export async function creditAffiliateOrder(db, orderId, amount) {
  if (!db) return;
  const cents = Math.round(Number(amount) * 100);
  await db.prepare(`
    UPDATE affiliate_orders SET commission_cents = (? * rate_bps + 5000) / 10000, status = 'pending'
    WHERE order_id = ? AND status IS NULL
  `).bind(cents, orderId).run();
}
