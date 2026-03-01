import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    env: {
      PACKAGE_ID: "0xf01673d606536731ca79fe85324026cdf9c7b2471bbf61a29b03ce911fe5c7d1",
      SUI_NETWORK: "testnet",
    },
  },
});
