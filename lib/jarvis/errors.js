export class JarvisError extends Error { constructor(code, message) { super(message); this.code = code; } }
