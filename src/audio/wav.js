// A local preview stays in browser memory; this function performs no I/O.
export function pcmWavBlob(frames, sampleRate = 16000) {
  const length = frames.reduce((sum, frame) => sum + frame.byteLength, 0)
  const header = new ArrayBuffer(44)
  const view = new DataView(header)
  const write = (offset, text) => [...text].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)))
  write(0, 'RIFF'); view.setUint32(4, 36 + length, true); write(8, 'WAVE')
  write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true)
  view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, length, true)
  return new Blob([header, ...frames], { type: 'audio/wav' })
}
