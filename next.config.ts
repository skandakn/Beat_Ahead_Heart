import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      "pk_test_cHJvdmVuLWhlbi00MDgyLmNsZXJrLmFjY291bnRzLmRldiQ",
  },
};

export default nextConfig;
