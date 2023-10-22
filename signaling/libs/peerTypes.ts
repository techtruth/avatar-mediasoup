import {
  AppData,
  DtlsParameters,
  Producer,
  RtpCapabilities,
  SctpStreamParameters,
  DataProducerOptions,
  ProducerOptions,
  NumSctpStreams,
} from "mediasoup-client/lib/types";
// general types
export type Guid = string;
export type ProducerMediaOpts = {
  kind: string;
  rtpParameters: SctpStreamParameters;
  appData: AppData;
};
export type DataProducerOpts = {
  sctpStreamParameters: SctpStreamParameters;
  label: string;
  appData: AppData;
};

export interface Peer {
  id: Guid;
  transportSignal: string;
  deviceRTPCapabilities: RtpCapabilities | undefined;
  room: string | undefined;
  debug: boolean | undefined;
  region: string;
  isLobby: boolean;
  ingress: Guid | undefined;
  egress: Guid | undefined;
  movement: Guid | undefined;
  deviceCapabilities: RtpCapabilities | undefined;
  sctpOptions: SctpOptions | undefined;
  isParticipant: boolean;
  isSpectator: boolean;
  audioProducer: Producer | undefined;
  videoProducer: Producer | undefined;
  desktopAudioProducer: Producer | undefined;
  desktopVideoProducer: Producer | undefined;
}

export type Peers = Map<Guid, Peer>;

export interface PeerCounters {
  get(key: string): PeerCounter;
  set(key: string, value: PeerCounter): void;
  delete(key: string): void;
}

export interface PeerCounter {
  lobbyCount: number;
  spectatorCount: number;
  peerCount: number;
  participantCount: number;
}

export type SctpOptions = {
  OS: number;
  MIS: number;
};

// room
export interface Room {
  ingress: string[];
  egress: string[];
  movement: string[];
}

// rooms
export type Rooms = Map<string, Room>;

// newSignal
export type NewConsumerSignal = {
  wsid: Guid;
  message: {
    type?: string;
    data: {
      rtpCaps?: RtpCapabilities;
      consumerPeer: string;
      producerPeer: string[];
      room: string;
    };
  };
};

// signalling
export type RequestMessage =
  | { type: "requestIdentity"; message: RequestIdentity }
  | { type: "getRoomMetrics"; message: GetRoomMetrics }
  | { type: "joinRoom"; message: JoinRoom }
  | { type: "createIngressTransport"; message: CreateIngressTransport }
  | { type: "createEgressTransport"; message: CreateEgressTransport }
  | { type: "connectIngressTransport"; message: ConnectIngressTransport }
  | { type: "connectEgressTransport"; message: ConnectEgressTransport }
  | { type: "restartIce"; message: RestartIce }
  | { type: "produceMedia"; message: ProduceMedia }
  | { type: "produceData"; message: ProduceData }
  | { type: "produceEvents"; message: ProduceData }
  | { type: "muteProducer"; message: MuteProducer }
  | { type: "resumeProducer"; message: MuteProducer }
  | { type: "producerClose"; message: ProducerClose }
  | { type: "getRoomAudio"; message: RequestPeer }
  | { type: "getRoomVideo"; message: RequestPeer }
  | { type: "getRoomMovement"; message: RequestMovement }
  | { type: "getRoomEvents"; message: RequestPeer }
  | { type: "setAudioState"; message: SetState }
  | { type: "setVideoState"; message: SetState }
  | { type: "setDesktopState"; message: SetState }
  | { type: "hushPeers"; message: HushPeers }
  | { type: "hushUser"; message: HushUser }
  | { type: "bootPeer"; message: { peerId: Guid } }
  | { type: "disconnectPeerWebsocket"; message: Disconnect }
  | { type: "leaveRoom"; message: LeaveRoom }
  | { type: "peerIndicators"; message: PeerIndicators }
  | { type: "replyPeerIndicators"; message: ReplyPeerIndicators }
  | { type: "beginSendingStats"; message: undefined }
  | { type: "endSendingStats"; message: undefined }
  | { type: "getMovementServer"; message: GetMovementServer };

// export type RequestMessageType<T extends RequestMessage["type"]> = Extract<
//   RequestMessage,
//   { type: T }
// >;

export type TypeOfRequestMessage = RequestMessage["type"];

export type RequestMessageType<T extends TypeOfRequestMessage> =
  T extends TypeOfRequestMessage
    ? Extract<RequestMessage, { type: T }>["message"]
    : never;

