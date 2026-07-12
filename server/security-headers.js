function buildContentSecurityPolicy({isDevelopment = false} = {}) {
  const scriptSources = ["'self'", "'unsafe-inline'"]
  if (isDevelopment) scriptSources.push("'unsafe-eval'")

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self' https: wss:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob: https:",
    "manifest-src 'self'",
    "media-src 'self' blob: https:",
    "object-src 'none'",
    `script-src ${scriptSources.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
    ...(isDevelopment ? [] : ['upgrade-insecure-requests']),
  ].join('; ')
}

function createSecurityHeaders({isDevelopment = false} = {}) {
  return [
    {
      key: 'Content-Security-Policy',
      value: buildContentSecurityPolicy({isDevelopment}),
    },
    {key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin'},
    {
      key: 'Permissions-Policy',
      value: 'camera=(self), geolocation=(), microphone=(), payment=(), usb=()',
    },
    {key: 'X-Content-Type-Options', value: 'nosniff'},
    {key: 'X-Frame-Options', value: 'DENY'},
  ]
}

module.exports = {buildContentSecurityPolicy, createSecurityHeaders}
