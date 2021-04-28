import { ServerlessFunctionType } from "./types";
import { buildListOfStreamEvents } from "./buildListOfStreamEvents";

describe("buildListOfStreamEvents", () => {
  const logger = jest.fn();

  beforeEach(() => {
    logger.mockClear();
  });

  const functions: ServerlessFunctionType = {
    kinesisFn: {
      name: "Kines fn",
      handler: "exists",
      events: [
        {
          stream: {
            arn: "kinesis/streamName",
            type: "kinesis",
            enabled: true,
          },
        },
      ],
    },
    kinesisFnNoHandler: {
      name: "Kines fn",
      events: [
        {
          stream: {
            arn: "kinesis/streamName",
            type: "kinesis",
            enabled: true,
          },
        },
      ],
    },
    kinesisFnNotEnabled: {
      name: "Kines fn",
      handler: "exists",
      events: [
        {
          stream: {
            arn: "kinesis/streamName",
            type: "kinesis",
            enabled: false,
          },
        },
      ],
    },
    ddbFnNotEnabled: {
      name: "Kines fn",
      handler: "exists",
      events: [
        {
          stream: {
            arn: "kinesis/streamName",
            type: "dynamodb",
            enabled: false,
          },
        },
      ],
    },
    httpFn: {
      name: "HTTP FN",
      events: [{ http: {} }],
    },
  };

  test("selects the functions with kinesis stream events", () => {
    const result = buildListOfStreamEvents(functions, logger);

    expect(result).toStrictEqual([
      {
        batchSize: 10,
        batchWindow: 1000,
        handler: "exists",
        startingPosition: "LATEST",
        streamName: "streamName",
      },
    ]);
  });
});
