import type { MetadataRoute } from "next";

const BASE_URL = "https://bricky-ai-three.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BASE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE_URL}/analyze`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE_URL}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE_URL}/legal/mentions-legales`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE_URL}/legal/cgu`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE_URL}/legal/confidentialite`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
