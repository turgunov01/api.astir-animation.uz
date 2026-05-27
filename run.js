import { createServer } from "./app/server.js";
import { config } from "./app/config.js";

const host = config.host;
const port = config.port;

const server = createServer();

server.listen(port, host, () => {
  console.log(`Server running at http://${host}:${port}`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down server`);
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
