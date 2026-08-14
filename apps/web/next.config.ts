import type { NextConfig } from "next";
import path from "node:path";

/**
 * Cabeceras de seguridad. No había ninguna.
 *
 * Importan especialmente aquí porque la sesión vive en `localStorage`
 * (`lib/auth-storage.ts`), que es legible por cualquier JavaScript de la
 * página: sin CSP no hay segunda línea de defensa si algún día aparece un XSS
 * o se cuela una dependencia comprometida.
 *
 * `connect-src` incluye la URL de la API porque el navegador la bloquearía si
 * no. Si cambia el dominio de la API en producción, hay que cambiarlo aquí
 * también o la aplicación deja de poder hablar con el backend.
 */
const apiOrigin = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api")
  .replace(/\/api\/?$/, "");
const wsOrigin = process.env.NEXT_PUBLIC_WS_URL ?? apiOrigin;

const csp = [
  "default-src 'self'",
  // Next.js inyecta scripts en línea para la hidratación; 'unsafe-inline' es
  // inevitable sin migrar a nonces por petición.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  // blob: y data: los usan las descargas de PDF/Excel y las vistas previas.
  `img-src 'self' data: blob: ${apiOrigin}`,
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin} ${wsOrigin} ${wsOrigin.replace(/^http/, "ws")}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  // Salida autocontenida para Docker: Next copia a `.next/standalone` sólo los
  // ficheros de node_modules que la aplicación usa de verdad, y genera un
  // `server.js` que se arranca con `node server.js`.
  //
  // Hace falta porque esto es un monorepo pnpm y su node_modules está lleno de
  // enlaces simbólicos al almacén `.pnpm`: copiarlo tal cual a una imagen da
  // enlaces rotos. Es un ajuste de compilación, no un cambio de arquitectura;
  // en desarrollo (`next dev`) no cambia absolutamente nada.
  output: 'standalone',
  // En un monorepo hay que decirle dónde está la raíz o avisa de que ha
  // encontrado varios lockfiles y puede elegir mal qué ficheros incluir.
  outputFileTracingRoot: path.join(__dirname, '../../'),

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
          // Solo tiene efecto sobre HTTPS; en local el navegador la ignora.
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