export type RequestIdentity = { region: string };
export type GetRoomMetrics = { peerId: Guid; rooms: string[] };
export type JoinRoom = { peerId: Guid; room: string };
export type CreateIngressTransport = {
  peerId: Guid;
  numStreams: NumSctpStreams;
  rtpCapabilities: RtpCapabilities;
};
export type CreateEgressTransport = {
  peerId: Guid;
  numStreams: NumSctpStreams;
  rtpCapabilities: RtpCapabilities;
  egress: Guid;
};
export type ConnectIngressTransport = {
  peerId: Guid;
  direction: string | undefined;
  dtlsParameters: DtlsParameters;
};
export type ConnectEgressTransport = {
  peerId: Guid;
  direction: string;
  dtlsParameters: DtlsParameters;
  egress?: Guid;
};
export type RestartIce = {
  transportId: Guid;
  peerId: Guid;
  ingress: Guid;
  egress: Guid;
};
export type ProduceMedia = {
  producingPeer: string;
  producerOptions: ProducerMediaOpts;
};
export type ProduceData = {
  producingPeer: string;
  producerOptions: {
    sctpStreamParameters: SctpStreamParameters;
    label: string;
    protocol: any;
    appData: AppData;
  };
};
export type VoiceZoneAudio = {
  peerId: string;
  consumerIds: string[];
  mute: boolean;
};
export type MuteProducer = {
  peerId: Guid;
  producerId: Guid;
  kind: string;
};
export type ProducerClose = {
  peerId: Guid;
  producerId: Guid;
  mediaType: string;
};
export type SetState = {
  peerId: Guid;
  state: boolean;
};
export type HushPeers = {
  peerId: Guid;
};
export type HushUser = {
  peerId: Guid;
  hushed: Guid;
};
export type RequestPeer = {
  requestingPeer: string;
};
export type RequestMovement = {
  requestingPeer: string;
  isSpectator: boolean;
};
export type Disconnect = {
  code: number;
  transport: Guid;
};
export type LeaveRoom = {
  peerId: Guid;
  room: string;
};
export type PeerIndicators = {
  peerId: Guid;
  indicators: Indicator;
};

export type ReplyPeerIndicators = {
  originId: Guid;
  peerId: Guid;
  indicators: Indicators;
};

export type GetMovementServer = {
  room: string;
  region: string;
};

// thrid level
// TODO these needs to be typed properly
export type Indicator = { avatar: any } | { facade: any };
export type Indicators = {
  facade: any;
  avatar: any;
  assetBindings: any;
};

// netSocket request
export type ResponseMessage = { wsid: Guid; message: MessageResponse };
export type MessageResponse =
  | { type: "createWebRTCIngress"; data: CreateWebrtcIngress }
  | { type: "createWebRTCEgress"; data: CreateWebrtcEgress }
  | { type: "connectWebRTCIngress"; data: ConnectWebRTC }
  | { type: "connectWebRTCEgress"; data: ConnectWebRTC }
  | { type: "createDataProducer"; data: CreateDataProducer }
  | { type: "createEventProducer"; data: CreateDataProducer }
  | { type: "createMediaProducer"; data: CreateMediaProducer }
  | { type: "restartIce"; data: RestartIce }
  | { type: "producerPause"; data: ProducerPause }
  | { type: "producerResume"; data: ProducerPause }
  | { type: "consumerPause"; data: ConsumerPause }
  | { type: "consumerResume"; data: ConsumerPause }
  | { type: "producerClose"; data: ProducerClose }
  | { type: "disconnectTransport"; data: DisconnectTransport }
  | { type: "destroyRouterGroup"; data: DestroyRouterGroup };

export type CreateWebrtcIngress = {
  peerId: Guid;
  sctpOptions: SctpOptions;
  routerNetwork: string;
  routerPipes: string[];
};

export type CreateWebrtcEgress = {
  peerId: Guid;
  sctpOptions: SctpOptions;
  routerNetwork: string;
};

export type ConnectWebRTC = {
  dtlsParameters: DtlsParameters;
  peerId: Guid;
};

export type CreateDataProducer = {
  peerId: Guid;
  producerOptions: DataProducerOptions;
  routerNetwork: string;
  egress: string;
};

export type CreateMediaProducer = {
  peerId: Guid;
  producerOptions: ProducerOptions;
  routerNetwork: string;
  rtpCapabilities: RtpCapabilities;
  egress: string;
};

export type ProducerPause = {
  peerId: Guid;
  producerId: Guid;
  mediaType: string;
};

export type ConsumerPause = {
  peerId: Guid;
  consumerId: Guid;
};

export type DisconnectTransport = {
  peerId: Guid;
};

export type DestroyRouterGroup = {
  room: string;
};
