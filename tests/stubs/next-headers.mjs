// Test stub. Set TEST_SESSION to a signed session JWT to act as a signed-in user inside node --test.
export const cookies = async () => ({ get: (n) => (n === "session" && process.env.TEST_SESSION ? { value: process.env.TEST_SESSION } : undefined), set() {}, delete() {} });
export const headers = async () => new Map();
