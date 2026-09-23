import { createApp } from "./server.js";
import { DATA_DIR, HOST, PORT, getConfig } from "./config.js";
import { claudeCodeCliHelp } from "./adapters/claude-code.js";

const app = createApp();

app.listen(PORT, HOST, () => {
  const config = getConfig();
  console.log(`[takekit-engine] http://${HOST}:${PORT}`);
  console.log(`[takekit-engine] data dir: ${DATA_DIR}`);
  console.log(`[takekit-engine] pipeline: ${config.pipelineRoot}`);
  console.log(`[takekit-engine] projects: ${getConfig().projectsRoot}`);
  console.log(`[takekit-engine] executor: ${config.executorId} (model ${config.model})`);
  console.log(claudeCodeCliHelp(config.claudeBin, config.model));
});
