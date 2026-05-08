const ACCOUNT_STATUS_PENDING = "pending";
const ACCOUNT_STATUS_APPROVED = "approved";

function normalizeAccountStatus(value = "") {
  const status = String(value || "").trim().toLowerCase();
  return status === ACCOUNT_STATUS_APPROVED ? ACCOUNT_STATUS_APPROVED : ACCOUNT_STATUS_PENDING;
}

function isAccountApproved(user) {
  return normalizeAccountStatus(user?.account_status) === ACCOUNT_STATUS_APPROVED;
}

module.exports = {
  ACCOUNT_STATUS_APPROVED,
  ACCOUNT_STATUS_PENDING,
  isAccountApproved,
  normalizeAccountStatus,
};
