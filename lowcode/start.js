const path = require('path');
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.PORT = process.env.PORT || '8080';
process.env.NC_PUBLIC_URL = process.env.NC_PUBLIC_URL || 'http://localhost:8080';
process.env.NC_DASHBOARD_URL = '/dashboard';
if (!process.env.NC_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'sqlite:data/noco_meta.db';
}
const express = require('express');
const { Noco } = require('nocodb');
(async () => {
  const app = express();
  const httpServer = await Noco.init(null, null, app);
  httpServer.listen(+process.env.PORT, '0.0.0.0', () => {
    console.log('NocoDB listening on 0.0.0.0:' + process.env.PORT);
  });
})().catch((e) => { console.error(e); process.exit(1); });
