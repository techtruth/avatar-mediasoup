import { Guid, PeerCounter } from "@webapp/../libs/peerTypes";
import { Consumer } from "mediasoup-client/lib/Consumer";
import {
  AppData,
  DataConsumer,
  DataProducer,
  IceParameters,
  Producer,
  Transport,
} from "mediasoup-client/lib/types";

export interface RestartIceAvatar {
  name: string;
  transport: Transport;
  peerId: Guid;
  iceParameters?: IceParameters;
  ingress?: Guid;
  egress?: string;
}

export type ConsumerTransports = Transport[];

export type AudioConsumer = Consumer[];
export type screenAudioConsumers = Consumer[];
export type VideoConsumer = Consumer[];
export type screenVideoConsumers = Consumer[];

export type VideoProducer = undefined | Producer;
export type AudioProducer = undefined | Producer;
export type MovementProducer = undefined | DataProducer;

export type FrameEventsProducer = undefined | DataProducer;
export type ScreenVideoProducer = Producer[];
export type ScreenAudioProducer = Producer[];

export type EventHandler = (...args: any[]) => void;

export interface FrameEventsHandler {
  [key: string]: EventHandler[];
  [key: number]: EventHandler[];
}

export interface MovementConsumers {
  [key: Guid]: DataConsumer[];
}

export interface FrameEventsConsumers {
  [key: Guid]: DataConsumer[];
}

export type ProducerTransports = Transport | undefined;
export type SignalTransport = undefined | WebSocket;

export type CallBackHandler = undefined | ((param: string) => void);
export type EnterCallBackHandler = undefined | ((frameName: string) => void);
export type LeaveCallBackHandler = undefined | ((frameName: string) => void);
export type MovementCallBackHandler =
  | undefined
  | ((data: any, peerId: Guid) => void);
export type PeerCallBackHandler =
  | undefined
  | ((roomName: string, roomCount: PeerCounter) => void);

export type MediaCallBackHandler =
  | undefined
  | ((peerId: Guid, track: MediaStreamTrack, appData: AppData) => void);

export type IndicatorCallBackHandler =
  | undefined
  | ((peerId: Guid, indicators: any, shouldReply: boolean) => void);

export type StateCallBackHandler =
  | undefined
  | ((peerId: Guid, state: string, type: string) => void);

interface MediaStreamsType {
  audioTrack: MediaStreamTrack | undefined | boolean;
  videoTrack: MediaStreamTrack | undefined | boolean;
}

export type MediaStreams = MediaStreamsType | undefined;
