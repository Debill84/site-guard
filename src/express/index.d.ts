// Khai báo kiểu cho đầu cắm Express của SiteGuard (loose — đủ dùng, không over-constrain).

type Middleware = (req: any, res: any, next: any) => void;

declare function siteGuard(userConfig?: Record<string, unknown>): Middleware;

declare namespace siteGuard {
  function siteGuard(userConfig?: Record<string, unknown>): Middleware;
  function getClientIp(req: any, trustProxy?: boolean): string;
  function honeypot(opts?: { field?: string; statusCode?: number; message?: string }): Middleware;
  function honeypotField(field?: string): string;
  function cache(value: string): Middleware;
  function csrfProtection(opts: Record<string, unknown>): Middleware;
  function createTurnstile(opts: { secret: string; [k: string]: unknown }): {
    verify(token: string, remoteip?: string): Promise<{ success: boolean; [k: string]: unknown }>;
    middleware(opts?: Record<string, unknown>): Middleware;
  };
  function turnstileWidget(siteKey: string, opts?: { theme?: string; className?: string }): string;
  function turnstileScript(): string;
  const HONEYPOT_FIELD: string;
  const CACHE_PRESETS: Record<string, string>;
}

export = siteGuard;
