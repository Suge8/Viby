use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::process::{Child, Command, Stdio};

use crate::snapshot::{is_pid_running, stop_managed_hub};
use crate::state::ManagedHubState;

const PORT_HOLDER_ENV: &str = "VIBY_DESKTOP_TEST_PORT_HOLDER";
const PORT_HOLDER_TEST: &str = "snapshot::tests::lifecycle_smoke_tests::port_holder_child";

fn reserve_local_port() -> u16 {
    let listener = TcpListener::bind(("127.0.0.1", 0)).expect("test port should bind");
    listener
        .local_addr()
        .expect("local address should read")
        .port()
}

fn spawn_port_holder(port: u16) -> Child {
    let mut child = Command::new(std::env::current_exe().expect("test exe should resolve"))
        .args(["--exact", PORT_HOLDER_TEST, "--nocapture"])
        .env(PORT_HOLDER_ENV, port.to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .expect("port holder should spawn");
    wait_for_ready_line(&mut child);
    child
}

fn wait_for_ready_line(child: &mut Child) {
    let stdout = child.stdout.take().expect("port holder stdout should pipe");
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    loop {
        line.clear();
        let bytes = reader
            .read_line(&mut line)
            .expect("port holder stdout should read");
        assert!(bytes > 0, "port holder exited before ready");
        if line.trim() == "ready" {
            return;
        }
    }
}

fn kill_child_if_running(child: &mut Child) {
    if child.try_wait().ok().flatten().is_none() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

#[test]
fn port_holder_child() {
    let Ok(port) = std::env::var(PORT_HOLDER_ENV) else {
        return;
    };
    let _listener =
        TcpListener::bind(("127.0.0.1", port.parse::<u16>().expect("port should parse")))
            .expect("port holder should bind");
    println!("ready");
    std::io::stdout().flush().expect("ready line should flush");
    loop {
        std::thread::park();
    }
}

#[test]
fn stop_managed_hub_releases_owned_child_port() {
    let port = reserve_local_port();
    let mut child = spawn_port_holder(port);
    let pid = child.id();
    let mut process = ManagedHubState {
        managed_pid: Some(pid),
        last_error: None,
        last_snapshot: None,
    };

    stop_managed_hub(&mut process, None).expect("stop should succeed");
    let _ = child.wait();

    assert!(!is_pid_running(pid));
    TcpListener::bind(("127.0.0.1", port)).expect("owned child port should be released after quit");
    kill_child_if_running(&mut child);
}
