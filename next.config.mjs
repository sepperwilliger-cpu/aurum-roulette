/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Erlaubt den Dev-Server-Zugriff über LAN-IP oder Tunnel-Domains (Freunde-Link).
  allowedDevOrigins: ['*.trycloudflare.com', '*.local', '192.168.*.*', '10.*.*.*'],
};

export default nextConfig;
