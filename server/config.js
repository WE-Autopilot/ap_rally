const path = require('node:path');
const root = path.resolve(__dirname, '..');
module.exports = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '127.0.0.1',
  databasePath: path.resolve(root, process.env.DATABASE_PATH || 'data/leaderboard.sqlite'),
  publicDir: path.join(root, 'public')
};
