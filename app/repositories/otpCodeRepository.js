export function createOtpCodeRepository(store) {
  function byNewest(records) {
    return [...records].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
  }

  return {
    create(attributes) {
      return store.insert("otpCodes", attributes);
    },

    findRecentUnverified(email, purpose, now = new Date(), limit = 5) {
      const normalizedEmail = email.toLowerCase();

      return byNewest(store.filter("otpCodes", (otp) => (
        otp.email === normalizedEmail
        && otp.purpose === purpose
        && !otp.verifiedAt
        && !otp.usedAt
        && new Date(otp.expiresAt) > now
      ))).slice(0, limit);
    },

    findLatestVerified(email, purpose, now = new Date()) {
      const normalizedEmail = email.toLowerCase();

      return byNewest(store.filter("otpCodes", (otp) => (
        otp.email === normalizedEmail
        && otp.purpose === purpose
        && otp.verifiedAt
        && !otp.usedAt
        && new Date(otp.expiresAt) > now
      )))[0] || null;
    },

    markVerified(id) {
      return store.update("otpCodes", id, { verifiedAt: new Date().toISOString() });
    },

    markUsed(id) {
      return store.update("otpCodes", id, { usedAt: new Date().toISOString() });
    }
  };
}
