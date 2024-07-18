import ffmpeg from 'fluent-ffmpeg';

const outputVideo = 'output.mp4';

// ffmpeg -i input.txt -c:a copy -vf fps=30 output.webm

ffmpeg
ffmpeg("input.txt")
  .outputOptions(["-c:a copy", "-vf fps=30"])
  .output(outputVideo)
  .on('start', (cmd) => {
    console.log(`FFmpeg command: ${cmd}`);
  })
  .on('error', (err) => {
    console.error(`Error: ${err.message}`);
  })
  .on('end', () => {
    console.log('Video created successfully!');
  })
  .run();
