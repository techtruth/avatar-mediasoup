import {
  DtlsParameters,
  IceCandidate,
  IceParameters,
} from "mediasoup-client/lib/Transport";
import { Guid, PeerCounter, SctpOptions } from "./peerTypes";
import { Socket } from "net";
import { ProducerOptions } from "mediasoup-client/lib/Producer";
import {
  RtpCapabilities,
  RtpCodecCapability,
  RtpParameters,
} from "mediasoup-client/lib/RtpParameters";
import { DataProducerOptions } from "mediasoup-client/lib/DataProducer";
import {
  AppData,
  SctpParameters,
  SctpStreamParameters,
} from "mediasoup-client/lib/types";

export interface Server {
  [key: Guid]: Socket;
}

export interface Regions {
  [key: Guid]: Guid[];
}

export interface ServerLoads {
  [key: Guid]: { [key: Guid]: number };
}

export interface RoutingTableItems {
  ingress: Guid[];
  egress: Guid[];
  movement: Guid[];
}

export interface RoutingTable {
  [key: Guid]: RoutingTableItems;
}

export interface MediaServerPipe {
  ingress: Guid;
  egress: Guid;
  ingressRoute: Guid;
  egressRoute: Guid | undefined;
}

export type MediaServerPipes = MediaServerPipe[];
export type NetSocket = Socket;
export type ParseMessages = {
  wsid: Guid;
  node: Guid;
  message?: MessageResponse;
  communication?: CommunicationResponse;
};

export type CommunicationResponse =
  | {
      type: "identity";
      data: {
        id: Guid;
        region: string;
      };
    }
  | {
      type: "joinedRoom";
      data: {
        roomRTPCapabilities?: RtpCapabilities;
        ingress?: Guid;
        egress?: Guid;
        movement?: Guid;
        serverInfo?: { hostname?: string; room?: string };
      };
    }
  | {
      type: "createdIngressTransport";
      data: {
        id: Guid;
        iceParameters: IceParameters;
        iceCandidates: IceCandidate[];
        dtlsParameters: DtlsParameters;
        sctpParameters?: SctpParameters;
        ingress?: Guid;
      };
    }
  | {
      type: "createdEgressTransport";
      data: {
        id: Guid;
        iceParameters: IceParameters;
        iceCandidates: IceCandidate[];
        dtlsParameters: DtlsParameters;
        sctpParameters?: SctpParameters;
        egress?: Guid;
      };
    }
  | { type: "connectedIngressTransport" }
  | { type: "connectedEgressTransport" }
  | { type: "audioAnnouncement"; data: Record<Guid, NewConsumerOptions[]> }
  | { type: "videoAnnouncement"; data: Record<Guid, NewConsumerOptions[]> }
  | {
      type: "movementAnnouncement";
      data: Record<Guid, NewDataConsumerOptions>;
    }
  | { type: "eventAnnouncement"; data: Record<Guid, NewDataConsumerOptions> }
  | {
      type: "producedMedia";
      data: {
        id: Guid;
        kind: string;
        appData: AppData;
      };
    }
  | {
      type: "producedData";
      data: {
        dataProducerId: Guid;
        label: string;
        appData: AppData;
      };
    }
  | {
      type: "producedEvents";
      data: {
        dataProducerId: Guid;
        label: string;
        appData: AppData;
      };
    }
  | { type: "peerDisconnect"; data: { peer: Guid } }
  | {
      type: "setConsumerState";
      data: { peerId: Guid; state: string; type: string };
    }
  | { type: "hushed"; data: { peerId: Guid } }
  | {
      type: "peerIndicators";
      data: {
        indicators: any;
        peerId: Guid;
      };
    }
  | {
      type: "peerIndicatorsReply";
      data: {
        indicators: any;
        peerId: Guid;
      };
    }
  | { type: "peerLagScore"; data: any }
  | { type: "peerCount"; data: Record<string, PeerCounter> }
  | { type: "bootUser"; data: { peerId: Guid } }
  | {
      type: "producerResume";
      data: {
        peerId: Guid;
        producerId: Guid;
        mediaType: string;
      };
    }
  | {
      type: "producerPaused";
      data: {
        peerId: Guid;
        producerId: Guid;
        mediaType: string;
        paused: boolean;
      };
    }
  | {
      type: "restartedIce";
      data: {
        transportId: Guid;
        iceParameters: IceParameters;
      };
    };

export type NewConsumerOptions = {
  id: Guid;
  transportId: Guid;
  producerId: Guid;
  kind: string;
  rtpParameters: RtpParameters;
  appData: AppData;
};

export type NewDataConsumerOptions = {
  id: Guid;
  transportId: Guid;
  dataProducerId: Guid;
  sctpStreamParameters: SctpStreamParameters;
  label: string;
  protocol: string;
  appData: AppData;
};
// netSocket request
// export type ResponseMessage = { wsid: Guid; message: MessageResponse };
export type MessageResponse =
  | { type: "registerMediaServer"; mode: string; region: string }
  | { type: "registerMovementServer"; mode: string; region: string }
  | { type: "createdMovementServer"; domain: string }
  | {
      type: "storePipeRelay";
      data: {
        ingressRoute: Guid;
        egress: Guid;
        ip: string;
        port: number;
        srtp: any;
      };
    }
  | {
      type: "connectPipeRelay";
      data: {
        ingressRoute: Guid;
        egressRoute: Guid;
        egress: Guid;
        ip: string;
        port: number;
        srtp: any;
      };
    }
  | {
      type: "createRelayProducer";
      data: {
        groupId: string;
        peerId: Guid;
        ingressRoute: Guid;
        egress: Guid;
        producerId?: Guid;
        dataProducerId?: Guid;
        mediaType: string;
        rtpParameters: RtpParameters;
        sctpStreamParameters: {
          streamId: Guid;
          ordered: boolean;
          maxPacketLifeTime: number;
        };
        label: string;
        appData: any;
      };
    }
  | {
      type: "createdRelayProducer";
      data: {
        peerId: Guid;
        id: Guid;
        kind: string;
        dataProducerId: Guid;
        label: string;
        appData: AppData;
      };
    }
  | { type: "serverLoad"; mode: string; region: string; load: number }
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
  rtpCapabilities: RtpCodecCapability;
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

export type ProducerClose = {
  peerId: Guid;
  producerId: Guid;
  mediaType: string;
};

export type DisconnectTransport = {
  peerId: Guid;
};

export type DestroyRouterGroup = {
  room: string;
};

export type RestartIce = {
  transportId: Guid;
  peerId: Guid;
};
