use crate::server::models::MediaServer;
use crate::server::stream::handle_stream;
use crate::utils::utils::init;
use log::{error, info};
use std::net::{SocketAddr, ToSocketAddrs};
use std::str::FromStr;
use tokio::net::TcpStream;
mod config;
mod handlers;
mod models;
mod server;
mod utils;
static mut IDX_COUNT: usize = 0;

#[tokio::main]
async fn main() {
    env_logger::init();
    let config = init();
    let media_server = MediaServer::new(config.clone());
    let addr = config
        .server_address
        .to_socket_addrs()
        .unwrap()
        .find(|addr| addr.is_ipv4())
        .unwrap_or_else(|| {
            let default = "0.0.0.0:1188";
            println!(
                "Can not resolve ipv4 address from given url. Fall back to default value: {}",
                default
            );
            SocketAddr::from_str(default).unwrap()
        });
    println!("server address: {:?}", &config.announceip);
    println!(
        "[@] Node ID: ingress: {:?} or egress: {:?}",
        &config.ingress, &config.egress
    );
    println!("[+] Successfully started");
    tokio::spawn(async move {
        loop {
            info!("Connecting to: {}", &addr);

            match TcpStream::connect(addr).await {
                Ok(stream) => {
                    match handle_stream(stream, media_server.clone(), config.clone()).await {
                        Ok(_) => {
                            error!("TCP stream disconnect Shutting down application");
                            std::process::exit(1);
                        }
                        Err(e) => {
                            error!("Tcp handle error: {:?}", e);
                            std::process::exit(1);
                        }
                    }
                }
                Err(e) => {
                    error!("Tcp connect error: {:?}", e);
                    std::process::exit(1);
                }
            }
        }
    })
    .await
    .expect("netsocket error");
}
