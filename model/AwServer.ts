import { Client, ClientChannel } from 'ssh2';
import { AwBucket, AwEvent } from './util.postgres';

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

  private async _connect(): Promise<void> {
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
  async close(): Promise<void> {
    this.sshClient.end();
  }

  private async _executeRemoteQuery<T>(query: string): Promise<T[]> {
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

  private async _fetchTopBuckets(limit: number = 10): Promise<AwBucket[]> {
    await this._connect();
    const query = `SELECT * FROM buckets ORDER BY id DESC LIMIT ${limit}`;
    return this._executeRemoteQuery<AwBucket>(query);
  }

  private async _fetchTopEvents(limit: number = 10): Promise<AwEvent[]> {
    await this._connect();
    const query = `SELECT id, bucketrow, starttime, endtime, data 
                  FROM events ORDER BY id DESC LIMIT ${limit}`;
    return this._executeRemoteQuery<AwEvent>(query);
  }

  /**
   * DONT USE IT
   */
  private async _fetchEventsAll(): Promise<AwEvent[]> {
    await this._connect();
    const query = `SELECT id, bucketrow, starttime, endtime, data FROM events ORDER BY starttime ASC`;
    return this._executeRemoteQuery<AwEvent>(query);
  }

  private async _fetchEventsByCurrentCutOff(): Promise<AwEvent[]> {
    await this._connect();
    const starttimems = Date.now();
    const starttimenano = `${starttimems}000000`; // Convert milliseconds to nanoseconds
    const query = `SELECT id, bucketrow, starttime, endtime, data
        FROM events 
        WHERE starttime > ${starttimenano} OR 
              (starttime <= ${starttimenano} AND endtime > ${starttimenano})
        ORDER BY starttime ASC`;
    return this._executeRemoteQuery<AwEvent>(query);
  }

  async fetchEventsByPresetTimestamp(presetTimestampMs: string): Promise<Event[]> {
    await this._connect();
    const ns = `${presetTimestampMs}000000`; // Convert milliseconds to nanoseconds

    const query = `SELECT id, bucketrow, starttime, endtime, data
        FROM events 
        WHERE starttime > ${ns} OR 
              (starttime <= ${ns} AND endtime > ${ns})
        ORDER BY starttime ASC`;
    return this._executeRemoteQuery<Event>(query);
  }

  async extract(
    options: 'ALL' | 'CURRENT_TIMESTAMP' | 'PRESET_TIMESTAMP' | 'TEST',
    callbacks: {
      onBuckets?: (buckets: AwBucket[]) => void;
      onEvents?: (events: AwEvent[]) => void;
    } = {}
  ): Promise<void> {
    try {
      await this._connect();
      const buckets = await this._fetchTopBuckets();
      if (callbacks.onBuckets) {
        callbacks.onBuckets(buckets);
      }

      let events: AwEvent[] = [];

      if (options === 'ALL') {
        events = await this._fetchEventsAll();
      } else if (options === 'CURRENT_TIMESTAMP') {
        events = await this._fetchEventsByCurrentCutOff();
      } else if (options === 'PRESET_TIMESTAMP') {
        throw new Error('PRESET_TIMESTAMP option is not implemented yet.');
      } else if (options === 'TEST') {
        events = await this._fetchTopEvents(10); // Example timestamp
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
}

export { AwServer };
