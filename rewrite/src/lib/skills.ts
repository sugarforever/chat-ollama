export type SkillFile = { path: string; content: Uint8Array };
export type SkillCandidate = {
  path: string;
  name: string;
  description: string;
  fileCount: number;
};
export type InstalledSkill = {
  id: string;
  name: string;
  description: string;
  source: string;
  installedAt: string;
};
export type SkillDiscovery = { importId: string; skills: SkillCandidate[] };
export const skillLimits = {
  files: 1000,
  totalBytes: 20 * 1024 * 1024,
  fileBytes: 5 * 1024 * 1024,
  skills: 100,
  manifestBytes: 128 * 1024,
};
export const skillCatalog = [
  {
    id: "pdf",
    name: "PDF",
    description: "Read, create, merge and edit PDF documents.",
    publisher: "Anthropic",
    url: "https://github.com/anthropics/skills/tree/main/skills/pdf",
  },
  {
    id: "docx",
    name: "Word documents",
    description:
      "Create and edit Word documents with formatting and tracked changes.",
    publisher: "Anthropic",
    url: "https://github.com/anthropics/skills/tree/main/skills/docx",
  },
  {
    id: "pptx",
    name: "Presentations",
    description: "Build and edit PowerPoint presentations.",
    publisher: "Anthropic",
    url: "https://github.com/anthropics/skills/tree/main/skills/pptx",
  },
  {
    id: "xlsx",
    name: "Spreadsheets",
    description: "Work with spreadsheets, formulas and tabular data.",
    publisher: "Anthropic",
    url: "https://github.com/anthropics/skills/tree/main/skills/xlsx",
  },
  {
    id: "frontend-design",
    name: "Frontend design",
    description: "Design and build distinctive web interfaces.",
    publisher: "Anthropic",
    url: "https://github.com/anthropics/skills/tree/main/skills/frontend-design",
  },
  {
    id: "skill-creator",
    name: "Skill creator",
    description: "Create, improve and evaluate agent skills.",
    publisher: "Anthropic",
    url: "https://github.com/anthropics/skills/tree/main/skills/skill-creator",
  },
  {
    id: "react-best-practices",
    name: "React best practices",
    description:
      "Improve React and Next.js performance using Vercel’s guidelines.",
    publisher: "Vercel",
    url: "https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices",
  },
  {
    id: "web-design-guidelines",
    name: "Web design guidelines",
    description: "Review web interfaces for usability and accessibility.",
    publisher: "Vercel",
    url: "https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines",
  },
];
