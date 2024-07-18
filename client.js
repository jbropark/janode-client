import Janode from "janode";
const { Logger } = Janode;
import StreamingPlugin from "janode/plugins/streaming";
import WRTC from "@roamhq/wrtc";
const { MediaStream, RTCPeerConnection, nonstandard } = WRTC;
const { i420ToRgba } = nonstandard;
import { OpusDecoder } from 'opus-decoder';
import sharp from "sharp";
import fs from "fs";
import WaveFile from "wavefile";
import { FileWriter } from "wav";

const decoder = new OpusDecoder({
  sampleRate: 48000,
  channels: 1,
})

const connection = await Janode.connect({
  is_admin: false,
  address: {
    url: "ws://172.20.0.2:8188",
  }
});

const session = await connection.create();

// console.log(session);

const streamingHandle = await session.attach(StreamingPlugin);

// console.log(streamingHandle);

streamingHandle.on(Janode.EVENT.HANDLE_WEBRTCUP, evtdata => Logger.info('webrtcup event', evtdata));
streamingHandle.on(Janode.EVENT.HANDLE_MEDIA, evtdata => Logger.info('media event', evtdata));
streamingHandle.on(Janode.EVENT.HANDLE_SLOWLINK, evtdata => Logger.info('slowlink event', evtdata));
streamingHandle.on(Janode.EVENT.HANDLE_HANGUP, evtdata => Logger.info('hangup event', evtdata));
streamingHandle.on(Janode.EVENT.HANDLE_DETACHED, evtdata => Logger.info('detached event', evtdata));

const offer = await streamingHandle.watch({
  id: 1,
  pin: null,
});

let audioSink;
let videoSink;
//const wav_writer = new FileWriter("audio.wav", {sampleRate: 48000, bitDepth: 16, channels: 1});

const samples_list = [];

process.on('SIGINT', async () => {
  console.log("Caught interrupt signal");
  let samples = Int16Array.from(samples_list.flatMap(arr => Array.from(arr)));
  console.log(samples.length);
  // wav_writer.end()
  let wav = new WaveFile.WaveFile();
  wav.fromScratch(1, 48000, "16", samples);
  fs.writeFileSync("temp.wav", wav.toBuffer());
  process.exit();
});

const pc = new RTCPeerConnection();
console.log('init state:', pc.iceConnectionState);
console.log(pc);
pc.onnegotiationneeded = event => console.log('pc.onnegotiationneeded', event);
pc.onicecandidate = async event => {
  // console.log('pc.onicecandidate', event);
  // console.log('state', pc.iceConnectionState);

  if (!event.candidate) {
    console.log("Trickle complete");
    //await streamingHandle.trickleComplete();

  } else {
    console.log("Try Trickle");
    await streamingHandle.trickle(event.candidate);
  }
}



pc.oniceconnectionstatechange = () => console.log('pc.oniceconnectionstatechange => ' + pc.iceConnectionState);
pc.ontrack = async event => {
  console.log('pc.ontrack', event);

  event.track.onunmute = evt => {
    console.log("track.onunmute", evt);
  };

  event.track.onmute = evt => {
    console.log("track.onmute", evt);
  };

  event.track.onended = evt => {
    console.log("track.onended", evt);
  };

  const remoteStream = event.streams[0];
  // console.log("remoteStream:", remoteStream);
  const track = event.track;
  console.log("contraints:", track.getSettings());

  if (track.kind === "video") {
    return;

    videoSink = new nonstandard.RTCVideoSink(track);
    videoSink.onframe = async ({type, frame}) => {
      const { width, height, data } = frame

      const rgbaData = new Uint8ClampedArray(width * height * 4);
      const rgbaFrame = { width, height, data: rgbaData }
      i420ToRgba(frame, rgbaFrame);

      const image = sharp(rgbaData, {raw: {width, height, channels: 4}});
      await image.toFile(`images/${new Date().valueOf()}.png`);
    };
  } else if (track.kind === "audio") {
    console.log("Got Audio");
    audioSink = new nonstandard.RTCAudioSink(track);
    audioSink.ondata = data => {
      const {
        samples,
	bitsPerSample,
	sampleRate,
	channelCount,
	numberOfFrames } = data;

      //const samples8 = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength)
      console.log("Got data", data);
      //const res = decoder.decodeFrame(samples8);
      //console.log(res);
      samples_list.push(samples);
      // wav_writer.write(Buffer.from(samples));
    }
  }
}

await pc.setRemoteDescription(offer.jsep);
console.log('set remote sdp OK');
const answer = await pc.createAnswer();
console.log('create answer OK');
pc.setLocalDescription(answer);
console.log('set local sdp OK');
// console.log(answer)

const evtdata = await streamingHandle.start({jsep: answer, e2ee: true});
// console.log('streamingHandle.start:', evtdata);

