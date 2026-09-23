import { createApp } from "./server.js";
import { HOST, PORT, PIPELINE_ROOT, DEFAULT_PROJECT_PATH } from "./config.js";
import { claudeCodeCliHelp } from "./adapters/claude-code.js";

const app = createApp();

app.listen(PORT, HOST, () => {
  console.log(`[takekit-engine] http://${HOST}:${PORT}`);
  console.log(`[takekit-engine] pipeline: ${PIPELINE_ROOT}`);
  console.log(`[takekit-engine] default project: ${DEFAULT_PROJECT_PATH}`);
  console.log(claudeCodeCliHelp());
});
