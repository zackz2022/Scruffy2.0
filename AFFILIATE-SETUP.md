# Pink Collar Affiliate Portal

The standalone portal is at `affiliates/` within the site. The Worker uses the same site origin and checkout API base URL already used by the bookstore.

1. Create a Cloudflare D1 database, apply `affiliate-schema.sql`, and bind it to the Worker as `AFFILIATES_DB`. Deploy `worker.js` with its imported `affiliate-api.js`.
2. Set the Worker secret `AFFILIATE_ADMIN_TOKEN` to a securely generated 64-character lowercase hexadecimal string. Keep the key private. For example, generate a key locally with `openssl rand -hex 32`.
3. Set the public Worker URL and public PayPal client ID in `payment-config.js`. Keep the PayPal client secret in Cloudflare. Match the worker's PayPal environment to the account and test with sandbox before accepting live payments.
4. Open Administrator access in the portal. Create each approved affiliate and share their generated private access key securely. Set the higher rate thresholds after choosing the commission terms. The base commission is 15%.
5. Review referral activity before setting each affiliate's qualifying click count. Tracked clicks count once per browser identifier and affiliate when browser storage is available. A commission rate is recorded when a PayPal order is created. Affiliates can edit and copy the provided disclosure caption and their tracked link.
6. Reconcile pending commissions against PayPal before sending payouts. Mark them paid only after paying externally, and void commissions for refunded or ineligible sales. Automatic payouts and refund reconciliation are not enabled. If settlement recording fails after successful payment, retry the existing order capture endpoint with the original order ID to reconcile the affiliate entry.

Business partners receive 20% off customized design quotes. This is separate from affiliate commission and does not change digital book checkout.
