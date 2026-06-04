// Khai báo kiểu cho đầu cắm Next.js của SiteGuard.
// Dùng `Request` chuẩn Web (NextRequest kế thừa Request nên truyền được).

export interface SiteGuardDecision {
  action: 'allow' | 'block' | 'limit';
  status?: number;
  message?: string;
  headers: Record<string, string>;
  retryAfterSec?: number;
  reason?: string;
}

export interface NextGuard {
  config: Record<string, unknown>;
  evaluate(req: Request): SiteGuardDecision;
}

export function createNextGuard(userConfig?: Record<string, unknown>): NextGuard;
