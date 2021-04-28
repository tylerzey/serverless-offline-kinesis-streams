import { Kinesis } from "aws-sdk";
import { ShardIterator } from "aws-sdk/clients/kinesis";
// @ts-expect-error
import Kinesalite from "kinesalite";
import { dispatchRecordsToLambdaFunction } from "./lib/dispatchRecordsToLambda";
import { StreamType, ServerlessFunctionType } from "./lib/types";

const pluginName = "serverless-offline-kinesis-streams";
const pluginCustomKeyName = "offlineKinesisStreams";

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

    const pluginOptions = {
      ...this.serverless.service.custom[pluginCustomKeyName],
    };

    this.pluginOptionsWithDefaults = {
      port: pluginOptions.port || 4567,
      region: pluginOptions.region || "local",
      streams: pluginOptions.streams.map((streamData: StreamType) => ({
        streamName: streamData.streamName,
        shards: streamData.shards || 1,
      })),
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
        await dispatchRecordsToLambdaFunction(
          records,
          this.serverlessLog,
          handler,
          this.serverless.config.servicePath
        );
      }

      setTimeout(() => {
        fetchAndProcessRecords(response.NextShardIterator!);
      }, streamInformation.batchWindow || 1000);
    };

    return fetchAndProcessRecords(shardIterator.ShardIterator!);
  };

  private async run() {
    try {
      const streams = this.pluginOptionsWithDefaults.streams;

      if (streams.length === 0) {
        throw new Error(
          `${pluginName} - Please define at least one stream on the ${pluginCustomKeyName} property`
        );
      }

      await this.createKinesis(this.pluginOptionsWithDefaults.port);

      for (const { streamName, shards } of streams) {
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
