/**
 * Starts proxy-3001.js with PROXY_PORT from argv[2] (e.g. 3010 when default :3101 is taken).
 */
const path = require("path");
const port = process.argv[2];
if (port) process.env.PROXY_PORT = String(port);
require(path.join(__dirname, "..", "proxy-3001.js"));
