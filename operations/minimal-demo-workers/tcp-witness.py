"""Send one approved synthetic Teltonika frame from the admitted source."""

import base64
import ipaddress
import json
import re
import signal
import socket
import sys


def read_exact(connection, size):
    reply = bytearray()
    while len(reply) < size:
        part = connection.recv(size - len(reply))
        if not part:
            raise ValueError("incomplete reply")
        reply.extend(part)
    return reply


def qualify():
    # Fixed host and port from the simulator and minimal-demo network contracts.
    peers = socket.getaddrinfo("tcp-ingestion", 55027, socket.AF_INET, socket.SOCK_STREAM)
    private = tuple(
        ipaddress.IPv4Network(network)
        for network in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")
    )
    addresses = sorted({peer[4] for peer in peers})
    if len(addresses) != 1 or not any(
        ipaddress.IPv4Address(addresses[0][0]) in network for network in private
    ):
        raise ValueError("expected one private IPv4 ClusterIP")

    inputs = json.loads(sys.stdin.buffer.readline(90001))
    if set(inputs) != {"handshake", "frame", "recordCount"}:
        raise ValueError("invalid fixture")
    hello = base64.b64decode(inputs["handshake"], validate=True)
    frame = base64.b64decode(inputs["frame"], validate=True)
    records = inputs["recordCount"]
    if (
        not re.fullmatch(rb"\x00\x0f[0-9]{15}", hello)
        or not 13 <= len(frame) <= 65536
        or frame[:4] != bytes(4)
        or int.from_bytes(frame[4:8], "big") != len(frame) - 12
        or frame[8] not in (8, 142)
        or type(records) is not int
        or not 1 <= records <= 16
        or frame[9] != records
    ):
        raise ValueError("invalid fixture")
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as connection:
        connection.settimeout(10)
        connection.connect(addresses[0])
        connection.sendall(hello)
        if read_exact(connection, 1) != b"\x01":
            raise ValueError("identifier route refused")
        print('{"handshake":"accepted"}', flush=True)
        # Confirm the handshake checkpoint and establish any approved fault
        # before giving the explicit release. Never resend after a timeout.
        if sys.stdin.buffer.readline(6) != b"send\n":
            raise ValueError("missing frame release")
        connection.sendall(frame)
        if read_exact(connection, 4) != records.to_bytes(4, "big"):
            raise ValueError("AVL acceptance refused")
        print(json.dumps({"acceptedRecords": records}), flush=True)


if __name__ == "__main__":
    signal.alarm(35)
    try:
        qualify()
    except (OSError, ValueError, TypeError, AttributeError):
        sys.exit("TCP witness failed; no fixture bytes or private inputs printed.")
