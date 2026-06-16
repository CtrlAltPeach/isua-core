import type { NextConfig } from "next";

// Security-заголовки (аудит §13, H3). Применяются ко всем маршрутам.
// CSP — умеренный (без nonce): закрывает внешние источники, clickjacking,
// MIME-sniffing. script/style допускают 'unsafe-inline' (Next.js генерит
// инлайн-стили/скрипты гидратации). Полноценный nonce-CSP — отдельная задача
// (требует dynamic rendering всех страниц, ломает статику).
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // HSTS: только HTTPS, год, поддомены. Vercel и так HTTPS-only.
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" }, // дублирует frame-ancestors для старых браузеров
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
