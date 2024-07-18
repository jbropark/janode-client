import Janode from "janode";
const { Logger } = Janode;
import StreamingPlugin from "janode/plugins/streaming";
import WRTC from "@roamhq/wrtc";
const { RTCPeerConnection, nonstandard } = WRTC;
const { i420ToRgba, RTCVideoSink, RTCAudioSink } = nonstandard;
import fs from "fs";
import { WaveFile } from "wavefile";
import commandLineArgs from "command-line-args";
import { Builder } from "./record";

const optionDefinitions = [
  {name: "url", type: str, defaultValue: "ws://172.20.0.2:8188"},
  {name: "image_dir", type: str, defaultValue: null},
  {name: "input_file", type: str, defaultValue: null},
  {name: "video_file", type: str, defaultValue: "video.mp4"},
  {name: "audio_file", type: str, defaultValue: "audio.wav"},
]
const options = commandLineArgs(optionDefinitions);

const connection = await Janode.connect({
  is_admin: false,
  address: {
    url: options.url,
  }
});

const session = await connection.create();

const streamingHandle = await session.attach(StreamingPlugin);

streamingHandle.on(Janode.EVENT.HANDLE_WEBRTCUP, evtdata => Logger.info('webrtcup event', evtdata));
streamingHandle.on(Janode.EVENT.HANDLE_MEDIA, evtdata => Logger.info('media event', evtdata));
streamingHandle.on(Janode.EVENT.HANDLE_SLOWLINK, evtdata => Logger.info('slowlink event', evtdata));
streamingHandle.on(Janode.EVENT.HANDLE_HANGUP, evtdata => Logger.info('hangup event', evtdata));
streamingHandle.on(Janode.EVENT.HANDLE_DETACHED, evtdata => Logger.info('detached event', evtdata));

const offer = await streamingHandle.watch({id: 1, pin: null});

let audioSink;
let videoSink;
const isAudio = !!options.audio_file;
let wavConfig = { numChannels: 0, sampleRate: 0, bitsPerSample: 0 };
let wavList = [];

const builder = new Builder(options.image_dir, options.input_file);

process.on('SIGINT', async () => {
  if (isAudio && wavList.length > 0) {
    const wav = new WaveFile();
    wav.fromScratch(wavConfig.numChannels, wavConfig.sampleRate, "" + wavConfig.bitsPerSample, wavList)
    fs.writeFileSync(options.audio_file, wav.toBuffer());
  }

  if (!!options.video_file) {
    builder.save(options.video_file);
  }

  process.exit();
});

const pc = new RTCPeerConnection();

pc.onnegotiationneeded = event => {
  console.log('pc.onnegotiationneeded', event);
}
pc.onicecandidate = async event => {
  if (!event.candidate) {
    console.log("Trickle complete");
  } else {
    console.log("Try Trickle");
    await streamingHandle.trickle(event.candidate);
  }
}
pc.oniceconnectionstatechange = () => {
  console.log('pc.oniceconnectionstatechange => ' + pc.iceConnectionState);
}
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

  const track = event.track;

  if (track.kind === "video") {
    videoSink = new RTCVideoSink(track);
    videoSink.onframe = async ({ frame }) => {
      const { width, height } = frame
      const rgbaData = new Uint8ClampedArray(width * height * 4);
      const rgbaFrame = { width, height, data: rgbaData }
      i420ToRgba(frame, rgbaFrame);
      
      builder.append(rgbaData, new Date().valueOf());
    };
  } else if (track.kind === "audio") {
    audioSink = new RTCAudioSink(track);
    audioSink.ondata = ({ samples, bitsPerSample, sampleRate, channelCount }) => {
      if (!isAudio) return;

      wavConfig.numChannels = channelCount;
      wavConfig.sampleRate = sampleRate;
      wavConfig.bitsPerSample = bitsPerSample;
      wavList.push(samples);
    }
  }
}

await pc.setRemoteDescription(offer.jsep);
const answer = await pc.createAnswer();
pc.setLocalDescription(answer);

const evtdata = await streamingHandle.start({jsep: answer, e2ee: true});