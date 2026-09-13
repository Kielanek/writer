import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // proxy.ts (auth session refresh + route protection) now runs in front
    // of every request, including /api/transcription's audio uploads —
    // Next.js buffers the request body for Proxy up to this limit (10MB by
    // default) and silently truncates anything larger, which corrupts the
    // multipart form body. Set above MAX_AUDIO_FILE_BYTES (see
    // lib/validation/schemas.ts) so a full-size upload is never truncated.
    proxyClientMaxBodySize: "30mb",
  },
};

export default nextConfig;
