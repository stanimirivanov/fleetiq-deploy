import assert from 'node:assert/strict';
import net from 'node:net';
export const imei = '350000000000001';
/** Codec 8 frame: real CRC, one GPS record, no IO values. Not a decoder mock. */
export function avlFrame(timestamp, latitude, longitude) {
  const data = Buffer.alloc(33);
  data[0] = 8;
  data[1] = 1;
  data.writeBigUInt64BE(BigInt(timestamp), 2);
  data.writeInt32BE(longitude, 11);
  data.writeInt32BE(latitude, 15);
  data.writeInt16BE(100, 19);
  data.writeUInt16BE(90, 21);
  data[23] = 8;
  data.writeUInt16BE(40, 24);
  data[32] = 1;
  let crc = 0;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xa001 : 0);
  }
  const packet = Buffer.alloc(data.length + 12);
  packet.writeUInt32BE(data.length, 4);
  data.copy(packet, 8);
  packet.writeUInt32BE(crc, packet.length - 4);
  return packet;
}
/** Bounded socket lifetime and byte budget; fragmented/coalesced ACKs are normal. */
export async function transmit(
  timestamp,
  latitude,
  longitude,
  { host = 'ingest', port = 55027, timeout = 30000, onStep = () => {} } = {},
) {
  onStep('device-connect');
  const socket = net.createConnection({ host, port });
  let bytes = Buffer.alloc(0),
    connected = false,
    failure,
    wake;
  const notify = () => {
    wake?.();
    wake = undefined;
  };
  socket.on('connect', () => {
    connected = true;
    notify();
  });
  socket.on('data', (chunk) => {
    if (bytes.length + chunk.length > 16) {
      failure = new Error('Device reply budget exceeded');
      socket.destroy();
    } else {
      bytes = Buffer.concat([bytes, chunk]);
    }
    notify();
  });
  socket.on('error', () => {
    failure = new Error('Device connection failed');
    notify();
  });
  socket.on('close', () => {
    failure ??= new Error('Device connection closed');
    notify();
  });
  const timer = setTimeout(() => {
    failure = new Error('Device deadline exceeded');
    socket.destroy();
    notify();
  }, timeout);
  async function read(size) {
    while (bytes.length < size) {
      if (failure) throw failure;
      await new Promise((ready) => {
        wake = ready;
      });
    }
    const result = bytes.subarray(0, size);
    bytes = bytes.subarray(size);
    return result;
  }
  try {
    while (!connected) {
      if (failure) throw failure;
      await new Promise((ready) => {
        wake = ready;
      });
    }
    onStep('device-identification');
    const identification = Buffer.alloc(17);
    identification.writeUInt16BE(15);
    identification.write(imei, 2, 'ascii');
    socket.write(identification);
    assert.equal(
      (await read(1))[0],
      1,
      'Registered device identification must be accepted',
    );
    onStep('device-record');
    socket.write(avlFrame(timestamp, latitude, longitude));
    assert.equal(
      (await read(4)).readUInt32BE(0),
      1,
      'Only durable acceptance releases the record ACK',
    );
  } finally {
    clearTimeout(timer);
    socket.destroy();
  }
}
