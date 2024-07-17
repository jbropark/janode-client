import Janode from "janode";
const { Logger } = Janode;
import StreamingPlugin from "janode/plugins/streaming";
import WRTC from "@roamhq/wrtc";
const { MediaStream, RTCPeerConnection, nonstandard } = WRTC;
const { i420ToRgba } = nonstandard;
import sharp from "sharp";

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

console.log(offer);

let audioSink;
let videoSink;

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
    videoSink = new nonstandard.RTCVideoSink(track);
    videoSink.onframe = async ({type, frame}) => {
      console.log("Got Video", new Date().valueOf());

      console.time("convert");
      const { width, height, data } = frame
      const rgbaData = new Uint8ClampedArray(width * height * 4);
      const rgbaFrame = { width, height, data: rgbaData }
      i420ToRgba(frame, rgbaFrame);
      console.timeEnd("convert");

      console.log(rgbaFrame);
 
      const image = sharp(rgbaData, {raw: {width, height, channels: 4}});
      await image.toFile("test.png");

    };
  } else if (track.kind === "audio") {
    return;

    console.log("Got Audio");
    audioSink = new nonstandard.RTCAudioSink(track);
    audioSink.ondata = data => console.log("Got data", data);
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

