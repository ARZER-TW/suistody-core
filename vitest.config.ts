import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    env: {
      PACKAGE_ID: "0x2475f6cb526ee358db80fa3addc01647f4f016e537a4edbeb8cb24a07364a49e",
      SUI_NETWORK: "testnet",
    },
  },
});
