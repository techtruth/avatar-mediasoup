#![allow(non_snake_case, non_camel_case_types)]
use byteorder::{BigEndian, ByteOrder};
use bytes::{Buf, BufMut, BytesMut};
use mediasoup::{
    prelude::*, router::RouterId, sctp_parameters::SctpParameters, srtp_parameters::SrtpParameters,
};
use serde::{Deserialize, Serialize};
use serde_json as json;
use std::{collections::HashMap, io, net::IpAddr};
use tokio_util::codec::{Decoder, Encoder};
use uuid::Uuid;

use crate::models::message::{NewConsumerOptions, NewDataConsumerOptions};

// server message sent to client
#[derive(Serialize, Deserialize, Debug)]
#[serde(untagged)]
pub enum RequestMessage {
    Incoming {
        wsid: String,
        message: MessageRequest,
    },
    IncomingServer {
        node: Option<Uuid>,
        wsid: Option<String>,
        message: MessageRequest,
    },
}

// server message sent to client
#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "type")]
pub enum MessageRequest {
    #[serde(rename_all = "camelCase")]
    createRouterGroup { data: Room },
    #[serde(rename_all = "camelCase")]
    consumeAudio { data: ConsumeAudioData },
    #[serde(rename_all = "camelCase")]
    consumeVideo { data: ConsumeVideoData },
    #[serde(rename_all = "camelCase")]
    consumeMovement { data: ConsumeMovementData },
    #[serde(rename_all = "camelCase")]
    consumeEvents { data: ConsumeEventsData },
    #[serde(rename_all = "camelCase")]
    createWebRTCIngress { data: CreateWebRTCIngress },
    #[serde(rename_all = "camelCase")]
    createWebRTCEgress { data: CreateWebRTCEgress },
    #[serde(rename_all = "camelCase")]
    connectWebRTCIngress { data: ConnectWebRTCIngressData },
    #[serde(rename_all = "camelCase")]
    connectWebRTCEgress { data: ConnectWebRTCEgressData },
    #[serde(rename_all = "camelCase")]
    createMediaProducer { data: CreateMediaProducerData },
    #[serde(rename_all = "camelCase")]
    createDataProducer { data: CreateDataProducerData },
    #[serde(rename_all = "camelCase")]
    createEventProducer { data: CreateEventProducerData },
    #[serde(rename_all = "camelCase")]
    disconnectTransport { data: DisconnectTransportData },
    #[serde(rename_all = "camelCase")]
    destroyRouterGroup { data: DestroyRouterGroupData },

