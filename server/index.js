const config = require('./config');
const { openDatabase } = require('./db/database');
const { createApp } = require('./app');

const database = openDatabase(config.databasePath);
const server = createApp({ database, publicDir: config.publicDir, adminPassword: config.adminPassword });
server.on('error', error => {
  console.error(error.message);
  database.close();
  process.exitCode = 1;
});
server.listen(config.port, config.host, () => {
  console.log(`Autopilot: Rally running at http://${config.host}:${config.port}`);
  console.log(`Database: ${config.databasePath}`);
});
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close(() => database.close());
  server.closeIdleConnections();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
