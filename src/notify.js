'use strict';

// ---------------------------------------------------------------------------
// DELIBERATELY INSECURE - SEEDED TEST FIXTURE, DO NOT MERGE
//
// Second fixture, companion to reports.js. reports.js is already on master, so
// it no longer appears in any pull request diff - and the GPT review only sees
// the diff. This file puts fresh findings in front of the reviewer so all
// three tools can be exercised in one run:
//   - SonarQube  : weak hash, missing error handling
//   - Snyk       : nothing new here (it reports on the lockfile)
//   - GPT review : all of the below, including the DPDP logging issue
//
// Nothing imports this module, so it does not affect the running service or
// the test suite. Delete it, and reports.js, once the tooling is validated.
// ---------------------------------------------------------------------------

const crypto = require('crypto');

// MD5 is collision-broken and unsuitable for anything security-bearing. Used
// here to derive a verification digest, which is exactly the wrong place.
function verificationDigest(email) {
  return crypto.createHash('md5').update(email).digest('hex');
}

// Open redirect: `next` comes from the caller and is interpolated into the
// URL with no allowlist, so it can point anywhere off-site.
function buildRedirect(next) {
  return `https://verify.example.com/done?to=${next}`;
}

// Logs personal data in clear text - name, email and identifier all land in
// the application log with no minimisation and no retention story.
function logDelivery(student) {
  console.log(
    `Delivered credential to ${student.name} <${student.email}> (id ${student.id})`,
  );
}

// External call with no timeout, no status check and no error handling: a
// hung endpoint hangs the caller, and a 500 is parsed as if it were success.
async function notifyWebhook(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return res.json();
}

module.exports = {
  verificationDigest,
  buildRedirect,
  logDelivery,
  notifyWebhook,
};
