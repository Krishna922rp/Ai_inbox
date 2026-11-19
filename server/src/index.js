import './config.js';
import { db } from './db.js';
import { ingestSource } from './ingest.js';
import { createApp } from './app.js';

const app = createApp({ database: db, ingestSource });
const port = Number(process.env.PORT) || 4000;

app.listen(port, () => {
  console.log(JSON.stringify({
    level: 'info',
    message: 'Recall API listening',
    port
  }));
});
