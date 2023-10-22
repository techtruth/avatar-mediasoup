use log::info;
use mediasoup::{
    data_structures::Protocol,
    prelude::ListenIp,
    webrtc_server::{WebRtcServerListenInfo, WebRtcServerListenInfos, WebRtcServerOptions},
    worker::{WorkerLogLevel, WorkerLogTag, WorkerSettings},
    worker_manager::WorkerManager,
};
use std::sync::{mpsc, Arc};
use tokio::sync::{Mutex, RwLock};

use crate::{
    config::config::Config,
    models::sfu::{TempWorker, WebrtcServers, WorkerLoad, Workers},
    utils::utils::get_now_ms,
};

pub async fn create_worker(
    workers: Arc<RwLock<Workers>>,
    webrtc_server: Arc<RwLock<WebrtcServers>>,
    num_workers: Option<i32>,
    config: Config,
) -> Result<(), String> {
    let _temp_load = Arc::new(Mutex::new(TempWorker::new()));
    let (tx, rx) = mpsc::sync_channel::<u32>(128);
    let callback = Arc::new(move || {
        let _ = tx.send(00);
    });
    if num_workers.is_none() {
        return Err("cannot find number of workers set in the server".to_string());
    }
    for n in 0..num_workers.unwrap() {
        let port = Some(config.webrtc_port + n as u16);
        let worker_manager = WorkerManager::new();
        let worker = worker_manager
            .create_worker({
                let mut settings = WorkerSettings::default();
                settings.log_level = WorkerLogLevel::default();
                settings.log_tags = vec![
                    WorkerLogTag::Info,
                    WorkerLogTag::Ice,
                    WorkerLogTag::Dtls,
                    WorkerLogTag::Rtp,
                    WorkerLogTag::Srtp,
                    WorkerLogTag::Rtcp,
                    WorkerLogTag::Rtx,
                    WorkerLogTag::Bwe,
                    WorkerLogTag::Score,
                    WorkerLogTag::Simulcast,
                    WorkerLogTag::Svc,
                    WorkerLogTag::Sctp,
                    WorkerLogTag::Message,
                ];
                settings.thread_initializer = Some(callback.clone());
                settings
            })
            .await
            .map_err(|error| format!("Failed to create worker: {}", error))?;
        worker
            .on_dead(|e| {
                println!("worker had dead here is the error: {:?}", e.unwrap_err());
                std::process::exit(1);
            })
            .detach();
        match rx.try_recv() {
            Ok(thread_id) => {
                let pid = std::process::id();
                let worker_load = WorkerLoad {
                    worker_id: worker.id(),
                    pid,
                    thread_id,
                    wall: get_now_ms(),
                    cpu: 0.0,
                };
                info!("workload: {:?}", worker_load);
            }
            Err(_) => {}
        }
        let listen_udp = if config.traversenat == "true" {
            WebRtcServerListenInfo {
                protocol: Protocol::Udp,
                listen_ip: ListenIp {
                    ip: "0.0.0.0".parse().unwrap(),
                    announced_ip: Some(config.announceip),
                },
                port,
            }
        } else {
            WebRtcServerListenInfo {
                protocol: Protocol::Udp,
                listen_ip: ListenIp {
                    ip: local_ipaddress::get().unwrap().parse().unwrap(),
                    announced_ip: None,
                },
                port,
            }
        };
        let listen_tcp = if config.traversenat == "true" {
            WebRtcServerListenInfo {
                protocol: Protocol::Tcp,
                listen_ip: ListenIp {
                    ip: "0.0.0.0".parse().unwrap(),
                    announced_ip: Some(config.announceip),
                },
                port,
            }
        } else {
            WebRtcServerListenInfo {
                protocol: Protocol::Tcp,
                listen_ip: ListenIp {
                    ip: local_ipaddress::get().unwrap().parse().unwrap(),
                    announced_ip: None,
                },
                port,
            }
        };
        let listen_infos = WebRtcServerListenInfos::new(listen_udp);
        let listen_infos = listen_infos.insert(listen_tcp);
        let webrtc_server_options = WebRtcServerOptions::new(listen_infos);
        let mut webrtc_server = webrtc_server.write().await;
        match worker.create_webrtc_server(webrtc_server_options).await {
            Ok(w) => webrtc_server.create(worker.id(), w),
            Err(_) => println!("error creating worker"),
        }
        let mut workers = workers.write().await;
        workers.create(worker);
    }
    Ok(())
}
