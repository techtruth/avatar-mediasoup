#![allow(non_camel_case_types, non_snake_case)]
use mediasoup::{
    data_producer::DataProducerId,
    prelude::{ConsumerId, DataConsumerId, SctpStreamParameters},
    producer::ProducerId,
    rtp_parameters::{MediaKind, RtpParameters},
    transport::TransportId,
};
use serde::{Deserialize, Serialize};

use crate::utils::codec::appData;
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct NewConsumerOptions {
    pub id: ConsumerId,
    pub transportId: TransportId,
    pub producerId: ProducerId,
    pub kind: MediaKind,
    pub rtpParameters: RtpParameters,
    pub appData: appData,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct NewDataConsumerOptions {
    pub id: DataConsumerId,
    pub transportId: TransportId,
    pub dataProducerId: DataProducerId,
    pub sctpStreamParameters: SctpStreamParameters,
    pub label: String,
    pub protocol: String,
    pub appData: appData,
}
