// Temporary exception, not a `skipLibCheck` workaround: Node has a native `URLPattern` (WHATWG URL
// Pattern spec) at runtime, but neither the installed TypeScript lib.dom.d.ts nor @types/node expose
// `URLPatternInput`/`URLPatternInit`/`URLPatternOptions` as global ambient types (only inside
// `declare module "node:url"`), while `next/dist/server/web/spec-extension/url-pattern.d.ts` expects
// them as globals — remove this file once Next.js or TypeScript/@types/node align on that.

interface URLPatternInit {
  protocol?: string;
  username?: string;
  password?: string;
  hostname?: string;
  port?: string;
  pathname?: string;
  search?: string;
  hash?: string;
  baseURL?: string;
}

type URLPatternInput = string | URLPatternInit;

interface URLPatternOptions {
  ignoreCase?: boolean;
}
