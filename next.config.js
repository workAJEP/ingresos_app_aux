/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdfjs-dist va EMPAQUETADO en el bundle del server (sin
  // serverComponentsExternalPackages): con el worker registrado en
  // globalThis (lib/parsePdf.js) no necesita resolver archivos en
  // node_modules en runtime — clave en serverless (Vercel).
};

module.exports = nextConfig;
