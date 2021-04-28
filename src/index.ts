import * as path from "path";
import { Kinesis } from "aws-sdk";
import { ShardIterator, ShardIteratorType } from "aws-sdk/clients/kinesis";
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
  enabled?: boolean;
  type?: "kinesis" | "dynamodb";
  batchSize?: number;
  batchWindow?: number;
  startingPosition?: ShardIteratorType;
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

  public initializePollKinesis = async (streamInformation: {
    batchSize: number;
    batchWindow: number;
    startingPosition: string;
    handler: string;
    streamName: string;
  }): Promise<void> => {
    const handler = streamInformation.handler;
    const stream = await this.kinesis
      .describeStream({ StreamName: streamInformation.streamName })
      .promise();

    const { ShardId } = stream.StreamDescription.Shards[0];

    const params = {
      StreamName: streamInformation.streamName,
      ShardId,
      ShardIteratorType: streamInformation.startingPosition,
    };

    const shardIterator = await this.kinesis.getShardIterator(params).promise();

    const dispatchRecordsToLambdaFunction = async (
      records: Kinesis.RecordList
    ) => {
      this.serverlessLog(`🤗 Invoking lambda '${handler}'`);

      const moduleFileName = `${handler.split(".")[0]}.js`;

      const handlerFilePath = path.join(
        this.serverless.config.servicePath,
        moduleFileName
      );
      delete require.cache[require.resolve(handlerFilePath)];
      const module = require(handlerFilePath);

      const functionObjectPath = handler.split(".").slice(1);

      let mod = module;

      for (const p of functionObjectPath) {
        mod = mod[p];
      }

      const mapKinesisRecord = (record: Kinesis.Record) => ({
        approximateArrivalTimestamp: record.ApproximateArrivalTimestamp,
        data: record.Data.toString("base64"),
        partitionKey: record.PartitionKey,
        sequenceNumber: record.SequenceNumber,
      });

      return mod({
        Records: records.map((item) => ({
          kinesis: { ...mapKinesisRecord(item) },
        })),
      });
    };

    const fetchAndProcessRecords = async (
      shardIterator: ShardIterator
    ): Promise<void> => {
      const response = await this.kinesis
        .getRecords({
          ShardIterator: shardIterator,
          Limit: streamInformation.batchSize,
        })
        .promise();
      const records = response.Records || [];

      if (records.length > 0) {
        await dispatchRecordsToLambdaFunction(records);
      }

      setTimeout(async () => {
        await fetchAndProcessRecords(response.NextShardIterator!);
      }, streamInformation.batchWindow || 1000);
    };

    return fetchAndProcessRecords(shardIterator.ShardIterator!);
  };

  private async run() {
    try {
      await this.createKinesis(this.pluginOptionsWithDefaults.port);

      if (this.pluginOptionsWithDefaults.streams.length === 0) {
        throw new Error(
          `${pluginName} - Please define at least one stream on the ${pluginCustomKeyName} property`
        );
      }

      for (const { streamName, shards } of this.pluginOptionsWithDefaults
        .streams) {
        if (!streamName) {
          throw new Error(
            `${pluginName} - Please define a stream name for every stream in your array.`
          );
        }

        await this.createStream(streamName, shards);
      }

      const slsFunctions: ServerlessFunctionType = this.serverless.service
        .functions;

      const listOfKinesisStreamEvents = Object.entries(slsFunctions).flatMap(
        ([fnName, serverlessFunction]) => {
          const handler = serverlessFunction.handler || "";
          return (serverlessFunction.events || [])
            .filter(
              (serverlessEvent) =>
                handler &&
                serverlessEvent?.stream?.type === "kinesis" &&
                serverlessEvent?.stream?.arn?.includes("kinesis")
            )
            .filter((serverlessEvent) => {
              if (!serverlessEvent?.stream?.enabled) {
                this.serverlessLog(
                  `${fnName} - is being ignored from Kinesis stream due to it's 'enabled' flag being falsy`
                );
                return false;
              }
              return true;
            })
            .map(
              ({
                stream: {
                  arn,
                  batchSize = 10,
                  batchWindow = 1,
                  startingPosition = "LATEST",
                } = {},
              }) => {
                const streamName = arn?.substring(arn.indexOf("/") + 1) || "";

                return {
                  batchSize,
                  startingPosition,
                  handler,
                  streamName,
                  batchWindow: batchWindow * 1000,
                };
              }
            );
        }
      );

      for (const streamInformation of listOfKinesisStreamEvents) {
        this.initializePollKinesis(streamInformation);
      }
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
}

export = ServerlessLocalKinesis;
