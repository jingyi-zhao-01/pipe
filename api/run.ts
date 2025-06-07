import { fileURLToPath } from 'url';
import path from 'node:path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import * as dotenv from 'dotenv';
import fs from 'fs';
import { AwServer } from '../model/AwServer';
import { loadBuckets, loadEvents } from '../model/util.postgres';
import { logger } from '../lib/logger';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const sshConfig = {
  host: process.env.SSH_HOST ?? '',
  port: parseInt(process.env.SSH_PORT ?? '22', 10),
  username: process.env.SSH_USER ?? 'ubuntu',
  privateKey: fs.readFileSync('/home/jingyi/PycharmProjects/data-pipe/secrets/instance-alpha.pem'),
};

const awServerPipeline = new AwServer(sshConfig, process.env.REMOTE_DB_PATH ?? '');

awServerPipeline
  .extract('ALL', {
    onBuckets: buckets => {
      loadBuckets(buckets)
        .then(() => {
          logger.info('Buckets loaded successfully');
        })
        .catch(error => {
          logger.error('Error loading buckets:', error);
        });
    },
    onEvents: events => {
      logger.info(`Received ${events.length} events`);
      loadEvents(events)
        .then(() => logger.info('Events loaded successfully'))
        .catch(err => logger.error('Error loading events:', err));
    },
  })
  .finally(() => awServerPipeline.close());

// Vercel specific header for cron authentication
// export const config = {
//   api: {
//     bodyParser: false,
//   },
// };
//
// export default async function handler(req: NextApiRequest, res: NextApiResponse) {
//   // Verify the request is from Vercel Cron
//   if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
//     return res.status(401).json({ error: 'Unauthorized' });
//   }
//
//   try {
//     logger.info(`Cron job started at ${new Date().toISOString()}`);
//     const sshConfig = {
//       host: process.env.SSH_HOST!,
//       port: parseInt(process.env.SSH_PORT ?? '22', 10),
//       username: process.env.SSH_USER!,
//       privateKey: Buffer.from(process.env.SSH_PRIVATE_KEY!, 'base64'),
//     };
//
//     const awServerPipeline = new AwServer(sshConfig, process.env.REMOTE_DB_PATH!);
//
//     await awServerPipeline.extract('TEST', {
//       onBuckets: async buckets => {
//         logger.info('Processing buckets', { count: buckets.length });
//         await loadBuckets(buckets);
//         logger.info('Buckets loaded successfully');
//       },
//       onEvents: async events => {
//         logger.info('Processing events', { count: events.length });
//         await loadEvents(events);
//         logger.info('Events loaded successfully');
//       },
//     });
//
//     await awServerPipeline.close();
//     logger.info('CRON job completed successfully');
//     res.status(200).json({ success: true });
//   } catch (error) {
//     logger.error('CRON job failed', {
//       error: error instanceof Error ? error.message : String(error),
//     });
//     res.status(500).json({ error: String(error) });
//   }
// }
