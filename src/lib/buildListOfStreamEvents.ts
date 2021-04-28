import { ServerlessFunctionType } from "./types";

export const buildListOfStreamEvents = (
  slsFunctions: ServerlessFunctionType,
  logger: (...args: any[]) => void
): {
  batchSize: number;
  startingPosition: string;
  handler: string;
  streamName: string;
  batchWindow: number;
}[] => {
  return Object.entries(slsFunctions).flatMap(
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
            logger(
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
};
