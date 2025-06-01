import { NextApiRequest, NextApiResponse } from 'next';
import { Client, ClientChannel } from 'ssh2';
import { fileURLToPath } from 'url';
import path from 'node:path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { Bucket, Event, loadBuckets, loadEvents } from './util';
import { logger } from '../lib/logger';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

class AwServer {
  private readonly sshClient: Client;
  private readonly channel: ClientChannel | null = null;

  constructor(
    private readonly sshConfig: {
      host: string;
      port: number;
      username: string;
      privateKey: Buffer;
    },
    private readonly remoteDbPath: string
  ) {
    this.sshClient = new Client();
  }

  private async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.sshClient
        .on('ready', () => {
          resolve();
        })
        .on('error', err => {
          reject(err);
        })
        .connect(this.sshConfig);
    });
  }

  private async executeRemoteQuery<T>(query: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const sqliteCommand = `sqlite3 -json "${this.remoteDbPath}" "${query}"`;

      this.sshClient.exec(sqliteCommand, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        let data = '';
        stream.on('data', (chunk: string) => {
          data += chunk;
        });

        stream.on('end', () => {
          try {
            const result = data.trim() ? JSON.parse(data) : [];
            resolve(result as T[]);
          } catch (e) {
            reject(new Error(`Failed to parse JSON: ${e}`));
          }
        });

        stream.on('error', (err: Error) => {
          reject(new Error(String(err)));
        });
      });
    });
  }

  async fetchTopBuckets(limit: number = 10): Promise<Bucket[]> {
    await this.connect();
    const query = `SELECT * FROM buckets ORDER BY id DESC LIMIT ${limit}`;
    return this.executeRemoteQuery<Bucket>(query);
  }

  async fetchTopEvents(limit: number = 10): Promise<Event[]> {
    await this.connect();
    const query = `SELECT id, bucketrow, starttime, endtime, data 
                  FROM events ORDER BY id DESC LIMIT ${limit}`;
    return this.executeRemoteQuery<Event>(query);
  }

  /**
   * DONT USE IT
   */
  async fetchEventsAll(): Promise<Event[]> {
    await this.connect();
    const query = `SELECT id, bucketrow, starttime, endtime, data FROM events ORDER BY starttime ASC`;
    return this.executeRemoteQuery<Event>(query);
  }

  async fetchEventsByCurrentCutOff(): Promise<Event[]> {
    await this.connect();
    const starttimems = Date.now();
    const starttimenano = `${starttimems}000000`; // Convert milliseconds to nanoseconds
    const query = `SELECT id, bucketrow, starttime, endtime, data
        FROM events 
        WHERE starttime > ${starttimenano} OR 
              (starttime <= ${starttimenano} AND endtime > ${starttimenano})
        ORDER BY starttime ASC`;
    return this.executeRemoteQuery<Event>(query);
  }

  async fetchEventsByPresetTimestamp(presetTimestampMs: string): Promise<Event[]> {
    await this.connect();
    const ns = `${presetTimestampMs}000000`; // Convert milliseconds to nanoseconds

    const query = `SELECT id, bucketrow, starttime, endtime, data
        FROM events 
        WHERE starttime > ${ns} OR 
              (starttime <= ${ns} AND endtime > ${ns})
        ORDER BY starttime ASC`;
    return this.executeRemoteQuery<Event>(query);
  }

  async extract(
    options: 'ALL' | 'CURRENT_TIMESTAMP' | 'PRESET_TIMESTAMP' | 'TEST',
    callbacks: {
      onBuckets?: (buckets: Bucket[]) => void;
      onEvents?: (events: Event[]) => void;
    } = {}
  ): Promise<void> {
    try {
      await this.connect();

      const buckets = await this.fetchTopBuckets();
      if (callbacks.onBuckets) {
        callbacks.onBuckets(buckets);
      }

      let events: Event[] = [];

      if (options === 'ALL') {
        events = await this.fetchEventsAll();
      } else if (options === 'CURRENT_TIMESTAMP') {
        events = await this.fetchEventsByCurrentCutOff();
      } else if (options === 'PRESET_TIMESTAMP') {
        throw new Error('PRESET_TIMESTAMP option is not implemented yet.');
      } else if (options === 'TEST') {
        events = await this.fetchTopEvents(10); // Example timestamp
      } else {
        throw new Error(`Unknown option: ${options}`);
      }
      if (callbacks.onEvents) {
        callbacks.onEvents(events);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    this.sshClient.end();
  }
}

// const sshConfig = {
//   host: process.env.SSH_HOST ?? '',
//   port: parseInt(process.env.SSH_PORT ?? '22', 10),
//   username: process.env.SSH_USER ?? 'ubuntu',
//   privateKey: fs.readFileSync('/home/jingyi/PycharmProjects/data-pipe/secrets/instance-alpha.pem'),
// };

// awServerPipeline
//   .extract('CURRENT_TIMESTAMP', {
//     onBuckets: buckets => {
//       loadBuckets(buckets)
//         .then(() => {
//           console.log('Buckets loaded successfully.');
//         })
//         .catch(error => {
//           console.error('Error loading buckets:', error);
//         });
//     },
//     onEvents: events => {
//       console.log('Appending events to Postgres...');
//       loadEvents(events)
//         .then(() => console.log('Events appended successfully.'))
//         .catch(err => console.error('Error appending events:', err));
//     },
//   })
//   .finally(() => awServerPipeline.close());

// Vercel specific header for cron authentication
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Verify the request is from Vercel Cron
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    logger.info(`Cron job started at ${new Date().toISOString()}`);
    const sshConfig = {
      host: process.env.SSH_HOST!,
      port: parseInt(process.env.SSH_PORT ?? '22', 10),
      username: process.env.SSH_USER!,
      privateKey: Buffer.from(process.env.SSH_PRIVATE_KEY!, 'base64'),
    };

    const awServerPipeline = new AwServer(sshConfig, process.env.REMOTE_DB_PATH!);

    await awServerPipeline.extract('TEST', {
      onBuckets: async buckets => {
        logger.info('Processing buckets', { count: buckets.length });
        await loadBuckets(buckets);
        logger.info('Buckets loaded successfully');
      },
      onEvents: async events => {
        logger.info('Processing events', { count: events.length });
        await loadEvents(events);
        logger.info('Events loaded successfully');
      },
    });

    await awServerPipeline.close();
    logger.info('CRON job completed successfully');
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('CRON job failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: String(error) });
  }
}
