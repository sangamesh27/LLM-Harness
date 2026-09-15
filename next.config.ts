import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export -- the deployed site only ever reads the pre-built
  // snapshot.json, so there's no reason to run a server at all. This
  // produces a plain `out/` folder of HTML/JS/CSS, deployable to Netlify,
  // Vercel, or any static host with zero server config.
  output: "export",
};

export default nextConfig;
