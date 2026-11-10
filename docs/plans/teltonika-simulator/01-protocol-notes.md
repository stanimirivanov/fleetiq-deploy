# Protocol evidence and simulator fidelity
Status: proposed. Official pages read 2026-11-09. Layouts below are byte counts, not executable code.

## TL;DR
TCP8/8E can exercise FleetIQ today. UDP/16/12 need independent simulator conformance tests; product acceptance must report them unsupported. Model behavior and protocol syntax are separate profiles.

## TCP and record layout
Network integers are big-endian. Login is `length:u16 + IMEI:ASCII[15]`; reply is `01` accepted or `00` rejected. AVL reply is a four-byte record count; mismatch causes resend.

`TCP = zero[4] | bodyLength[4] | codec[1] | count[1] | records | count[1] | CRC[4]`

Length and CRC cover codec through trailing count. Counts agree. CRC is IBM, zero-extended into four bytes.

`record = timestamp[8] | priority[1] | GPS[15] | IO`

Timestamp is Unix milliseconds. Priorities 0/1/2. GPS order is longitude[4], latitude[4], altitude[2], angle[2], satellites[1], speed[2]; coordinates use signed degrees × 10^7. [Data Sending Protocols, Codec 8 / AVL packet, GPS, communication](https://wiki.teltonika-gps.com/view/Teltonika_Data_Sending_Protocols#Codec_8)

For implementation, use CRC-16/ARC polynomial 0xA001, init/xorout zero and reject nonzero CRC high bits; the existing decoder independently documents this policy. Altitude remains raw u16 in FleetIQ; do not silently convert negative altitude semantics. [Decoder](https://github.com/stanimirivanov/fleetiq-platform/blob/28823c547a4f7a5bd646a58e580c659d43e967d2/packages/teltonika/src/avl.rs), [observations](https://github.com/stanimirivanov/fleetiq-platform/blob/28823c547a4f7a5bd646a58e580c659d43e967d2/packages/teltonika/README.md)

## Codec comparison
Each fixed IO group contains count followed by (ID,value) pairs; value widths are 1/2/4/8 bytes.

| Codec | ID | Event ID | Total/group count | IO ID | Extra |
|---|---|---|---|---|---|
| 8 | 08 | 1 | 1/1 | 1 | — |
| 8E | 8E | 2 | 2/2 | 2 | NX[2], then ID[2], length[2], bytes |
| 16 | 10 | 2 | 1/1* | 2 | generation[1] before total |

*Codec 16's detailed layout/example use one-byte total; its comparison table says two. Propose one provisionally, requiring reviewer approval; independent agreement does not resolve manufacturer authority. Contradictory evidence blocks qualification. [Codec, 8 Extended, 16 and differences](https://wiki.teltonika-gps.com/view/Codec#Codec_16)

Codec 12 body: `0C[1]|quantity[1]|type[1]|size[4]|text|quantity[1]`, inside the TCP-style length/CRC envelope. Types 05/06 mean command/response. Commands follow AVL acknowledgment. Codec 13 adds timestamp[4]; 14 adds IMEI[8]; 15 adds both. Defer 13/14/15/17. [Codec, GPRS sections](https://wiki.teltonika-gps.com/view/Codec#Codec_for_communication_over_GPRS_messages)

Do not treat summary tables as executable specifications. Traccar independently reads Codec 16's total as one byte; use a pinned reference test and reviewed manufacturer vector, not our encoder's own decoder, to resolve it. [Traccar decoder, decodeLocation/readExtByte](https://raw.githubusercontent.com/traccar/traccar/master/src/main/java/org/traccar/protocol/TeltonikaProtocolDecoder.java)

## UDP boundary
`datagram = length[2] | packetId[2] | 01[1] | avlPacketId[1] | imeiLength[2] | imei[15] | AVL-body`

Length excludes itself. The body has codec, counts and records; do not wrap a TCP preamble/length/CRC around it. The AVL acknowledgment is `0005 | echoedPacketId[2] | 01 | echoedAvlId[1] | acceptedCount[1]`. No separate TCP login. Validate source endpoint, both IDs and count. A generic channel ACK has no AVL count and cannot prove acceptance. Missing valid reply permits timeout/retry. Some worked examples show inconsistent IDs; follow the stated echo rule, add mismatch tests. [Teltonika AVL Protocols, Codec 8 / UDP channel and server response](https://wiki.teltonika-gps.com/view/Teltonika_AVL_Protocols#Codec_8)

## Model profile and IO catalogue
Proposed profile is `fmb920-docs-v1`, explicitly documentation-derived, not firmware-certified. Use these unsigned raw values. The linked table's HW Support column must be checked for each later model; a model-named page contains rows for other models too. [FMB920 parameters, Permanent I/O elements](https://wiki.teltonika-gps.com/view/FMB920_Teltonika_Data_Sending_Parameters_ID#Permanent_I/O_elements)

| ID | Meaning | Width | Scale / range |
|---|---|---|---|
| 239 | Ignition | 1 | 0/1 |
| 240 | Movement | 1 | 0/1 |
| 21 | GSM signal | 1 | 0–5 raw; 1–5 signal levels |
| 66 | External voltage | 2 | ×0.001 V |
| 67 | Battery voltage | 2 | ×0.001 V |
| 16 | Total odometer | 4 | meters, max 2147483647 |
| 12 | Fuel used GPS | 4 | ×0.001 liter; estimated consumption, not tank level |

Keep arbitrary fixed/variable IO as explicit raw hex with declared width. Do not label arbitrary 8-byte/variable data as real FMB920 sensors. Fuel-tank/CAN/OBD inputs require a separately sourced model/accessory profile. No platform interpretation of IO hex is added here.

## Timing and MQTT
FMB920 defaults illustrate separate capture triggers (time, distance, turn, speed change) and send periods. They are configurable, not a universal Teltonika schedule. [First Start, Default configuration settings](https://wiki.teltonika-gps.com/view/FMB920_First_Start#Default_configuration_settings)

The documented connection-error delays are 0,1,1,2,2,4,6,8,10 minutes, capped at ten, reset after success. A faster seeded-jitter lab schedule must be explicitly named accelerated. Records may be selected oldest/newest first; choose FIFO for the initial profile, flag the choice. [GPRS settings, Limit connection errors and Records Settings](https://wiki.teltonika-gps.com/view/FMB920_GPRS_settings#GPRS_Settings)

MQTT is model/firmware/service specific. AWS Shadow uses JSON/latest state and cannot carry commands; AWS Custom permits additional codecs and topics with certificate authentication. [Codec JSON, AWS Shadow/Custom](https://wiki.teltonika-gps.com/view/Codec_JSON)
FTC881 documents binary 8E MQTT and different TLS limitations. Therefore MQTT is deferred, not translated into a generic TCP tunnel. [FTC881 Mobile network, MQTT settings](https://wiki.teltonika-gps.com/index.php?title=FTC881_Mobile_network#MQTT_settings)

## Ambiguities and test obligations
- GPS-invalid descriptions differ in the two starting pages. Proposed profile retains last fix, zeros satellite/heading/speed; before any fix uses zero coordinates. Test FleetIQ's uncertain-quality outcome; this is a model assumption. [Codec, GPS element](https://wiki.teltonika-gps.com/view/Codec#Codec_8)
- Vendor minimum record size statements conflict with compact no-IO examples and the existing fixture. Avoid a universal 45-byte minimum. Validate actual structure, selected profile and receiver bounds.
- Exact firmware ACK deadlines, flash overflow behavior and RTC drift are UNVERIFIED. The simulator config specifies them without claiming hardware fidelity.
- Golden tests cover literal expected bytes, signed coordinate edges, u64 hex values, count/length limits, CRC boundaries, split/coalesced replies and every truncation. Round-trip tests alone are insufficient.
- Public docs can contain example device IDs. Replace them with runtime-private synthetic identity inputs in committed tests; keep any original full packet fixture private and verify against a public expected digest/structural oracle when necessary.