    #[serde(rename_all = "camelCase")]
    storePipeRelay { data: StorePipeRelayData },
    #[serde(rename_all = "camelCase")]
    createRelayProducer { data: CreateRelayProducer },
    #[serde(rename_all = "camelCase")]
    connectPipeRelay { data: ConnectPipeRelayIncoming },
    #[serde(rename_all = "camelCase")]
    consumerPause { data: ConsumerMuteData },
    #[serde(rename_all = "camelCase")]
    consumerResume { data: ConsumerMuteData },
    #[serde(rename_all = "camelCase")]
    producerPause { data: ProducerMuteData },
    #[serde(rename_all = "camelCase")]
    producerResume { data: ProducerMuteData },
    #[serde(rename_all = "camelCase")]
    producerClose { data: ProducerCloseData },
    #[serde(rename_all = "camelCase")]
    restartIce { data: RestartIceData },
}
#[derive(Serialize, Deserialize, Debug)]
pub struct ProducerMuteData {
    pub peerId: Uuid,
    pub producerId: ProducerId,
    pub mediaType: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ConsumerMuteData {
    pub peerId: Uuid,
    pub consumerId: ConsumerId,
}

#[derive(Serialize, Clone, Deserialize, Debug)]
pub struct ProducerCloseData {
    pub peerId: Uuid,
    pub producerId: ProducerId,
    pub mediaType: String,
}

#[derive(Serialize, Clone, Deserialize, Debug)]
pub struct RestartIceData {
    pub peerId: Uuid,
    pub transportId: TransportId,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ProducerReplyMuteData {
    pub peerId: Uuid,
    pub producerId: ProducerId,
    pub mediaType: String,
    pub paused: bool,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ConnectPipeRelayIncoming {
    pub ingressRoute: RouterId,
    pub egressRoute: RouterId,
    pub egress: Uuid,
    pub ip: IpAddr,
    pub port: u16,
    pub srtp: SrtpParameters,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct CreateRelayProducer {
    pub groupId: String,
    pub peerId: Uuid,
    pub ingressRoute: RouterId,
    pub egress: Uuid,
    pub producerId: Option<ProducerId>,
    pub dataProducerId: Option<DataProducerId>,
    // pub producerOptions: Option<DataProduceOptionsData>,
    pub mediaType: Option<MediaKind>,
    pub rtpParameters: Option<RtpParameters>,
    pub sctpStreamParameters: Option<SctpStreamParameters>,
    pub label: Option<String>,
    pub appData: appData,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct StorePipeRelayData {
    pub ingressRoute: RouterId,
    pub egress: TransportId,
    pub ip: IpAddr,
    pub port: u16,
    pub srtp: SrtpParameters,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ConsumeAudioData {
    pub consumerPeer: Uuid,
    pub producerPeer: Vec<Uuid>,
    pub room: String,
    pub rtpCaps: RtpCapabilities, //todo!
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ConsumeVideoData {
    pub consumerPeer: Uuid,
    pub producerPeer: Vec<Uuid>,
    pub room: String,
    pub rtpCaps: RtpCapabilities,
}
#[derive(Serialize, Deserialize, Debug)]
pub struct ConsumeMovementData {
    pub consumerPeer: Uuid,
    pub producerPeer: Vec<Uuid>,
    pub room: String,
}
#[derive(Serialize, Deserialize, Debug)]
pub struct ConsumeEventsData {
    pub consumerPeer: Uuid,
    pub producerPeer: Vec<Uuid>,
    pub room: String,
}
#[derive(Serialize, Deserialize, Debug)]
pub struct CreateWebRTCIngress {
    pub peerId: Uuid,
    pub sctpOptions: SctpOptions, //todo !
    // pub rtpCapabilities: RtpCapabilities,
    pub routerNetwork: String,
    pub routerPipes: Vec<Option<Uuid>>, //todo !
}
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SctpOptions {
    pub OS: u16,
    pub MIS: u16,
}
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CreateWebRTCEgress {
    pub peerId: Uuid,
    pub sctpOptions: SctpOptions, //todo !
    // pub rtpCapabilities: RtpCapabilities,
    pub routerNetwork: String,
}
// ConnectWebRTCIngressData
#[derive(Serialize, Deserialize, Debug)]
pub struct ConnectWebRTCIngressData {
    pub dtlsParameters: DtlsParameters,
    pub peerId: Uuid,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ConnectWebRTCEgressData {
    pub dtlsParameters: DtlsParameters,
    pub peerId: Uuid,
}
#[derive(Serialize, Deserialize, Debug)]
pub struct CreateMediaProducerData {
    pub peerId: Uuid,
    pub producerOptions: ProductionOptionData,
    pub routerNetwork: String,
    pub rtpCapabilities: RtpCapabilities,
    pub egress: Uuid,
}
#[derive(Serialize, Deserialize, Debug)]
pub struct ProductionOptionData {
    pub kind: MediaKind,
    pub rtpParameters: RtpParameters,
    pub appData: appData,
}
// CreateDataProducerData
#[derive(Serialize, Deserialize, Debug)]
pub struct CreateDataProducerData {
    pub peerId: Uuid,
    pub producerOptions: DataProduceOptionsData,
    pub routerNetwork: String,
    pub egress: Uuid,
}
//CreateEventProducerData
#[derive(Serialize, Deserialize, Debug)]
pub struct CreateEventProducerData {
    pub peerId: Uuid,
    pub producerOptions: DataProduceOptionsData,
    pub routerNetwork: String,
    pub egress: Uuid,
}
#[derive(Serialize, Deserialize, Debug)]
pub struct DataProduceOptionsData {
    pub sctpStreamParameters: SctpStreamParamsData,
    pub label: String,
    pub protocol: String,
    pub appData: appData,
}
#[derive(Serialize, Deserialize, Debug)]
pub struct SctpStreamParamsData {
    pub streamId: u16,
    pub ordered: bool,
    pub maxPacketLifeTime: Option<u16>,
}
// DisconnectTransportData
#[derive(Serialize, Deserialize, Debug)]
pub struct DisconnectTransportData {
    pub peerId: Uuid,
}
// DestroyRouterGroupData
#[derive(Serialize, Deserialize, Debug)]
pub struct DestroyRouterGroupData {
    pub room: String,
}

// server message sent to client
#[derive(Serialize, Deserialize, Debug)]
#[serde(untagged)]
pub enum ResponseMessage {
    Outgoing {
        ws: Option<String>,
        message: MessageResponse,
    },
    OutgoingCommunication {
        ws: Option<String>,
        communication: MessageResponse,
    },
    OutgoingServer {
        // wsid: Option<String>,
        node: Option<Uuid>,
        message: MessageResponse,
    },
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "type")]
pub enum MessageResponse {
    Ping,
    #[serde(rename_all = "camelCase")]
    registerMediaServer {
        mode: String,
        region: String,
    },
    #[serde(rename_all = "camelCase")]
    joinedRoom {
        data: JoinRoomData,
    },
    #[serde(rename_all = "camelCase")]
    createdIngressTransport {
        data: CreatedIngressTransportData,
    },
    #[serde(rename_all = "camelCase")]
    egressReady {},
    #[serde(rename_all = "camelCase")]
    createdEgressTransport {
        data: CreatedEgressTransportData,
    },
    #[serde(rename_all = "camelCase")]
    createdRelayProducer {
        data: CreatedRelayProducerData,
    },
    #[serde(rename_all = "camelCase")]
    connectedIngressTransport {},
    #[serde(rename_all = "camelCase")]
    connectedEgressTransport {},
    #[serde(rename_all = "camelCase")]
    producedMedia {
        data: ProduceMediaData,
    },
    #[serde(rename_all = "camelCase")]
    producedData {
        data: ProduceData,
    },
    #[serde(rename_all = "camelCase")]
    producedEvents {
        data: ProduceEventData,
    },
    #[serde(rename_all = "camelCase")]
    audioAnnouncement {
        data: HashMap<Uuid, Vec<NewConsumerOptions>>,
    },
    #[serde(rename_all = "camelCase")]
    videoAnnouncement {
        data: HashMap<Uuid, Vec<NewConsumerOptions>>,
    },
    #[serde(rename_all = "camelCase")]
    movementAnnouncement {
        data: HashMap<Uuid, NewDataConsumerOptions>,
    },
    #[serde(rename_all = "camelCase")]
    eventAnnouncement {
        data: HashMap<Uuid, NewDataConsumerOptions>,
    },
    #[serde(rename_all = "camelCase")]
    serverLoad {
        mode: String,
        region: String,
        load: f32,
    },
    #[serde(rename_all = "camelCase")]
    createRelayProducer {
        data: CreateRelayProducerMessage,
    },
    #[serde(rename_all = "camelCase")]
    storePipeRelay {
        data: StorePipRelayData,
    },
    #[serde(rename_all = "camelCase")]
    connectPipeRelay {
        data: ConnectPipeRelayData,
    },
    #[serde(rename_all = "camelCase")]
    producerPaused {
        data: ProducerReplyMuteData,
    },
    #[serde(rename_all = "camelCase")]
    producerResume {
        data: ProducerReplyMuteData,
    },
    #[serde(rename_all = "camelCase")]
    restartedIce {
        data: RestartedIceData,
    },
}
#[derive(Serialize, Deserialize, Debug)]
pub struct CreatedRelayProducerData {
    pub peerId: Uuid,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<ProducerId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<MediaKind>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dataProducerId: Option<DataProducerId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub appData: appData,
}
#[derive(Serialize, Deserialize, Debug)]
pub struct ConnectPipeRelayData {
    pub ingressRoute: RouterId,
    pub egressRoute: RouterId,
    pub egress: Uuid,
    pub ip: IpAddr,
    pub port: u16,
    pub srtp: Option<SrtpParameters>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct StorePipRelayData {
    pub ingressRoute: RouterId,
    pub egress: Uuid,
    pub ip: IpAddr,
    pub port: u16,
    pub srtp: Option<SrtpParameters>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct JoinRoomData {
    pub roomRTPCapabilities: RtpCapabilitiesFinalized,
    pub ingress: Option<Uuid>,
    pub egress: Option<Uuid>,
}
#[derive(Serialize, Deserialize, Debug)]
pub struct Room {
    pub room: String,
}
#[derive(Serialize, Deserialize, Debug)]
pub struct CreatedIngressTransportData {
    pub id: TransportId,
    pub iceParameters: IceParameters,
    pub iceCandidates: Vec<IceCandidate>,
    pub dtlsParameters: DtlsParameters,
    pub sctpParameters: Option<SctpParameters>,
    pub ingress: Option<Uuid>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct CreatedEgressTransportData {
    pub id: TransportId,
    pub iceParameters: IceParameters,
    pub iceCandidates: Vec<IceCandidate>,
    pub dtlsParameters: DtlsParameters,
    pub sctpParameters: Option<SctpParameters>,
    pub egress: Option<Uuid>,
}
#[derive(Serialize, Deserialize, Debug)]
pub struct ProduceMediaData {
    pub id: ProducerId,
    pub kind: MediaKind,
    pub appData: appData,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ProduceData {
    pub dataProducerId: DataProducerId,
    pub label: String,
    pub appData: appData,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ProduceEventData {
    pub dataProducerId: DataProducerId,
    pub label: String,
    pub appData: appData,
}
#[derive(Serialize, Deserialize, Debug)]
pub struct appData(pub HashMap<String, String>);
impl appData {
    pub fn _get(&self, source: String) -> std::option::Option<std::string::String> {
        match self.0.get(&source) {
            Some(s) => Some(s.clone()),
            None => None,
        }
    }
}
impl Clone for appData {
    fn clone(&self) -> Self {
        Self(self.0.clone())
    }
}

#[derive(Serialize, Deserialize, Debug)]
pub struct CreateRelayProducerMessage {
    pub groupId: String,
    pub peerId: Uuid,
    pub ingressRoute: RouterId,
    pub egress: Uuid,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub producerId: Option<ProducerId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mediaType: Option<MediaKind>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rtpParameters: Option<RtpParameters>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dataProducerId: Option<DataProducerId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sctpStreamParameters: Option<SctpStreamParameters>,
    pub appData: appData,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct RestartedIceData {
    pub transportId: TransportId,
    pub iceParameters: IceParameters,
}

// end of structs and enums
pub struct ClientCodec;

impl Decoder for ClientCodec {
    type Item = RequestMessage;
    type Error = io::Error;

    fn decode(&mut self, src: &mut BytesMut) -> Result<Option<Self::Item>, Self::Error> {
        let size = {
            if src.len() < 2 {
                return Ok(None);
            }
            BigEndian::read_u16(src.as_ref()) as usize
        };

        if src.len() >= size + 2 {
            let _ = src.split_to(2);
            let buf = src.split_to(size);
            Ok(Some(json::from_slice::<RequestMessage>(&buf)?))
        } else {
            Ok(None)
        }
    }
}

impl Encoder<ResponseMessage> for ClientCodec {
    type Error = io::Error;
    fn encode(&mut self, msg: ResponseMessage, dst: &mut BytesMut) -> Result<(), Self::Error> {
        let msg = json::to_string(&msg).unwrap();
        let msg_ref: &[u8] = msg.as_ref();

        dst.reserve(msg_ref.len() + 2);
        dst.put_u16(msg_ref.len() as u16);
        dst.put(msg_ref);

        Ok(())
    }
}

#[derive(Debug, Copy, Clone)]
pub struct ServerCodec {
    size: Option<usize>,
}

impl Default for ServerCodec {
    fn default() -> Self {
        Self { size: None }
    }
}

impl Decoder for ServerCodec {
    type Item = RequestMessage;
    type Error = io::Error;

    fn decode(&mut self, src: &mut BytesMut) -> Result<Option<Self::Item>, Self::Error> {
        loop {
            match self.size {
                Some(size) => {
                    if src.len() >= size {
                        let msg = serde_json::from_slice(&src[..size])?;
                        src.advance(size);
                        self.size = None;
                        return Ok(Some(msg));
                    } else {
                        return Ok(None);
                    }
                }
                None => {
                    if src.len() < 4 {
                        return Ok(None);
                    }
                    self.size = Some(BigEndian::read_u32(&src[..4]) as usize - 4);
                    src.advance(4);
                }
            }
        }
    }
}

impl Encoder<ResponseMessage> for ServerCodec {
    type Error = io::Error;

    fn encode(&mut self, msg: ResponseMessage, dst: &mut BytesMut) -> Result<(), Self::Error> {
        let base = dst.len();

        dst.extend_from_slice(&[0; 4]);

        serde_json::to_writer(dst.writer(), &msg).unwrap();

        let len = (dst.len() - base) as u32;

        (&mut dst[base..]).put_u32(len);

        Ok(())
    }
}
