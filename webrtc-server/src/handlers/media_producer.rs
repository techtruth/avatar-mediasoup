#![allow(non_camel_case_types, non_snake_case)]
use std::{collections::HashMap, ops::Deref, sync::Arc};

use mediasoup::{
    prelude::{AppData, Consumer, ConsumerId},
    producer::{Producer, ProducerId, ProducerOptions},
    rtp_parameters::{MediaKind, RtpCapabilities, RtpParameters},
    transport::Transport,
};
use tokio::sync::{mpsc::Sender, Mutex, RwLock};
use uuid::Uuid;

use crate::{
    config::config::Config,
    models::sfu::{
        AudioProducers, PipeTransports, Relays, Transport2Router, Transports, VideoProducers,
    },
    utils::{
        codec::{appData, ProductionOptionData, ResponseMessage},
        utils::Mut,
    },
};

use super::relay_consumer::create_consumer_relay;

#[derive(Clone)]
pub struct ProducerReply {
    pub producerId: ProducerId,
    pub peerId: Uuid,
    pub mediaKind: MediaKind,
    pub routerNetwork: String,
    pub egress: Uuid,
    pub rtpParameters: RtpParameters,
    pub rtpCapabilities: RtpCapabilities,
    pub appData: appData,
}

pub async fn create_media_producer(
    transports: Arc<Mut<Transports>>,
    transport2router: Arc<RwLock<Transport2Router>>,
    audioProducers: Arc<Mutex<AudioProducers>>,
    videoProducers: Arc<Mutex<VideoProducers>>,
    pipeTransports: Arc<Mut<PipeTransports>>,
    relays: Arc<Mutex<Relays>>,
    producers: Arc<Mutex<HashMap<ProducerId, Producer>>>,
    consumers: Arc<Mutex<HashMap<ConsumerId, Consumer>>>,
    configs: Config,
    egress: Uuid,
    produceroptions: ProductionOptionData,
    peerid: Uuid,
    wsid: String,
    routerNetwork: String,
    rtpCapabilities: RtpCapabilities,
    sender: Sender<ResponseMessage>,
) -> Result<(), String> {
    let get_media_producer = transports.with(|innger| innger.get(peerid));
    let mut producer_options =
        ProducerOptions::new(produceroptions.kind, produceroptions.rtpParameters.clone());
    let app_data = appData(produceroptions.appData.0);
    producer_options.app_data = AppData::new(app_data.clone());
    if let Some(media_producer) = get_media_producer {
        match media_producer.produce(producer_options).await {
            Ok(producer) => match producer.kind() {
                MediaKind::Audio => {
                    let mut audio_producers = audioProducers.lock().await;
                    audio_producers.create(peerid, producer.clone());
                    let mut producer_guard = producers.lock().await;
                    producer_guard.insert(producer.id(), producer.clone());
                    create_consumer_relay(
                        transports.clone(),
                        transport2router.clone(),
                        relays.clone(),
                        pipeTransports.clone(),
                        routerNetwork.clone(),
                        configs.clone(),
                        wsid.clone(),
                        peerid.clone(),
                        egress,
                        producer.clone().kind(),
                        producer.id(),
                        producer
                            .clone()
                            .app_data()
                            .deref()
                            .clone()
                            .downcast::<appData>()
                            .unwrap()
                            .deref()
                            .clone(),
                        produceroptions.rtpParameters.clone(),
                        rtpCapabilities.clone(),
                        consumers.clone(),
                        sender.clone(),
                    )
                    .await?;
                    let producers_clone = producers.clone();
                    let producer_id = producer.clone().id();
                    let consumers_clone = consumers.clone();
                    let handle = tokio::runtime::Handle::current();
                    producer
                        .on_close(move || {
                            handle.spawn(async move {
                                let mut producer_close = producers_clone.lock().await;
                                let mut consumer_close = consumers_clone.lock().await;
                                for consumer in consumer_close.clone().into_iter() {
                                    if consumer.1.producer_id() == producer_id {
                                        consumer_close.remove(&consumer.0);
                                    }
                                }
                                producer_close.remove(&producer_id);
                                println!("closing this producer");
                            });
                        })
                        .detach();
                    return Ok(());
                }
                MediaKind::Video => {
                    let mut videoProducers = videoProducers.lock().await;
                    videoProducers.create(peerid, producer.clone());
                    producer
                        .on_trace(move |trace| {
                            println!("trace {:?}", trace);
                        })
                        .detach();
                    producer
                        .on_close(Box::new(move || println!("closing this producer video")))
                        .detach();
                    create_consumer_relay(
                        transports.clone(),
                        transport2router.clone(),
                        relays.clone(),
                        pipeTransports.clone(),
                        routerNetwork.clone(),
                        configs.clone(),
                        wsid.clone(),
                        peerid.clone(),
                        egress,
                        producer.clone().kind(),
                        producer.id(),
                        producer
                            .clone()
                            .app_data()
                            .deref()
                            .clone()
                            .downcast::<appData>()
                            .unwrap()
                            .deref()
                            .clone(),
                        produceroptions.rtpParameters.clone(),
                        rtpCapabilities.clone(),
                        consumers.clone(),
                        sender.clone(),
                    )
                    .await?;
                    let mut producer_guard = producers.lock().await;
                    producer_guard.insert(producer.id(), producer);
                    return Ok(());
                }
            },
            Err(_) => {
                println!("failed to create producer");
                Err("failed to create producer".to_string())
            }
        }
    } else {
        println!("can't find the peer router");
        Err("error creating producer".to_string())
    }
}
