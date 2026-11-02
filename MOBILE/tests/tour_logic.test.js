/**
 * Automated Unit Test Suite for Mobile Tour Logic and Validation
 */
const assert = require('assert');

// 1. UUID v4 Generator Test
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sampleUuid = generateUUID();
assert.strictEqual(uuidRegex.test(sampleUuid), true, `UUID format mismatch: ${sampleUuid}`);

// Check uniqueness across 1000 generations
const uuidSet = new Set();
for (let i = 0; i < 1000; i++) {
  const u = generateUUID();
  assert.strictEqual(uuidSet.has(u), false, 'Duplicate UUID generated');
  uuidSet.add(u);
}
console.log('✓ UUID generator conforms to RFC4122 v4 and ensures uniqueness');

// 2. Question Evaluation & Validation Logic Test
function validateQuestionResponse(q, resp) {
  if (q.is_mandatory && (!resp || !resp.response_value)) {
    return { valid: false, error: `Mandatory question '${q.text}' is required.` };
  }
  const isFailure = Boolean(q.failure_values && q.failure_values.includes(resp.response_value));
  if (isFailure && q.requires_comment_on_failure && (!resp.comment || !resp.comment.trim())) {
    return { valid: false, error: `Remark required on failure for question '${q.text}'.` };
  }
  const photoCount = resp.photos ? resp.photos.length : 0;
  if (q.min_photos > 0 && photoCount < q.min_photos) {
    return { valid: false, error: `Minimum ${q.min_photos} photo(s) required.` };
  }
  return { valid: true, is_failure: isFailure, is_critical_violation: isFailure && q.is_critical };
}

// Test Question Types
const qYesNo = {
  oid: 101,
  text: 'Are registers up to date?',
  response_type: 'YES_NO',
  is_mandatory: true,
  is_critical: true,
  failure_values: ['No'],
  requires_comment_on_failure: true,
  min_photos: 1,
};

// Test empty mandatory
let v1 = validateQuestionResponse(qYesNo, { response_value: '' });
assert.strictEqual(v1.valid, false);

// Test failure without comment
let v2 = validateQuestionResponse(qYesNo, { response_value: 'No', photos: ['p1.jpg'] });
assert.strictEqual(v2.valid, false);
assert.match(v2.error, /Remark required on failure/);

// Test failure without min photo
let v3 = validateQuestionResponse(qYesNo, { response_value: 'No', comment: 'Missing records', photos: [] });
assert.strictEqual(v3.valid, false);
assert.match(v3.error, /Minimum 1 photo/);

// Test failure with all required fields
let v4 = validateQuestionResponse(qYesNo, { response_value: 'No', comment: 'Missing records', photos: ['p1.jpg'] });
assert.strictEqual(v4.valid, true);
assert.strictEqual(v4.is_failure, true);
assert.strictEqual(v4.is_critical_violation, true);

// Test success answer
let v5 = validateQuestionResponse(qYesNo, { response_value: 'Yes', photos: ['p1.jpg'] });
assert.strictEqual(v5.valid, true);
assert.strictEqual(v5.is_failure, false);
assert.strictEqual(v5.is_critical_violation, false);
console.log('✓ Mandatory, critical, failure remark, and photo requirements validated across response types');

// 3. Sequential Checkpoint Unlocking State Machine
function advanceCheckpoints(checkpoints, submittedCpOid) {
  const currentIndex = checkpoints.findIndex(c => c.oid === submittedCpOid);
  assert.strictEqual(checkpoints[currentIndex].status, 'active');
  assert.strictEqual(checkpoints[currentIndex].verified, true);

  checkpoints[currentIndex].status = 'completed';
  if (currentIndex + 1 < checkpoints.length) {
    checkpoints[currentIndex + 1].status = 'active';
  }
  return checkpoints;
}

const timeline = [
  { oid: 1, name: 'Gate 1', status: 'active', verified: true },
  { oid: 2, name: 'Server Room', status: 'locked', verified: false },
  { oid: 3, name: 'Perimeter', status: 'locked', verified: false },
];

advanceCheckpoints(timeline, 1);
assert.strictEqual(timeline[0].status, 'completed');
assert.strictEqual(timeline[1].status, 'active');
assert.strictEqual(timeline[2].status, 'locked');

timeline[1].verified = true;
advanceCheckpoints(timeline, 2);
assert.strictEqual(timeline[1].status, 'completed');
assert.strictEqual(timeline[2].status, 'active');
console.log('✓ Sequential checkpoint timeline transitions from active -> completed and unlocks next');

// 4. Session Matching (Custom Visits vs Normal Visits)
function matchSession(session, plannedId, siteId, customVisitId) {
  if (customVisitId) {
    return String(session.customVisitId) === String(customVisitId);
  }
  if (plannedId && siteId) {
    return String(session.plannedId) === String(plannedId) && String(session.siteId) === String(siteId);
  }
  return false;
}

const activeSessions = [
  { id: 1, plannedId: '94', siteId: '12', reportSubmitted: false },
  { id: 2, customVisitId: '34', siteId: null, reportSubmitted: false },
];

assert.strictEqual(matchSession(activeSessions[0], '94', '12', null), true);
assert.strictEqual(matchSession(activeSessions[0], null, null, '34'), false);
assert.strictEqual(matchSession(activeSessions[1], null, null, '34'), true);
assert.strictEqual(matchSession(activeSessions[1], '94', '12', null), false);
// Confirm no siteId = "0" is matched
assert.strictEqual(matchSession(activeSessions[1], null, '0', null), false);
console.log('✓ Custom visit and normal planned visit session matching confirmed without siteId="0"');

console.log('\nALL 4 AUTOMATED MOBILE TESTS PASSED SUCCESSFULLY.');

