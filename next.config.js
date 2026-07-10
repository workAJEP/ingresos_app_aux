/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // pdfjs-dist debe resolverse desde node_modules en el server (webpack no
    // empaqueta su worker: "Cannot find module ... pdf.worker.mjs").
    serverComponentsExternalPackages: ['pdfjs-dist'],
  },
};

module.exports = nextConfig;
