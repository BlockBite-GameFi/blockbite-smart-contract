import { defineConfig } from "vitepress";

export default defineConfig({
  title: "BlockBite Docs",
  description:
    "Complete developer documentation for the BlockBite token vesting & milestone reward protocol on Solana.",
  base: "/blockbite-smart-contract/",

  head: [
    ["link", { rel: "icon", type: "image/png", href: "/blockbite-smart-contract/favicon.png" }],
    ["meta", { name: "theme-color", content: "#7C3AED" }],
    ["meta", { property: "og:title", content: "BlockBite Developer Docs" }],
    [
      "meta",
      {
        property: "og:description",
        content:
          "Integrate with the BlockBite on-chain vesting & game reward protocol in minutes.",
      },
    ],
  ],

  themeConfig: {
    logo: "/logo.png",
    siteTitle: "BlockBite",

    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Reference", link: "/reference/instructions" },
      { text: "ADRs", link: "/adr/" },
      {
        text: "Devnet",
        link: "https://explorer.solana.com/address/Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq?cluster=devnet",
      },
      { text: "Frontend", link: "https://blockbite-tdp.vercel.app" },
    ],

    sidebar: [
      {
        text: "Getting Started",
        items: [
          { text: "Introduction", link: "/guide/getting-started" },
          { text: "5-Minute Quickstart", link: "/guide/quickstart" },
          { text: "Full Integration Guide", link: "/guide/integration" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "All Instructions", link: "/reference/instructions" },
          { text: "Account Structures", link: "/reference/accounts" },
          { text: "Error Codes", link: "/reference/errors" },
          { text: "PDA Derivation", link: "/reference/pda" },
        ],
      },
      {
        text: "Architecture",
        items: [{ text: "Decision Records (ADRs)", link: "/adr/" }],
      },
    ],

    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/BlockBite-GameFi/blockbite-smart-contract",
      },
    ],

    footer: {
      message: "BlockBite Protocol — Solana Devnet",
      copyright:
        "Program ID: Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq",
    },

    editLink: {
      pattern:
        "https://github.com/BlockBite-GameFi/blockbite-smart-contract/edit/main/docs-site/:path",
      text: "Edit this page on GitHub",
    },

    search: { provider: "local" },

    outline: { level: [2, 3], label: "On this page" },
  },

  markdown: {
    lineNumbers: true,
  },
});
