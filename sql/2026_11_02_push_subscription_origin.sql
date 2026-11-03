-- Domain move to thebri.space: record the host each push subscription was made on.
-- NULL = created on birthday.briancama.com before this column existed.
-- POST /notifications/subscribe removes a user's old-domain rows from the same push
-- service when they subscribe on the new domain, so one device isn't notified twice.

ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS origin text;
