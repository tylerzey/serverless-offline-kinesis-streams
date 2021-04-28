import { ShardIteratorType } from "aws-sdk/clients/kinesis";

export interface StreamType {
  streamName: string;
  shards: number;
}

export type ServerlessEventType = {
  arn?: string;
  enabled?: boolean;
  type?: "kinesis" | "dynamodb";
  batchSize?: number;
  batchWindow?: number;
  startingPosition?: ShardIteratorType;
};
export type ServerlessEventObjectType = {
  stream?: ServerlessEventType;
  http?: ServerlessEventType;
};

type FunctionName = string;
export type FunctionDefinitionHandler = {
  handler?: string;
  name: string;
  events?: ServerlessEventObjectType[];
};
export type ServerlessFunctionType = Record<
  FunctionName,
  FunctionDefinitionHandler
>;
