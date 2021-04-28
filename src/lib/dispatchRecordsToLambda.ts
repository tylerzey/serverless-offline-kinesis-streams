import * as path from "path";
import { Kinesis } from "aws-sdk";

export const dispatchRecordsToLambdaFunction = async (
  records: Kinesis.RecordList,
  logger: (...args: any) => void,
  handler: string,
  servicePath: string
) => {
  logger(`🤗 Invoking lambda '${handler}'`);

  const moduleFileName = `${handler.split(".")[0]}.js`;

  const handlerFilePath = path.join(servicePath, moduleFileName);
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
