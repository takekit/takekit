import type { Thread } from "../api/client";

/** Offline fallback when engine is down */
export const MOCK_THREADS: Thread[] = [
  {
    id: "mock-09-jev",
    title: "09-jev (guinea pig)",
    projectPath:
      "/Users/oldaquerios/dev/myGitHub/personal_repositories/ai-content-agent/video/projects/09-jev",
    styleId: "09-jev",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [
      {
        id: "m1",
        role: "system",
        content:
          "Engine offline — showing mock thread. Start @takekit/engine on :8787.",
        createdAt: new Date().toISOString(),
      },
    ],
    previewPath: null,
    lastJobId: null,
  },
];
