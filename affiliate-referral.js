(() => {
  const code = new URLSearchParams(location.search).get("ref");
  try {
    if (code && /^[a-z0-9-]{3,40}$/.test(code)) {
      sessionStorage.setItem("scruffyReferralCode", code);
      let visitor = localStorage.getItem("scruffyAffiliateVisitor");
      if (!visitor) {
        visitor = crypto.randomUUID();
        localStorage.setItem("scruffyAffiliateVisitor", visitor);
      }
      const base = window.SCRUFFY_PAYMENT_CONFIG?.apiBaseUrl?.trim().replace(/\/+$/, "");
      if (base && new URL(base).protocol === "https:") {
        fetch(base + "/api/affiliate/click", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, visitor }),
          keepalive: true
        }).catch(() => {});
      }
    }
    window.scruffyReferralCode = sessionStorage.getItem("scruffyReferralCode");
  } catch {
    if (code && /^[a-z0-9-]{3,40}$/.test(code)) window.scruffyReferralCode = code;
  }
})();
