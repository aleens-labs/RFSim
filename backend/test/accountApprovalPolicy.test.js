const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ACCOUNT_STATUS_APPROVED,
  ACCOUNT_STATUS_PENDING,
  isAccountApproved,
  normalizeAccountStatus,
} = require("../src/accountApprovalPolicy");

test("normalizeAccountStatus only treats approved as approved", () => {
  assert.equal(normalizeAccountStatus("approved"), ACCOUNT_STATUS_APPROVED);
  assert.equal(normalizeAccountStatus(" APPROVED "), ACCOUNT_STATUS_APPROVED);
  assert.equal(normalizeAccountStatus("pending"), ACCOUNT_STATUS_PENDING);
  assert.equal(normalizeAccountStatus("disabled"), ACCOUNT_STATUS_PENDING);
  assert.equal(normalizeAccountStatus(""), ACCOUNT_STATUS_PENDING);
});

test("isAccountApproved requires an approved status", () => {
  assert.equal(isAccountApproved({ account_status: "approved" }), true);
  assert.equal(isAccountApproved({ account_status: "pending" }), false);
  assert.equal(isAccountApproved({}), false);
});
