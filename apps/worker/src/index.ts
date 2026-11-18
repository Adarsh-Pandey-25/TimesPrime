import "server-only";

import { finishRun } from "./exit";
import { runJob } from "./jobs";

// Run under the react-server condition (see package.json), so `import "server-only"` in
// packages/server resolves to its empty module outside a Next build. The run ends through
// finishRun: the exit code is set, and Node exits once its work is done (exit.ts says why).
runJob(process.argv[2]).then(
  (code) => finishRun(code),
  (err) => {
    console.error(err);
    finishRun(1);
  }
);
