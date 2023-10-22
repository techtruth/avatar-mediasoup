use std::{net::IpAddr, str::FromStr};

use uuid::Uuid;

use crate::{
    models::sfu::RegionResponse,
    utils::{self, codec::ResponseMessage},
};

pub async fn register_server(
    mode_check: Option<Uuid>,
    _annouced_ip: IpAddr,
    node_id: Option<Uuid>,
    region: String,
) -> Result<RegionResponse, String> {
    let mode = match mode_check {
        Some(_) => "ingress",
        None => "egress",
    };
    println!("mode: {}", &mode);
    let _is_local = IpAddr::from_str("127.0.0.1").unwrap();
    //if annouced_ip.unwrap() != is_local {

    let msg = ResponseMessage::OutgoingServer {
        node: node_id,
        message: utils::codec::MessageResponse::registerMediaServer {
            mode: mode.to_string(),
            region: region.clone(),
        },
    };
    let resp = RegionResponse {
        message: msg,
        region,
    };
    Ok(resp)
    //}
}
