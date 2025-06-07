import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface AwEvent {
  id: number;
  bucketrow: number;
  starttime: bigint;
  endtime: bigint;
  data: string;
}

interface AwBucket {
  id: number;
  name: string;
  type: string;
  client: string;
  hostname: string;
  created: string;
  data_deprecated: string;
  data: string;
}
const loadEvents = async (events: AwEvent[]): Promise<void> => {
  try {
    await prisma.events.createMany({
      data: events.map(event => ({
        bucketrow: event.bucketrow,
        starttime: event.starttime,
        endtime: event.endtime,
        app: JSON.parse(event.data).app ?? '',
        title: JSON.parse(event.data).title ?? '',
        status: JSON.parse(event.data).status ?? '',
      })),
      skipDuplicates: true,
    });
  } catch (error) {
    console.error('Error in appendToPostgres:', error);
    throw error;
  }
};

const loadBuckets = async (buckets: AwBucket[]): Promise<void> => {
  try {
    await prisma.buckets.createMany({
      data: buckets.map(bucket => ({
        id: bucket.id,
        name: bucket.name,
        type: bucket.type,
        client: bucket.client,
        hostname: bucket.hostname,
        created: bucket.created,
        data_deprecated: bucket.data_deprecated,
        data: bucket.data,
      })),
      skipDuplicates: true,
    });
  } catch (error) {
    console.error('Error in appendToPostgres:', error);
    throw error;
  }
};

export {
  loadEvents,
  loadBuckets,
  prisma as dbClient, // Export the Prisma client for use in other modules
};
export type { AwEvent, AwBucket }; // Export types for use in other modules
