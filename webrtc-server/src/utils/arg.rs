use clap::Parser;

#[derive(Parser, Debug)]
#[clap(author, version, about, long_about = None)]
pub struct Args {
    #[clap(short, long)]
    pub url: String,
    #[clap(short, long)]
    pub traverse_nat: String,
    #[clap(short, long)]
    pub announceip: String,
    #[clap(short, long)]
    pub ingress: String,
    #[clap(short, long)]
    pub egress: String,
    #[clap(short, long)]
    pub workers: i32,
    #[clap(short, long)]
    pub region: String,
    #[clap(short, long)]
    pub port_transport: u16,
}
