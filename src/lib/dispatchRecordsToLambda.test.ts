import { dispatchRecordsToLambdaFunction } from "./dispatchRecordsToLambda";
// @ts-expect-error
import example from "./example";

const handler = jest.spyOn(example, "handler");

describe("dispatchRecordsToLambdaFunction", () => {
  const logger = jest.fn();

  beforeEach(() => {
    logger.mockClear();
  });

  test("dispatchRecordsToLambdaFunction calls the module correctly", async () => {
    const handlerDir = __dirname + "/example.handler";
    await dispatchRecordsToLambdaFunction(
      [
        {
          Data: Buffer.from("Hello!").toString("base64"),
          SequenceNumber: "1",
          PartitionKey: "1",
        },
      ],
      logger,
      handlerDir,
      ""
    );

    expect(logger).toBeCalledWith("🤗 Invoking lambda " + handlerDir);
    expect(handler).toBeCalledTimes(1);
    expect(handler).toBeCalledWith({
      Records: [
        {
          kinesis: {
            approximateArrivalTimestamp: undefined,
            data: "SGVsbG8h",
            partitionKey: "1",
            sequenceNumber: "1",
          },
        },
      ],
    });
  });
});
