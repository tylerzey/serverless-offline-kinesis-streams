# serverless-offline-kinesis-streams

A Serverless Plugin that creates local Kinesis streams and then triggers your Serverless Lambda Functions upon receiving new records.

It works depends on `serverless-offline`.

It works with:

- `serverless-webpack`
- `serverless-typescript`
- `serverless-parcel`

Serverless Offline Kinesis Streams also works with multiple Kinesis streams in the same Serverless file.

It will create one stream for every stream you add to your streams array in the configuration file. This will then trigger each function that listens to that stream

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

Example with one stream:

```yaml
custom:
  offlineKinesisStreams:
    port: 4567 # Optional; 4567 is the default port. The plugin launches a local Kinesis instance on this port
    region: local # Optional; local is the default
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
```

Example with multiple stream:

```yaml
custom:
  offlineKinesisStreams:
    port: 4567 # Optional; 4567 is the default port. The plugin launches a local Kinesis instance on this port
    region: local # Optional; local is the default
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

## Thanks

Features were extended off of [this implementation of a local Kinesis](https://github.com/pidz-development/serverless-local-kinesis)

Thanks to [mhart](https://github.com/mhart) for creating [kinesalite](https://github.com/mhart/kinesalite)
