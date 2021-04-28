# serverless-offline-kinesis-streams

A Serverless Plugin that creates local Kinesis streams and then triggers your Serverless Lambda Functions upon receiving new records.

It works depends on `serverless-offline`.

It works with:

- `serverless-webpack`
- `serverless-typescript`
- `serverless-parcel`

Serverless Offline Kinesis Streams also works with multiple Kinesis streams in the same Serverless file. It respects batchWindow and batchSize. You can even listen to the same Kinesis Stream with multiple Lambda functions at once with different batchWindow and batchSize values.

## Installation

Add the plugin to your project

```sh
yarn add -D serverless-offline-kinesis-streams
```

Then, add `serverless-offline-kinesis-streams` to your plugins. Example:

```
plugins:
  - serverless-layers
  - serverless-plugin-typescript
  - serverless-offline-kinesis-streams
  - serverless-offline
```

## Configuration

Simple setup

```yaml
custom:
  offlineKinesisStreams:
    port: 4567 # Optional; 4567 is the default port. The plugin launches a local Kinesis instance on this port
    region: local # Optional; local is the default
    streams: # Required; Define all streams and their streamNames with number of shards.
      - streamName: myFirstKinesisStream
        shards: 1

functions:
  myFirstKinesisStreamHandler:
    handler: src/myFirstKinesisStreamHandler.handler
    events:
      - stream:
          enabled: true
          type: kinesis
          arn: arn:aws:kinesis:${self:custom.region}:*:stream/myFirstKinesisStream # Same stream name from above.
```

Example with multiple stream:

```yaml
custom:
  offlineKinesisStreams:
    port: 4567
    region: local
    streams:
      - streamName: myFirstKinesisStream
        shards: 1
      - streamName: mySecondKinesisStream
        shards: 1

functions:
  myFirstKinesisStreamHandler:
    handler: src/myFirstKinesisStreamHandler.handler
    events:
      - stream:
          enabled: true
          type: kinesis
          arn: arn:aws:kinesis:${self:custom.region}:*:stream/myFirstKinesisStream
  mySecondKinesisStreamHandler:
    handler: src/mySecondKinesisStreamHandler.handler
    events:
      - stream:
          enabled: true
          type: kinesis
          arn: arn:aws:kinesis:${self:custom.region}:*:stream/mySecondKinesisStream
```

Example with batchWindow and batchSize:

The example below will trigger both Lambda functions when the single Kinesis Stream has records. They are independently monitored and their batchWindow & batchSize events are individual respected.

So, when records are put into the Kinesis stream, the `myFirstKinesisStreamHandler` will most likely pick them up first (10 records at a time). And then, every 60 seconds, `alsoListensToFirstStream` will grab 1 record. (This example is contrived. You'd never want such a high batchWindow and low batchSize.)

```yaml
custom:
  offlineKinesisStreams:
    port: 4567
    region: local
    streams:
      - streamName: myFirstKinesisStream
        shards: 1

functions:
  myFirstKinesisStreamHandler:
    handler: src/myFirstKinesisStreamHandler.handler
    events:
      - stream:
          enabled: true
          type: kinesis
          arn: arn:aws:kinesis:${self:custom.region}:*:stream/myFirstKinesisStream
  alsoListensToFirstStream:
    handler: src/mySecondKinesisStreamHandler.handler
    events:
      - stream:
          enabled: true
          type: kinesis
          batchWindow: 60 # Get records every 60 seconds
          batchSize: 1 # Get one record at a time
          arn: arn:aws:kinesis:${self:custom.region}:*:stream/myFirstKinesisStream
```

## Thanks

Features were extended off of [this implementation of a local Kinesis](https://github.com/pidz-development/serverless-local-kinesis)

Thanks to [mhart](https://github.com/mhart) for creating [kinesalite](https://github.com/mhart/kinesalite)
