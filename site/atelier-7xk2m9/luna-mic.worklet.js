// Luna voice (Gemini): collects microphone audio in ~32 ms chunks for the main page to send.
class LunaMic extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(512);
    this.i = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let k = 0; k < ch.length; k++) {
        this.buf[this.i++] = ch[k];
        if (this.i === this.buf.length) {
          this.port.postMessage(this.buf.slice());
          this.i = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('luna-mic', LunaMic);
