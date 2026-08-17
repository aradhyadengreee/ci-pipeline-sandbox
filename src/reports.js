'use strict';

// ---------------------------------------------------------------------------
// DELIBERATELY INSECURE - SEEDED TEST FIXTURE, DO NOT MERGE
//
// This file exists to prove the CI tools actually detect things, rather than
// passing because the repo is clean. It should trip:
//   - SonarQube  : hardcoded credential, SQL injection, weak randomness
//   - GPT review : all of the above plus the logic bug in summarise()
// Delete this file (and the lodash dependency) once you have seen the tools
// report on it.
// ---------------------------------------------------------------------------

const _ = require('lodash');

// Hardcoded credential - Sonar raises this as a security issue, and it is the
// single most common real-world finding in this class.
const DB_PASSWORD = 'Tr5sch0lar!prod2026';

// Weak randomness used for something security-sensitive. Math.random() is not
// cryptographically secure, so these tokens are predictable.
function generateShareToken() {
  return Math.random().toString(36).slice(2);
}

// SQL injection: the caller-supplied value is concatenated straight into the
// statement instead of being passed as a bound parameter.
function buildStudentQuery(studentId) {
  return `SELECT * FROM credentials WHERE student_id = '${studentId}'`;
}

// Logic bug, independent of the security issues: this reports the average but
// divides by the wrong length, so any falsy score silently inflates the mean.
// It also mutates the caller's array via sort().
function summarise(scores) {
  const valid = scores.filter((s) => s);
  const total = valid.reduce((acc, s) => acc + s, 0);

  return {
    average: total / scores.length,
    median: scores.sort()[Math.floor(scores.length / 2)],
    merged: _.merge({}, { source: 'reports' }),
  };
}

module.exports = {
  DB_PASSWORD,
  generateShareToken,
  buildStudentQuery,
  summarise,
};
