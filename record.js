import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import tmp from 'tmp';
import sharp from "sharp";


class Frame {
  constructor(timestamp, path) {
    this.timestamp = timestamp;
    this.path = path;
  }
}

class Builder {
  constructor(image_dir = null, input_file = null) {
    this.frames = [];
    this.image_dir = !image_dir ? tmp.dirSync().name : image_dir;
    this.input_file = input_file;
  }

  /**
   * @param {*} rgba 
   * @param {*} timestamp milliseconds
   */
  async append(rgba, timestamp) {
    const path = `${this.image_dir}/img-${this.frames.length}.png`;
    const image = sharp(rgba, {raw: {width, height, channels: 4}});
    await image.toFile(path);
    this.frames.push(new Frame(timestamp, path));
  }

  /**
   * 
   * @param {String} path 
   */
  save(path) {
    const input_file = !this.input_file ? tmp.tmpNameSync() : this.input_file;
    const input_fd = fs.openSync(input_file, "w");
    
    this.frames.forEach((frame, index) => {
      if (index < this.frames.length - 1) {
        const duration = this.frames[index + 1].timestamp - frame.timestamp;
        fs.writeFileSync(input_fd, `file '${img_path}'\nduration ${duration}ms`)
      } else {
        fs.writeFileSync(input_fd, `file '${img_path}'\nduration 0ms`)
      }
    })
    fs.fdatasyncSync(input_fd);
    createVideo(input_file, path);
  }
}


/**
 * @param {String} input_path 
 * @param {String} output_path 
 */
function createVideo(input_path, output_path) {
  ffmpeg(input_path)
    .outputOptions(["-c:a copy", "-pix_fmt yuv420p", "-vf fps=30"])
    .output(output_path)
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
}

export { Builder };