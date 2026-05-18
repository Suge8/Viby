import asyncio
import json
import os
import time

import websockets
from aiortc import RTCConfiguration, RTCIceServer, RTCPeerConnection, RTCSessionDescription
from aiortc.sdp import candidate_from_sdp, candidate_to_sdp


ROLE = os.environ.get("ROLE")
WS_URL = os.environ.get("WS_URL")
ICE_SERVERS = json.loads(os.environ.get("ICE_SERVERS_JSON", "[]"))
PING_COUNT = int(os.environ.get("PING_COUNT", "12"))

if ROLE != "guest":
    raise RuntimeError("aiortc endpoint currently supports ROLE=guest")
if not WS_URL:
    raise RuntimeError("WS_URL is required")


def percentile(values, ratio):
    if not values:
        return None
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int((len(ordered) - 1) * ratio))]


def ice_server(server):
    urls = server.get("urls", [])
    if isinstance(urls, str):
        urls = [urls]
    return RTCIceServer(urls=urls, username=server.get("username"), credential=server.get("credential"))


def parse_candidate(payload):
    raw = payload["candidate"]
    if raw.startswith("candidate:"):
        raw = raw[len("candidate:") :]
    candidate = candidate_from_sdp(raw)
    candidate.sdpMid = payload.get("sdpMid")
    candidate.sdpMLineIndex = payload.get("sdpMLineIndex")
    return candidate


def encode_candidate(candidate):
    return {
        "candidate": f"candidate:{candidate_to_sdp(candidate)}",
        "sdpMid": candidate.sdpMid or "0",
        "sdpMLineIndex": candidate.sdpMLineIndex if candidate.sdpMLineIndex is not None else 0,
    }


async def selected_candidate(pc):
    stats = await pc.getStats()
    selected = None
    for stat in stats.values():
        if getattr(stat, "type", None) == "candidate-pair" and getattr(stat, "state", None) == "succeeded":
            selected = stat
            if getattr(stat, "nominated", False):
                break
    local = stats.get(getattr(selected, "localCandidateId", "")) if selected else None
    remote = stats.get(getattr(selected, "remoteCandidateId", "")) if selected else None
    rtt = getattr(selected, "currentRoundTripTime", None) if selected else None
    return {
        "localCandidateType": getattr(local, "candidateType", None),
        "remoteCandidateType": getattr(remote, "candidateType", None),
        "selectedPairRttMs": round(rtt * 1000) if isinstance(rtt, (int, float)) else None,
    }


async def main():
    started_at = time.time()
    events = []
    samples = []
    pending_acks = {}
    channel_ready = asyncio.Event()
    done = asyncio.Event()
    channel_box = {"channel": None}
    pc = RTCPeerConnection(RTCConfiguration(iceServers=[ice_server(server) for server in ICE_SERVERS]))

    def record(event):
        events.append(f"{round((time.time() - started_at) * 1000)}ms {event}")

    @pc.on("iceconnectionstatechange")
    def on_ice_connection_state_change():
        record(f"ice {pc.iceConnectionState}")

    @pc.on("icegatheringstatechange")
    def on_ice_gathering_state_change():
        record(f"ice-gather {pc.iceGatheringState}")

    @pc.on("connectionstatechange")
    def on_connection_state_change():
        record(f"peer {pc.connectionState}")

    async with websockets.connect(WS_URL) as ws:
        async def send_signal(payload):
            record(f"send {payload.get('type')}")
            await ws.send(json.dumps(payload))

        @pc.on("icecandidate")
        async def on_icecandidate(candidate):
            if candidate is None:
                return
            await send_signal({"type": "candidate", "candidate": encode_candidate(candidate)})

        @pc.on("datachannel")
        def on_datachannel(channel):
            channel_box["channel"] = channel
            record(f"datachannel {channel.readyState}")
            channel_ready.set()

            @channel.on("open")
            def on_open():
                record("datachannel open")
                channel_ready.set()

            @channel.on("message")
            def on_message(message):
                payload = json.loads(str(message))
                if payload.get("kind") != "ack":
                    return
                future = pending_acks.pop(payload.get("seq"), None)
                if future and not future.done():
                    future.set_result(time.time())


        async def receive_signaling():
            async for message in ws:
                signal = json.loads(message)
                record(f"receive {signal.get('type')}")
                if signal.get("type") == "description":
                    description = signal["description"]
                    await pc.setRemoteDescription(
                        RTCSessionDescription(sdp=description["sdp"], type=description["type"])
                    )
                    if description["type"] == "offer":
                        await pc.setLocalDescription(await pc.createAnswer())
                        while pc.iceGatheringState != "complete":
                            await asyncio.sleep(0.05)
                        await send_signal(
                            {
                                "type": "description",
                                "description": {
                                    "type": pc.localDescription.type,
                                    "sdp": pc.localDescription.sdp,
                                },
                            }
                        )
                if signal.get("type") == "candidate":
                    await pc.addIceCandidate(parse_candidate(signal["candidate"]))

        signaling_task = asyncio.create_task(receive_signaling())
        try:
            await asyncio.wait_for(channel_ready.wait(), timeout=30)
        except asyncio.TimeoutError as error:
            raise RuntimeError(f"datachannel timeout; events={' | '.join(events)}") from error
        channel = channel_box["channel"]
        for _ in range(100):
            if channel.readyState == "open":
                break
            await asyncio.sleep(0.05)
        if channel.readyState != "open":
            raise RuntimeError(f"datachannel not open; state={channel.readyState}; events={' | '.join(events)}")
        for seq in range(PING_COUNT):
            future = asyncio.get_running_loop().create_future()
            pending_acks[seq] = future
            sent_at = time.time()
            channel.send(json.dumps({"kind": "ping", "seq": seq, "sentAt": round(sent_at * 1000)}))
            received_at = await asyncio.wait_for(future, timeout=5)
            samples.append(round((received_at - sent_at) * 1000))
        channel.send(json.dumps({"kind": "done"}))
        done.set()
        signaling_task.cancel()
        candidate = await selected_candidate(pc)
        await pc.close()

    result = {
        "role": ROLE,
        "ackCount": len(samples),
        "elapsedMs": round((time.time() - started_at) * 1000),
        "p50RttMs": percentile(samples, 0.5),
        "p95RttMs": percentile(samples, 0.95),
        "maxRttMs": max(samples) if samples else 0,
        "events": events,
        **candidate,
    }
    print(json.dumps(result))


asyncio.run(main())
