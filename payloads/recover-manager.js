// Recovery only: use an existing loopback ELF loader. Never launch a kernel
// exploit, installer, or a second manager when its listener is already present.
const NR = { SOCKET: 0x61, CONNECT: 0x62, WRITE: 4, CLOSE: 6,
  SETSOCKOPT: 0x69, MMAP: 0x1dd, MUNMAP: 0x49 };
const bad = value => (value.low | 0) === -1;

async function connect(api, port) {
  const socket = await api.chain.syscall(NR.SOCKET, 2, 1, 0);
  if (bad(socket)) throw new Error('Could not create recovery socket.');
  const fd = socket.low | 0;
  try {
    const addr = api.p.malloc(16, 1);
    for (let i = 0; i < 16; i++) api.p.write1(addr.add32(i), 0);
    [16, 2, port >> 8, port & 255, 127, 0, 0, 1].forEach(
      (value, i) => api.p.write1(addr.add32(i), value));
    if ((await api.chain.syscall(NR.CONNECT, fd, addr, 16)).low === 0) return fd;
  } catch (error) {
    await api.chain.syscall(NR.CLOSE, fd);
    throw error;
  }
  await api.chain.syscall(NR.CLOSE, fd);
  return -1;
}

return async function (api) {
  const manager = await connect(api, 8084);
  if (manager >= 0) {
    await api.chain.syscall(NR.CLOSE, manager);
    await api.log('Recovery: Payload Manager already listening; nothing sent.', 'success');
    return;
  }
  let fd = await connect(api, 9021);
  if (fd < 0) throw new Error('Recovery requires an existing ELF loader. No kernel exploit was run.');
  let base = null;
  let mapped = 0;
  try {
    // FreeBSD SO_SNDTIMEO: stop a stalled loader transfer rather than leaving
    // the browser blocked indefinitely. timeval is two 64-bit values on PS5.
    const timeout = api.p.malloc(16, 1);
    for (let i = 0; i < 16; i++) api.p.write1(timeout.add32(i), 0);
    api.p.write4(timeout, 5);
    if (bad(await api.chain.syscall(NR.SETSOCKOPT, fd, 0xffff, 0x1005, timeout, 16)))
      throw new Error('Could not set recovery transfer timeout.');
    const response = await fetch('pldmgr.elf');
    if (!response.ok) throw new Error('Could not read the embedded manager ELF.');
    const bytes = await response.arrayBuffer();
    const view = new DataView(bytes);
    if (bytes.byteLength < 0x1000 || view.getUint32(0, true) !== 0x464c457f)
      throw new Error('Invalid manager ELF.');
    mapped = Math.ceil(bytes.byteLength / 0x4000) * 0x4000;
    const memory = await api.chain.syscall(NR.MMAP, 0, mapped, 3, 0x1002, -1, 0);
    if (bad(memory)) throw new Error('Could not map manager ELF.');
    base = memory;
    let i = 0;
    for (; i + 4 <= bytes.byteLength; i += 4) api.p.write4(base.add32(i), view.getUint32(i, true));
    for (; i < bytes.byteLength; i++) api.p.write1(base.add32(i), view.getUint8(i));
    if ((api.p.read4(base) >>> 0) !== 0x464c457f) throw new Error('Manager ELF copy failed.');
    await api.log('Recovery: sending Payload Manager to the existing ELF loader...', 'info');
    let sent = 0;
    while (sent < bytes.byteLength) {
      const want = Math.min(0x10000, bytes.byteLength - sent);
      const count = (await api.chain.syscall(NR.WRITE, fd, base.add32(sent), want)).low | 0;
      if (count <= 0 || count > want) throw new Error('Recovery transfer stopped after ' + sent + ' bytes.');
      sent += count;
    }
    await api.log('Recovery: sent ' + sent + ' manager bytes. Wait for the saved etaHEN autoload.', 'success');
  } finally {
    try { await api.chain.syscall(NR.CLOSE, fd); }
    finally { if (base) await api.chain.syscall(NR.MUNMAP, base, mapped); }
  }
};
