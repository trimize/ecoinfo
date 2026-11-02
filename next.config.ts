import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "Brèves" were renamed "Résumés": keep old links working.
  async redirects() {
    return [{ source: "/briefs", destination: "/resumes", permanent: true }];
  },
};

export default nextConfig;
