export const redirect = (u) => { throw new Error("REDIRECT " + u); }; export const notFound = () => { throw new Error("NOT_FOUND"); };
