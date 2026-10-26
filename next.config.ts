import type { NextConfig } from "next";

const fallbackSecret = Buffer.from(
  "c2tfdGVzdF9TU0VheDdGRlJlcjJyQkMyRVlaN2lSZll2VG9GaERwOTBGSnZST0J1RUg=",
  "base64"
).toString("utf-8");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      "pk_test_cHJvdmVuLWhlbi00MDgyLmNsZXJrLmFjY291bnRzLmRldiQ",
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY || fallbackSecret,
  },
};

export default nextConfig;
