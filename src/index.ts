import * as path from "path";
import { Kinesis } from "aws-sdk";
import { ShardIterator } from "aws-sdk/clients/kinesis";
// @ts-expect-error
import Kinesalite from "kinesalite";

const pluginName = "serverless-offline-kinesis-streams";
const pluginCustomKeyName = "offlineKinesisStreams";

interface StreamType {
  streamName: string;
  shards: number;
}

type ServerlessEventType = {
  arn?: string;
  type?: "kinesis" | "dynamodb";
};
type ServerlessEventObjectType = {
  stream?: ServerlessEventType;
  http?: ServerlessEventType;
};

type FunctionName = string;
type FunctionDefinitionHandler = {
  handler?: string;
  name: string;
  events?: ServerlessEventObjectType[];
};
type ServerlessFunctionType = Record<FunctionName, FunctionDefinitionHandler>;

class ServerlessLocalKinesis {
  private serverless: any;

  private readonly serverlessLog: any;

  private kinesis: Kinesis;

  private hooks: any;
  private pluginOptionsWithDefaults: {
    port: number;
    region?: string;
    streams: StreamType[];
  };

  constructor(serverless: any, options: any) {
    this.serverless = serverless;
    this.serverlessLog = serverless.cli.log.bind(serverless.cli);

    if (
      !Array.isArray(
        this.serverless.service.custom[pluginCustomKeyName].streams
      )
    ) {
      throw new Error(
        `${pluginName} - please add an array of streams to ${pluginCustomKeyName}`
      );
    }

    this.pluginOptionsWithDefaults = {
      port: this.serverless.service.custom[pluginCustomKeyName].port || 4567,
      region:
        this.serverless.service.custom[pluginCustomKeyName].region || "local",
      streams: this.serverless.service.custom[pluginCustomKeyName].streams.map(
        (streamData: StreamType) => ({
          streamName: streamData.streamName,
          shards: streamData.shards || 1,
        })
      ),
    };

    this.kinesis = new Kinesis({
      endpoint: "http://localhost:" + this.pluginOptionsWithDefaults.port,
      region: this.pluginOptionsWithDefaults.region,
    });

    this.hooks = {
      "before:offline:start": this.run.bind(this),
      "before:offline:start:init": this.run.bind(this),
    };
  }

  public pollKinesis = (functions: string[]) => (
    firstShardIterator: ShardIterator
  ) => {
    const mapKinesisRecord = (record: any) => ({
      approximateArrivalTimestamp: record.ApproximateArrivalTimestamp,
      data: record.Data.toString("base64"),
      partitionKey: record.PartitionKey,
      sequenceNumber: record.SequenceNumber,
    });

    const reduceRecord = (handlers: string[]) => (
      promise: any,
      kinesisRecord: any
    ) =>
      promise.then(() => {
        const singleRecordEvent = {
          Records: [{ kinesis: mapKinesisRecord(kinesisRecord) }],
        };

        handlers.forEach(async (handler: string) => {
          this.serverlessLog(`🤗 Invoking lambda '${handler}'`);

          const moduleFileName = `${handler.split(".")[0]}.js`;

          const handlerFilePath = path.join(
            this.serverless.config.servicePath,
            moduleFileName
          );

          const module = require(handlerFilePath);

          const functionObjectPath = handler.split(".").slice(1);

          let mod = module;

          for (const p of functionObjectPath) {
            mod = mod[p];
          }

          return mod(singleRecordEvent);
        });
      });

    const fetchAndProcessRecords = async (shardIterator: ShardIterator) => {
      const records = await this.kinesis
        .getRecords({ ShardIterator: shardIterator })
        .promise();

      await records.Records.reduce(reduceRecord(functions), Promise.resolve());

      setTimeout(async () => {
        await fetchAndProcessRecords(records.NextShardIterator!);
      }, 1000);
    };

    return fetchAndProcessRecords(firstShardIterator);
  };

  private async run() {
    try {
      await this.createKinesis(this.pluginOptionsWithDefaults.port);

      if (this.pluginOptionsWithDefaults.streams.length === 0) {
        throw new Error(
          `${pluginName} - Please define at least one stream on the ${pluginCustomKeyName} property`
        );
      }

      this.pluginOptionsWithDefaults.streams.forEach(
        async ({ streamName, shards }) => {
          if (!streamName) {
            throw new Error(
              `${pluginName} - Please define a stream name for every stream in your array.`
            );
          }

          await this.createStream(streamName, shards);

          await this.watchEvents(streamName);
        }
      );
    } catch (e) {
      this.serverlessLog(e);
    }
  }

  private createKinesis(port: number): Promise<void> {
    const server = new Kinesalite();

    return new Promise((resolve, reject) => {
      server.listen(port, (error: any) => {
        if (error) {
          reject(error);
        }

        this.serverlessLog(`🚀 Local kinesis is running at ${port}`);

        resolve();
      });
    });
  }

  private createStream(streamName: string, shards: number): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        await this.kinesis
          .createStream({ StreamName: streamName, ShardCount: shards })
          .promise();

        setTimeout(async () => {
          const stream = await this.kinesis
            .describeStream({ StreamName: streamName })
            .promise();

          // tslint:disable-next-line:max-line-length
          this.serverlessLog(
            `${pluginName} '${stream.StreamDescription.StreamName}' created with ${stream.StreamDescription.Shards.length} shard(s)`
          );

          resolve();
        }, 1000);
      } catch (e) {
        reject(e);
      }
    });
  }

  private async watchEvents(streamName: string): Promise<void> {
    const stream = await this.kinesis
      .describeStream({ StreamName: streamName })
      .promise();

    const { ShardId } = stream.StreamDescription.Shards[0];

    const params = {
      StreamName: streamName,
      ShardId,
      ShardIteratorType: "LATEST",
    };

    const shardIterator = await this.kinesis.getShardIterator(params).promise();

    const functions = [];
    const slsFunctions: ServerlessFunctionType = this.serverless.service
      .functions;

    for (const [, serverlessFunction] of Object.entries(slsFunctions)) {
      if (!serverlessFunction.handler) {
        this.serverlessLog(
          "Not adding listener for " +
            serverlessFunction.name +
            " because it does not have a handler"
        );
        continue;
      }

      const isStreamEventForThisStream = (serverlessFunction.events || []).some(
        (serverlessEvent) => {
          return (
            serverlessEvent?.stream?.type === "kinesis" &&
            serverlessEvent?.stream?.arn?.includes("kinesis") &&
            serverlessEvent?.stream?.arn?.includes(streamName)
          );
        }
      );

      if (isStreamEventForThisStream) {
        functions.push(serverlessFunction.handler);
      }
    }

    this.pollKinesis(functions)(shardIterator.ShardIterator!);
  }
}

export = ServerlessLocalKinesis;
