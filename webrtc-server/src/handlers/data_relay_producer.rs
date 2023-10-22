use std::{collections::HashMap, ops::Deref, sync::Arc};

use log::{error, info};
use mediasoup::{
    data_producer::{DataProducerId, DataProducerOptions},
    prelude::{AppData, DataProducer, SctpStreamParameters},
    router::{PipeToRouterOptions, RouterId},
    transport::Transport,
};
use tokio::sync::{mpsc::Sender, Mutex};
use uuid::Uuid;

use crate::{
    config::config::Config,
    models::sfu::{
        EventProducers, MovementProducers, PipeTransports, RelayRouters, Relays, RoomRouters,
        Routers,
    },
    utils::{
        codec::{appData, CreatedRelayProducerData, MessageResponse, ResponseMessage},
        utils::{get_nodeid, Mut},
    },
};

pub async fn create_relay_datachannel_producer(
    ingress_route: RouterId,
    router_network: String,
    _consumer_id: DataProducerId,
    peer_id: Uuid,
    label: String,
    sctp_stream_parameters: SctpStreamParameters,
    app_data: appData,
    routers: Arc<Mutex<Routers>>,
    room_routers: Arc<Mutex<RoomRouters>>,
    relays: Arc<Mutex<Relays>>,
    pipetransports: Arc<Mut<PipeTransports>>,
    event_producers: Arc<Mut<EventProducers>>,
    movement_producers: Arc<Mut<MovementProducers>>,
    relay_routers: Arc<Mutex<RelayRouters>>,
    data_producers: Arc<Mutex<HashMap<DataProducerId, DataProducer>>>,
    config: Config,
    sender: Sender<ResponseMessage>,
) -> Result<(), String> {
    let data_producer = event_producers.with(|ep| ep.clone());
    let peer_producer = data_producer.get(peer_id);
    if peer_producer.as_ref().is_some() {
        return Err(format!(
            "peer {:?} has already produced {:?}!",
            peer_id, label
        ));
    }
    let get_relay_producer = relays.lock().await.get_router(ingress_route.clone());
    if get_relay_producer.is_empty() {
        println!("relay producer error:");
        return Err(String::from("cannot find the ingress router!"));
    } else {
        let get_relay_transport = pipetransports.with(|p| p.get(get_relay_producer[0].transport));
        if let Some(relay_transport) = get_relay_transport {
            //let sctp_stream_parameters = SctpStreamParameters::new_ordered(stream_id);
            let mut data_producer_options = DataProducerOptions::new_sctp(sctp_stream_parameters);
            data_producer_options.label = label.clone();
            data_producer_options.app_data = AppData::new(app_data.clone());
            let relay_producer = relay_transport
                .pipe_transport
                .produce_data(data_producer_options)
                .await
                .map_err(|error| format!("Error receiving piped network data: {:?}", error))?;
            relay_producer
                .on_close(Box::new(move || {
                    info!("closing relay data producer");
                }))
                .detach();

            let router_network = room_routers.lock().await.get(router_network);
            if router_network.is_some() {
                let relay_router = relay_routers.lock().await.get(ingress_route.clone());
                for router_info in router_network.unwrap().into_iter() {
                    if relay_router.is_some() {
                        if router_info.id() == relay_router.unwrap() {
                            println!("Can not pipe media router data to itself");
                            continue;
                        }

                        let router = routers.lock().await.get(relay_router.clone().unwrap());
                        if router.is_some() {
                            if router.clone().unwrap().closed() {
                                println!("FROM CREATE RELAY PRODUCER");
                                println!(
                                    "Killing process, for the greater good. Source Router is closed."
                                );
                                std::process::exit(1);
                                //kill process
                            }
                        }
                        let router_clone = routers.clone();
                        let router_guard = router_clone.lock().await;
                        let current_router = router_guard.get(router_info.id());
                        let pipe_router = router_guard.get(relay_router.unwrap());
                        if pipe_router.is_none() {
                            println!("couldn't find pipe router {:?}", relay_router.unwrap());
                            return Err("couldn't find pipe router".to_string());
                        }
                        if current_router.is_none() {
                            println!("couldn't find curent router {:?}", relay_router.unwrap());
                            return Err("couldn't find curent router".to_string());
                        }
                        if current_router.clone().unwrap().closed() {
                            println!("FROM CREATE EVENT RELAY PRODUCER");
                            println!(
                                "Killing process, for the greater good. Source Router is closed."
                            );
                            std::process::exit(1);
                            //kill process
                        }
                        let pipe_option = PipeToRouterOptions::new(current_router.unwrap().clone());
                        pipe_router
                            .unwrap()
                            .pipe_data_producer_to_router(relay_producer.id(), pipe_option)
                            .await
                            .map_err(|error| {
                                format!("Failed to Pipe to router transport: {}", error)
                            })?;
                    }
                }
            }
            // prepare to send information back to the client
            if label == "FrameEvents" {
                event_producers.with(|ep| ep.create(peer_id, relay_producer.clone()));
                let mut data_producer_create = data_producers.lock().await;
                data_producer_create.insert(relay_producer.id(), relay_producer.clone());
                let reply_message = ResponseMessage::OutgoingServer {
                    node: get_nodeid(config.ingress, config.egress),
                    message: MessageResponse::createdRelayProducer {
                        data: CreatedRelayProducerData {
                            peerId: peer_id,
                            id: None,
                            kind: None,
                            dataProducerId: Some(relay_producer.id()),
                            label: Some(relay_producer.label().to_string()),
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
                if let Err(e) = sender.send(reply_message).await {
                    error!("sending error: {:?}", e);
                };
            } else if label == "AvatarMovement" {
                movement_producers.with(|mp| mp.create(peer_id, relay_producer.clone()));
                let mut data_producer_create = data_producers.lock().await;
                data_producer_create.insert(relay_producer.id(), relay_producer.clone());
                let reply_message = ResponseMessage::OutgoingServer {
                    node: get_nodeid(config.ingress, config.egress),
                    message: MessageResponse::createdRelayProducer {
                        data: CreatedRelayProducerData {
                            peerId: peer_id,
                            id: None,
                            kind: None,
                            dataProducerId: Some(relay_producer.id()),
                            label: Some(relay_producer.label().to_string()),
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
                if let Err(e) = sender.send(reply_message).await {
                    error!("sending error: {:?}", e);
                };
            } else {
                error!("strange data channel label was passed in return here");
                return Err(String::from("no labels match"));
            }
            // prepare to send back to client
            Ok(())
        } else {
            return Err(String::from("error creating event data relay producer!"));
        }
    }
}
