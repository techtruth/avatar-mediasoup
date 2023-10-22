use std::{collections::HashMap, ops::Deref, sync::Arc};

use mediasoup::{
    prelude::AppData,
    producer::{Producer, ProducerId, ProducerOptions},
    router::{PipeToRouterOptions, RouterId},
    rtp_parameters::{MediaKind, RtpParameters},
    transport::Transport,
};
use tokio::sync::{mpsc::Sender, Mutex};
use uuid::Uuid;

use crate::{
    config::config::Config,
    models::sfu::{
        AudioProducers, PipeTransports, RelayRouters, Relays, RoomRouters, Routers, VideoProducers,
    },
    utils::{
        codec::{appData, CreatedRelayProducerData, MessageResponse, ResponseMessage},
        utils::{get_nodeid, Mut},
    },
};

pub async fn create_relay_producer(
    peer_id: Uuid,
    ingress_route: RouterId,
    producer_id: ProducerId,
    group_id: String,
    media_type: MediaKind,
    rtp_parameters: RtpParameters,
    app_data: appData,
    relays: Arc<Mutex<Relays>>,
    pipetransports: Arc<Mut<PipeTransports>>,
    room_routers: Arc<Mutex<RoomRouters>>,
    relay_routers: Arc<Mutex<RelayRouters>>,
    routers: Arc<Mutex<Routers>>,
    audio_producers: Arc<Mutex<AudioProducers>>,
    video_producers: Arc<Mutex<VideoProducers>>,
    config: Config,
    producers: Arc<Mutex<HashMap<ProducerId, Producer>>>,
    sender: Sender<ResponseMessage>,
) -> Result<(), String> {
    //let ingress = ingress_route.clone().into();
    let get_relay_producer = relays.lock().await.get_router(ingress_route.clone());
    if get_relay_producer.is_empty() {
        println!("relay producer error:");
        return Err(String::from("cannot find the ingress router!"));
    } else {
        let ingress_id = ingress_route.clone();
        let get_relay_transport = pipetransports.with(|p| p.get(get_relay_producer[0].transport));

        if let Some(relay_transport) = get_relay_transport {
            let mut producer_options =
                ProducerOptions::new_pipe_transport(producer_id, media_type, rtp_parameters);
            producer_options.app_data = AppData::new(app_data.clone());
            let relay_producer = relay_transport
                .pipe_transport
                .produce(producer_options)
                .await
                .map_err(|error| format!("Failed to relay produce Pipe transport: {:?}", error))?;
            let router_network = room_routers.lock().await.get(group_id);
            let relay_router = relay_routers.lock().await.get(ingress_id);
            if router_network.is_some() && relay_router.is_some() {
                for router_info in router_network.unwrap().into_iter() {
                    if relay_router.is_some() {
                        if router_info.id() == relay_router.unwrap() {
                            println!("Can not pipe media router data to itself");
                            continue;
                        }

                        let get_routers = routers.lock().await.get(relay_router.clone().unwrap());
                        if get_routers.is_some() {
                            if get_routers.clone().unwrap().closed() {
                                println!("FROM CREATE RELAY PRODUCER");
                                println!(
                                    "Killing process, for the greater good. Source Router is closed."
                                );
                                std::process::exit(1);
                                //kill process
                            }
                        }
                        let current_router = routers.lock().await.get(router_info.id());
                        if current_router.is_none() {
                            println!("couldn't find curent router: {:?}", &router_info.id());
                            return Err("couldn't find curent router".to_string());
                        }
                        if current_router.clone().unwrap().closed() {
                            println!("FROM CREATE RELAY PRODUCER");
                            println!(
                                "Killing process, for the greater good. Dest Router is closed."
                            );
                            std::process::exit(1);
                            //kill process
                        }
                        let pipe_router = routers.lock().await.get(relay_router.unwrap());
                        if pipe_router.is_none() {
                            println!(
                                "couldn't find curent pipe router {:?}",
                                &relay_router.unwrap()
                            );
                            return Err("couldn't find curent pipe router".to_string());
                        }
                        let pipe_option = PipeToRouterOptions::new(current_router.unwrap().clone());
                        pipe_router
                            .unwrap()
                            .pipe_producer_to_router(relay_producer.id(), pipe_option)
                            .await
                            .map_err(|error| {
                                format!("Failed to Pipe to router transport: {}", error)
                            })?;
                    }
                }
            }
            // prepare to send information back to client
            if relay_producer.kind() == MediaKind::Audio {
                let mut audio_producers = audio_producers.lock().await;
                audio_producers.create(peer_id, relay_producer.clone());
                let reply_message = ResponseMessage::OutgoingServer {
                    node: get_nodeid(config.ingress, config.egress),
                    message: MessageResponse::createdRelayProducer {
                        data: CreatedRelayProducerData {
                            peerId: peer_id,
                            id: Some(relay_producer.id()),
                            kind: Some(relay_producer.kind()),
                            dataProducerId: None,
                            label: None,
                            appData: relay_producer
                                .app_data()
                                .deref()
                                .clone()
                                .downcast::<appData>()
                                .unwrap()
                                .deref()
                                .clone(),
                        },
                    },
                };
                let _ = sender.send(reply_message).await;
                let mut save_producer = producers.lock().await;
                save_producer.insert(relay_producer.id(), relay_producer);
            } else if relay_producer.kind() == MediaKind::Video {
                let mut video_producers = video_producers.lock().await;
                video_producers.create(peer_id, relay_producer.clone());
                let reply_message = ResponseMessage::OutgoingServer {
                    node: get_nodeid(config.ingress, config.egress),
                    message: MessageResponse::createdRelayProducer {
                        data: CreatedRelayProducerData {
                            peerId: peer_id,
                            id: Some(relay_producer.id()),
                            kind: Some(relay_producer.kind()),
                            dataProducerId: None,
                            label: None,
                            appData: relay_producer
                                .app_data()
                                .deref()
                                .clone()
                                .downcast::<appData>()
                                .unwrap()
                                .deref()
                                .clone(),
                        },
                    },
                };

                let _ = sender.send(reply_message).await;
                let mut save_producer = producers.lock().await;
                save_producer.insert(relay_producer.id(), relay_producer);
            } else {
                return Err(String::from(
                    "error relay producer for audio/video there is not a matching media type",
                ));
            }
            return Ok(());
        } else {
            return Err(String::from("error creating relay producer!"));
        }
    }
}
