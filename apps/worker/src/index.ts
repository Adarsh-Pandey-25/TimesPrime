import "server-only";

import { runJob } from "./jobs";

// Run under the react-server condition (see package.json), so `import "server-only"` in
// packages/server resolves to its empty module outside a Next build.
runJob(process.argv[2]).then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
