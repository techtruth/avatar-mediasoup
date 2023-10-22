use crate::{
    config::config::Config,
    handlers::{
        audio_consumer::consume_audio, connect_ingress_egress::connect_webrtc,
        data_relay_producer::create_relay_datachannel_producer, egress::create_webrtc_egress,
        event_consumer::consume_event, event_producer::create_event_data_producer,
        ingress::create_webrtc_ingress, media_producer::create_media_producer,
        movement_consumer::consume_movement, movement_producer::create_movement_data_producer,
        pendingrelays::store_pipe_relay, relay_connect::connect_pipe_relay,
        relay_egress::create_egress_relay, relay_producer::create_relay_producer,
        router::create_router_group, video_consumer::consume_video,
    },
    utils::codec::{
        MessageRequest, MessageResponse, ProducerReplyMuteData, RequestMessage, ResponseMessage,
        RestartedIceData,
    },
};
use mediasoup::transport::Transport;
use tokio::sync::mpsc::Sender;

use log::{debug, error, info};

use super::models::MediaServer;

pub async fn handle_request_message(
    msg: RequestMessage,
    media_server: MediaServer,
    config: Config,
    sender: Sender<ResponseMessage>,
) {
    println!("Received netsocket message: {:?}", &msg);

    match msg {
        RequestMessage::Incoming { wsid, message } => match message {
            MessageRequest::createRouterGroup { data } => {
                let media_server = media_server.clone(); // Clone for shared ownership
                let config = config.clone(); // Assume Config implements Clone
                tokio::spawn(async move {
                    let room_routers = media_server.roomRouters.clone();
                    let workers = media_server.workers.clone();
                    let routers = media_server.routers.clone();
                    let routers2workers = media_server.routers2workers.clone();

                    let response = create_router_group(
                        data.room.clone(),
                        wsid,
                        config.ingress,
                        config.egress,
                        room_routers,
                        workers,
                        routers,
                        routers2workers,
                        sender.clone(),
                    )
                    .await;

                    match response {
                        Ok(_) => {
                            info!("@@ Successfully created room: {:?}", &data.room);
                        }
                        Err(e) => {
                            // Handle or log error
                            error!("Error: {}", e);
                        }
                    }
                });
            }
            MessageRequest::createWebRTCIngress { data } => {
                tokio::spawn(async move {
                    match create_webrtc_ingress(
                        media_server.ingress.clone(),
                        media_server.endpoints.clone(),
                        media_server.transports.clone(),
                        media_server.pipetransports.clone(),
                        media_server.relays.clone(),
                        media_server.transport2router.clone(),
                        media_server.webrtc_server.clone(),
                        media_server.routers.clone(),
                        media_server.roomRouters.clone(),
                        media_server.routers2workers.clone(),
                        media_server.loads.clone(),
                        data.sctpOptions,
                        data.routerNetwork,
                        wsid,
                        data.routerPipes,
                        data.peerId,
                        media_server.config.clone(),
                        sender.clone(),
                    )
                    .await
                    {
                        Ok(e) => {
                            println!("ingress created: {:?}", e)
                        }
                        Err(e) => {
                            error!("failed to create ingress: {:?}", e)
                        }
                    }
                });
            }
            MessageRequest::createWebRTCEgress { data } => {
                tokio::spawn(async move {
                    match create_webrtc_egress(
                        media_server.routers.clone(),
                        media_server.roomRouters.clone(),
                        media_server.routers2workers.clone(),
                        media_server.webrtc_server.clone(),
                        media_server.transports.clone(),
                        media_server.endpoints.clone(),
                        media_server.transport2router.clone(),
                        media_server.loads.clone(),
                        data.sctpOptions,
                        data.routerNetwork,
                        wsid,
                        data.peerId,
                        media_server.egress.clone(),
                        sender.clone(),
                    )
                    .await
                    {
                        Ok(_) => {
                            info!("egress has been created!")
                        }
                        Err(e) => error!("error creating egress!!: {:?}", e),
                    }
                });
            }
            MessageRequest::connectWebRTCIngress { data } => {
                tokio::spawn(async move {
                    match connect_webrtc(
                        wsid,
                        data.peerId,
                        data.dtlsParameters,
                        true,
                        media_server.transports.clone(),
                        sender.clone(),
                    )
                    .await
                    {
                        Ok(_) => info!("connected webrtc ingress transport"),
                        Err(_) => error!("error to connect webrtc ingress transprot"),
                    }
                });
            }
            MessageRequest::connectWebRTCEgress { data } => {
                tokio::spawn(async move {
                    match connect_webrtc(
                        wsid,
                        data.peerId,
                        data.dtlsParameters,
                        false,
                        media_server.transports.clone(),
                        sender.clone(),
                    )
                    .await
                    {
                        Ok(_) => info!("connected webrtc egress transport"),
                        Err(_) => error!("error to connect webrtc ingress transprot"),
                    }
                });
            }
            MessageRequest::createMediaProducer { data } => {
                tokio::spawn(async move {
                    match create_media_producer(
                        media_server.transports.clone(),
                        media_server.transport2router.clone(),
                        media_server.audioProducers.clone(),
                        media_server.videoProducers.clone(),
                        media_server.pipetransports.clone(),
                        media_server.relays.clone(),
                        media_server.producers.clone(),
                        media_server.consumers.clone(),
                        media_server.config.clone(),
                        data.egress.clone(),
                        data.producerOptions,
                        data.peerId,
                        wsid,
                        data.routerNetwork,
                        data.rtpCapabilities,
                        sender.clone(),
                    )
                    .await
                    {
                        Ok(_) => {
                            info!("Successfully created media")
                        }
                        Err(_) => error!("Failed created media"),
                    }
                });
            }
            MessageRequest::createEventProducer { data } => {
                tokio::spawn(async move {
                    match create_event_data_producer(
                        wsid,
                        data.routerNetwork,
                        data.peerId,
                        data.egress,
                        data.producerOptions,
                        media_server.transports.clone(),
                        media_server.eventProducers.clone(),
                        media_server.transport2router.clone(),
                        media_server.pipetransports.clone(),
                        media_server.relays.clone(),
                        media_server.endpoints.clone(),
                        media_server.peerdataconsumed.clone(),
                        media_server.data_producers.clone(),
                        media_server.data_consumer.clone(),
                        media_server.config.clone(),
                        sender.clone(),
                    )
                    .await
                    {
                        Ok(_) => info!("Successfully created data producer"),
                        Err(_) => info!("failed created data producer"),
                    }
                });
            }
            MessageRequest::createDataProducer { data } => {
                tokio::spawn(async move {
                    match create_movement_data_producer(
                        wsid,
                        data.routerNetwork,
                        data.peerId,
                        data.egress,
                        data.producerOptions,
                        media_server.transports.clone(),
                        media_server.movementProducers.clone(),
                        media_server.transport2router.clone(),
                        media_server.pipetransports.clone(),
                        media_server.relays.clone(),
                        media_server.endpoints.clone(),
                        media_server.peermovementconsumed.clone(),
                        media_server.data_producers.clone(),
                        media_server.data_consumer.clone(),
                        media_server.config.clone(),
                        sender.clone(),
                    )
                    .await
                    {
                        Ok(_) => info!("Successfully created movement producer"),
                        Err(_) => info!("failed created movement producer"),
                    }
                });
            }
            MessageRequest::consumeAudio { data } => {
                tokio::spawn(async move {
                    let consume_audio = consume_audio(
                        wsid,
                        data.consumerPeer,
                        data.producerPeer.clone(),
                        data.rtpCaps,
                        media_server.audioProducers.clone(),
                        media_server.peeraudioconsumed,
                        media_server.transports.clone(),
                        media_server.transport2router.clone(),
                        media_server.routers.clone(),
                        media_server.consumers.clone(),
                        sender.clone(),
                    )
                    .await;
                    if let Ok(_) = consume_audio {
                        debug!("Successfully consumed audio: {:?}", data.producerPeer);
                    } else {
                        error!("error consume audio of: {:?}", data.producerPeer);
                    }
                });
            }
            MessageRequest::consumeMovement { data } => {
                tokio::spawn(async move {
                    let events_consume = consume_movement(
                        wsid,
                        data.producerPeer,
                        data.consumerPeer,
                        media_server.transports.clone(),
                        media_server.movementProducers.clone(),
                        media_server.peermovementconsumed.clone(),
                        media_server.data_consumer.clone(),
                        sender.clone(),
                    )
                    .await;
                    if let Ok(_) = events_consume {
                        debug!("Successfully consumed movement");
                    } else {
                        error!("failed to consume movement")
                    }
                });
            }
            MessageRequest::consumeEvents { data } => {
                tokio::spawn(async move {
                    let events_consume = consume_event(
                        wsid,
                        data.producerPeer,
                        data.consumerPeer,
                        media_server.transports.clone(),
                        media_server.eventProducers.clone(),
                        media_server.peerdataconsumed.clone(),
                        media_server.data_consumer.clone(),
                        sender.clone(),
                    )
                    .await;
                    if let Ok(_) = events_consume {
                        debug!("Successfully consumed events");
                    } else {
                        error!("failed to consume event")
                    }
                });
            }
            MessageRequest::consumeVideo { data } => {
                tokio::spawn(async move {
                    let video_consumer = consume_video(
                        wsid,
                        data.consumerPeer,
                        data.producerPeer,
                        data.rtpCaps,
                        media_server.videoProducers.clone(),
                        media_server.peerconsumed.clone(),
                        media_server.transports.clone(),
                        media_server.transport2router.clone(),
                        media_server.routers.clone(),
                        media_server.consumers.clone(),
                        sender.clone(),
                    )
                    .await;
                    if let Ok(_) = video_consumer {
                        debug!("video consumer Successfully");
                    } else {
                        error!("video consumer failed");
                    }
                });
            }
            MessageRequest::disconnectTransport { data } => {
                tokio::spawn(async move {
                    let peer_id = data.peerId;
                    let mut producers = media_server.producers.lock().await;
                    let mut consumers = media_server.consumers.lock().await;
                    let mut audio_producers = media_server.audioProducers.lock().await;
                    let mut data_consumer = media_server.data_consumer.lock().await;
                    let mut data_producers = media_server.data_producers.lock().await;
                    if let Some(producer) = audio_producers.get(peer_id) {
                        for p in producer.into_iter() {
                            producers.remove(&p.id());
                        }
                        audio_producers.remove(peer_id);
                    }
                    let mut video_producers = media_server.videoProducers.lock().await;
                    if let Some(video_producer) = video_producers.get(peer_id) {
                        for vp in video_producer.into_iter() {
                            producers.remove(&vp.id());
                        }
                        video_producers.remove(peer_id);
                    }

                    let movement_producers = media_server.movementProducers.with(|mp| mp.clone());
                    if let Some(movement_producer) = movement_producers.get(peer_id) {
                        data_producers.remove(&movement_producer.id());
                        media_server.movementProducers.with(|mp| mp.remove(peer_id));
                    }

                    let event_producers = media_server.eventProducers.with(|ep| ep.clone());
                    if let Some(data_producer) = event_producers.get(peer_id) {
                        data_producers.remove(&data_producer.id());
                        media_server.eventProducers.with(|ep| ep.remove(peer_id));
                    }

                    let mut video_consumer = media_server.peerconsumed.lock().await;
                    if video_consumer.get(peer_id).len() > 0 {
                        for v in video_consumer.get(peer_id).into_iter() {
                            consumers.remove(&v.consumer_id);
                        }
                        video_consumer.remove(peer_id);
                    }

                    let mut audio_consumer = media_server.peeraudioconsumed.lock().await;
                    if audio_consumer.get(peer_id).len() > 0 {
                        for a in audio_consumer.get(peer_id).into_iter() {
                            consumers.remove(&a.consumer_id);
                        }
                        audio_consumer.remove(peer_id);
                    }

                    let mut movement_consumer = media_server.peermovementconsumed.lock().await;
                    if movement_consumer.get(peer_id).len() > 0 {
                        for m in movement_consumer.get(peer_id).into_iter() {
                            data_consumer.remove(&m.consumer_id);
                        }

                        movement_consumer.remove(peer_id);
                    }

                    let mut event_consumer = media_server.peerdataconsumed.lock().await;
                    if event_consumer.get(peer_id).len() > 0 {
                        for e in event_consumer.get(peer_id).into_iter() {
                            data_consumer.remove(&e.consumer_id);
                        }

                        event_consumer.remove(peer_id);
                    }

                    {
                        let transport_clone =
                            media_server.transports.with(|inner| inner.get(peer_id));
                        if let Some(transport) = transport_clone {
                            let worker_guard = media_server
                                .transport2router
                                .read()
                                .await
                                .get(transport.id())
                                .clone();
                            if let Some(router) = worker_guard {
                                let worker_guard = media_server
                                    .routers2workers
                                    .lock()
                                    .await
                                    .get(router)
                                    .clone();
                                if let Some(worker) = worker_guard {
                                    let mut loads_guard = media_server.loads.lock().await;
                                    loads_guard.remove(worker, router);
                                }
                            }
                        }
                    }
                    media_server.transports.with(|inner| inner.remove(peer_id));
                });
            }
            MessageRequest::destroyRouterGroup { data } => {
                tokio::spawn(async move {
                    info!("destorying room router {:?}", &data.room);
                    let room_name = data.room;
                    let mut room_router = media_server.roomRouters.lock().await;
                    if room_router.get(room_name.clone()).is_none() {
                        return;
                    }

                    let mut pending_relay_guard = media_server.pendingRelays.lock().await;
                    let mut relays_guard = media_server.relays.lock().await;
                    let pipetransports_guard = media_server.pipetransports.with(|p| p.clone());
                    let mut relay_routers_guard = media_server.relayRouters.lock().await;
                    let mut routers2workers_guard = media_server.routers2workers.lock().await;
                    let mut loads_guard = media_server.loads.lock().await;
                    let mut routers_guard = media_server.routers.lock().await;
                    for router in room_router.get(room_name.clone()).unwrap().into_iter() {
                        // egress cleaning up
                        {
                            let get_relay_router = relay_routers_guard.get_by_egress(router.id());
                            if get_relay_router.is_some() {
                                relay_routers_guard.delete(get_relay_router.unwrap());
                                pending_relay_guard.delete(get_relay_router.unwrap());
                                let get_pipetransport =
                                    relays_guard.get_router(get_relay_router.unwrap());
                                if !get_pipetransport.is_empty() {
                                    media_server
                                        .pipetransports
                                        .with(|p| p.delete(get_pipetransport[0].transport));
                                }

                                relays_guard.delete(get_relay_router.unwrap());
                            }
                        }
                        // ingress cleaning up
                        {
                            let get_relays = relays_guard.get_router(router.id());
                            if !get_relays.is_empty() {
                                let get_pipetransport =
                                    pipetransports_guard.get(get_relays[0].transport);
                                if get_pipetransport.is_some() {
                                    media_server
                                        .pipetransports
                                        .with(|p| p.delete(get_relays[0].transport));
                                }
                                relay_routers_guard.delete(get_relays[0].router);
                                relays_guard.delete(get_relays[0].router);
                            }
                        }
                        // pipe relay clean up
                        // remove rotuer2workers
                        {
                            if let Some(worker) = routers2workers_guard.get(router.id()) {
                                routers2workers_guard.delete(router.id());
                                loads_guard.remove(worker, router.id());
                            }
                            routers_guard.remove(router.id());
                        }
                    }
                    // deep clean up
                    {
                        if let Some(pipe_transport) = media_server
                            .pipetransports
                            .with(|p| p.get_by_room(room_name.clone()))
                        {
                            for pipe in pipe_transport.into_iter() {
                                println!("deep clean pipe Transports: {:?}", &pipe);
                                media_server
                                    .pipetransports
                                    .with(|p| p.delete(pipe.transport_id));
                            }
                        }
                        if let Some(relay) = relays_guard.get_by_room(room_name.clone()) {
                            for r in relay.into_iter() {
                                relays_guard.delete(r.router);
                            }
                        }
                    }
                    println!("pipe transports guard {:?}", &pipetransports_guard);
                    let pipes_log = media_server.pipetransports.with(|p| p.clone());
                    println!("with pipe transports: {:?}", pipes_log);
                    {
                        room_router.remove(room_name);
                    }
                });
            }
            MessageRequest::consumerPause { data } => {
                tokio::spawn(async move {
                    let consumer_guard = media_server.consumers.lock().await;
                    let consumer = consumer_guard.get(&data.consumerId);
                    if consumer.is_none() {
                        println!(
                            "cannot find consumer on this server: {:?}",
                            &data.consumerId
                        );
                        return;
                    }
                    let _ = consumer.unwrap().pause().await;
                    println!("mute consumer: {:?}", &data.consumerId);
                });
            }
            MessageRequest::consumerResume { data } => {
                tokio::spawn(async move {
                    let consumer_guard = media_server.consumers.lock().await;
                    let consumer = consumer_guard.get(&data.consumerId);
                    if consumer.is_none() {
                        println!(
                            "cannot find consumer on this server: {:?}",
                            &data.consumerId
                        );
                        return;
                    }
                    let _ = consumer.unwrap().resume().await;
                    println!("unmute consumer: {:?}", &data.consumerId);
                });
            }
            MessageRequest::producerPause { data } => {
                tokio::spawn(async move {
                    let producer_guard = media_server.audioProducers.lock().await;
                    let producer = producer_guard.get_producer(data.peerId, data.producerId);

                    if producer.is_none() {
                        println!("cannot find producer");
                        return;
                    };
                    let producer = producer.unwrap();
                    if data.mediaType == "audio" {
                        if !producer.paused() {
                            println!("paused");
                            let _ = producer.pause().await;
                        }
                    } else if data.mediaType == "video" {
                        if !producer.paused() {
                            let _ = producer.pause().await;
                        }
                    } else {
                        println!("media type error or not passed in");
                    }
                    let message = ResponseMessage::OutgoingCommunication {
                        ws: Some(wsid),
                        communication: MessageResponse::producerPaused {
                            data: ProducerReplyMuteData {
                                peerId: data.peerId,
                                producerId: data.producerId,
                                mediaType: data.mediaType,
                                paused: true,
                            },
                        },
                    };
                    if let Err(e) = sender.send(message).await {
                        error!("error sending message: {:?}", e);
                    };
                });
            }
            MessageRequest::producerResume { data } => {
                tokio::spawn(async move {
                    let audio_proudcer_guard = media_server.audioProducers.lock().await;
                    let producer = audio_proudcer_guard.get_producer(data.peerId, data.producerId);

                    if producer.is_none() {
                        println!("cannot find producer");
                        return;
                    };
                    let producer = producer.unwrap();
                    if data.mediaType == "audio" {
                        if producer.paused() {
                            println!("un paused");
                            let _ = producer.resume().await;
                        }
                    } else if data.mediaType == "video" {
                        if producer.paused() {
                            let _ = producer.resume().await;
                        }
                    } else {
                        println!("media type error or not passed in");
                    }
                    let message = ResponseMessage::OutgoingCommunication {
                        ws: Some(wsid),
                        communication: MessageResponse::producerResume {
                            data: ProducerReplyMuteData {
                                peerId: data.peerId,
                                producerId: data.producerId,
                                mediaType: data.mediaType,
                                paused: true,
                            },
                        },
                    };
                    if let Err(e) = sender.send(message).await {
                        error!("error sending message: {:?}", e);
                    };
                });
            }
            MessageRequest::producerClose { data } => {
                tokio::spawn(async move {
                    let peer_id = data.peerId;
                    let producer_id = data.producerId;
                    let media_type = data.mediaType;
                    let mut video_producers_guard = media_server.videoProducers.lock().await;
                    match media_type.as_str() {
                        "screenVideo" | "webCam" => {
                            video_producers_guard.remove_producer(peer_id, producer_id);
                        }
                        "audio" | "screenAudio" => {
                            video_producers_guard.remove_producer(peer_id, producer_id);
                        }
                        _ => println!("none found!"),
                    }
                });
            }
            MessageRequest::restartIce { data } => {
                let transport = media_server.transports.with(|inner| inner.get(data.peerId));

                if transport.is_none() {
                    println!("Cannot find transport {:?} for restartIce", data.peerId);
                    return;
                }

                let transport = transport.unwrap();
                if transport.id() != data.transportId {
                    println!("Found transport {:?} but it does not match the transportId {:?} for restartIce", transport.id(), data.transportId);
                    return;
                }

                match transport.restart_ice().await {
                    Ok(ice_parameters) => {
                        let message = ResponseMessage::OutgoingCommunication {
                            ws: Some(wsid),
                            communication: MessageResponse::restartedIce {
                                data: RestartedIceData {
                                    transportId: data.transportId,
                                    iceParameters: ice_parameters.clone(),
                                },
                            },
                        };
                        if let Err(e) = sender.send(message).await {
                            error!("error sending message: {:?}", e);
                        };
                        println!(
                            "Sending iceParameters for restartIce to {:?}",
                            data.transportId
                        );
                    }
                    Err(error) => {
                        print!(
                            "Error restarting ICE for {:?}: {:?}",
                            data.transportId, error
                        )
                    }
                }
            }
            _ => error!("\n nothing matched: {:?}", &message),
        },
        RequestMessage::IncomingServer {
            node: _,
            wsid: _,
            message,
        } => match message {
            MessageRequest::storePipeRelay { data } => {
                tokio::spawn(async move {
                    match store_pipe_relay(
                        media_server.pendingRelays.clone(),
                        data.ingressRoute,
                        data.ip,
                        data.port,
                        data.srtp,
                    )
                    .await
                    {
                        Ok(_) => debug!("Successfully stored pipRelay"),
                        Err(_) => debug!("failed stored pipRelay"),
                    }
                });
            }
            MessageRequest::createRelayProducer { data } => {
                tokio::spawn(async move {
                    let media_type = data.mediaType;
                    let rtp_parameters = data.rtpParameters.clone();
                    if media_type.is_none() {
                        println!("media type was not supply by client side");
                    }
                    if rtp_parameters.is_none() {
                        println!("rtp_parameters was not supply by client side");
                    }
                    let new_egress_relay = create_egress_relay(
                        data.groupId.clone(),
                        data.ingressRoute.clone(),
                        media_server.relays.clone(),
                        media_server.routers.clone(),
                        media_server.roomRouters.clone(),
                        media_server.routers2workers.clone(),
                        media_server.relayRouters.clone(),
                        media_server.pipetransports.clone(),
                        media_server.pendingRelays.clone(),
                        media_server.loads.clone(),
                        config.clone(),
                        sender.clone(),
                    )
                    .await;
                    if let Ok(_) = new_egress_relay {
                        if data.producerId.is_some() {
                            let producer_id = data.producerId.unwrap();
                            let producer_relay = create_relay_producer(
                                data.peerId,
                                data.ingressRoute,
                                producer_id,
                                data.groupId,
                                data.mediaType.unwrap(),
                                data.rtpParameters.unwrap(),
                                data.appData,
                                media_server.relays.clone(),
                                media_server.pipetransports.clone(),
                                media_server.roomRouters.clone(),
                                media_server.relayRouters.clone(),
                                media_server.routers.clone(),
                                media_server.audioProducers.clone(),
                                media_server.videoProducers.clone(),
                                config.clone(),
                                media_server.producers.clone(),
                                sender.clone(),
                            )
                            .await;
                            if let Ok(_) = producer_relay {
                                debug!("created producer relay for: {:?}", data.peerId);
                            } else {
                                error!(
                                    "failed to create producer relay: {:?} {:?}",
                                    data.peerId,
                                    producer_relay.err()
                                );
                            }
                        } else if data.dataProducerId.is_some() {
                            let data_producerid = data.dataProducerId.clone();
                            let label = data.label.clone();
                            let sctp_stream_parameters = data.sctpStreamParameters.clone();
                            if label.is_none() {
                                println!("data label was not supply by client side");
                                return;
                            }
                            if data_producerid.is_none() {
                                println!("data producerId was not supply by client side");
                                return;
                            }
                            if sctp_stream_parameters.is_none() {
                                println!("sctpStreamParameters was not supply by client side");
                            }
                            let produce_data_relay = create_relay_datachannel_producer(
                                data.ingressRoute,
                                data.groupId,
                                data_producerid.unwrap(),
                                data.peerId,
                                label.unwrap(),
                                sctp_stream_parameters.unwrap(),
                                data.appData,
                                media_server.routers.clone(),
                                media_server.roomRouters.clone(),
                                media_server.relays.clone(),
                                media_server.pipetransports.clone(),
                                media_server.eventProducers.clone(),
                                media_server.movementProducers.clone(),
                                media_server.relayRouters.clone(),
                                media_server.data_producers.clone(),
                                config.clone(),
                                sender.clone(),
                            )
                            .await;
                            if let Ok(_) = produce_data_relay {
                                debug!("data producer relay created Successfully");
                            } else {
                                error!(
                                    "failed to create data producer relay: {:?} {:?}",
                                    data.peerId,
                                    produce_data_relay.err()
                                );
                            }
                        }
                    } else {
                        error!("created relay does not have producerId or dataProducerId");
                    }
                });
            }
            MessageRequest::connectPipeRelay { data } => {
                tokio::spawn(async move {
                    let connect_relay = connect_pipe_relay(
                        data.ingressRoute,
                        data.egress,
                        data.ip,
                        data.port,
                        data.srtp,
                        media_server.pipetransports.clone(),
                        media_server.relays.clone(),
                    )
                    .await;
                    if let Ok(_) = connect_relay {
                        debug!("connect pip relay Successfully");
                    } else {
                        error!("failed to connect pip relay");
                    }
                });
            }
            _ => error!("\n nothing matched: {:?}", &message),
        },
    }
}
