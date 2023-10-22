use futures::{future::poll_fn, ready, sink::Sink, stream::StreamExt};
use log::error;
use std::{collections::VecDeque, pin::Pin, task::Poll, time::Duration};
use tokio::{
    net::TcpStream,
    pin, select,
    time::{sleep, Instant},
};
use tokio_util::codec::{FramedRead, FramedWrite};

use crate::{
    config::config::Config,
    handlers::{cpu_load::get_media_loads, worker::create_worker},
    server::{message_handle::handle_request_message, register_server::register_server},
    utils::{
        codec::{self, MessageResponse, ResponseMessage},
        utils::{get_nodeid, Error},
    },
};

use super::models::MediaServer;

pub async fn handle_stream(
    mut stream: TcpStream,
    media_server: MediaServer,
    config: Config,
) -> Result<(), Error> {
    stream.set_nodelay(true)?;
    let (read, write) = stream.split();
    let mut read = FramedRead::new(read, codec::ServerCodec::default());
    let mut write = FramedWrite::new(write, codec::ServerCodec::default());

    let mut queue_write = QueuedWrite::new(&mut write);
    let (tx, mut rx) = tokio::sync::mpsc::channel::<ResponseMessage>(128);
    let timer = sleep(Duration::from_secs(10));
    pin!(timer);
    // create workers
    let workers = media_server.workers.clone();
    let webrtc_server = media_server.webrtc_server.clone();
    let num_workers = media_server.num_workers;
    let _ = create_worker(workers, webrtc_server, num_workers, config.clone()).await;
    // send register server
    let node_id = get_nodeid(config.ingress, config.egress);
    let register_server = register_server(
        config.ingress,
        config.announceip,
        node_id,
        config.clone().region,
    )
    .await;
    if register_server.is_ok() {
        queue_write.push(register_server.unwrap().message);
        let load = match get_media_loads() {
            Ok(load) => load,
            Err(_) => 0.0,
        };
        let mode = match config.clone().ingress {
            Some(_) => "ingress",
            None => "egress",
        };
        let server_id = get_nodeid(config.clone().ingress, config.clone().egress);
        let response = ResponseMessage::OutgoingServer {
            node: server_id,
            message: MessageResponse::serverLoad {
                mode: mode.to_string(),
                region: config.clone().region,
                load,
            },
        };
        queue_write.push(response);
    }
    loop {
        let media_data = media_server.clone();
        select! {
                opt = read.next() => {
                match opt {
                Some(res) => {
                    match res {
                        Ok(msg) => {
                            // Call the handle_request_message function
                    let _ = handle_request_message(msg, media_data, config.clone(), tx.clone()).await;
                        },
                        Err(e) => {
                            error!("error from request message: {:?}", e);
                        },
                    }

                    },
                None => return Ok(()),
                }
            },
            opt = rx.recv() => {
                match opt {
                    Some(res) => {
                    let msg: ResponseMessage = res;
                    queue_write.push(msg);
                },
                None => return Ok(())
                }
            },
            res = queue_write.try_write() => res?,
            _ = timer.as_mut() => {
                // check for keep alive state.
                // send heart beat message send back to signaling of the serverload.
                let load = match get_media_loads() {
                    Ok(load) => load,
                    Err(_) => 0.0
                };
                let mode = match config.clone().ingress {
                    Some(_) => "ingress",
                    None => "egress",
                };
                let server_id = get_nodeid(config.clone().ingress, config.clone().egress);
                let response = ResponseMessage::OutgoingServer {
                    node: server_id,
                    message: MessageResponse::serverLoad {
                        mode: mode.to_string(),
                        region: config.clone().region,
                        load
                    },
                };
                queue_write.push(response);

                // reset timer.
                timer.as_mut().reset(Instant::now() + Duration::from_secs(2));
            }
        }
    }
}

pub struct QueuedWrite<'a, S> {
    write: Pin<&'a mut S>,
    queue: VecDeque<ResponseMessage>,
    is_flush: bool,
}

impl<'a, S> QueuedWrite<'a, S>
where
    S: Sink<ResponseMessage, Error = std::io::Error> + Unpin,
{
    pub fn new(write: &'a mut S) -> Self {
        Self {
            write: Pin::new(write),
            queue: VecDeque::new(),
            is_flush: false,
        }
    }

    // push new message to queue.
    pub fn push(&mut self, msg: ResponseMessage) {
        self.queue.push_back(msg);
    }

    fn pop(&mut self) -> ResponseMessage {
        self.queue
            .pop_front()
            .expect("WriteQueue must not be operating io write on when empty")
    }

    // try to wire message in queue to io.
    pub async fn try_write(&mut self) -> Result<(), Error> {
        loop {
            match (self.is_flush, self.queue.is_empty()) {
                (false, true) => return poll_fn(|_| Poll::Pending).await,
                (false, false) => {
                    poll_fn(|cx| {
                        ready!(self.write.as_mut().poll_ready(cx))?;
                        let msg = self.pop();
                        Poll::Ready(self.write.as_mut().start_send(msg))
                    })
                    .await?;
                    self.is_flush = true;
                }
                (true, _) => {
                    poll_fn(|cx| self.write.as_mut().poll_flush(cx)).await?;
                    self.is_flush = false;
                }
            }
        }
    }
}
