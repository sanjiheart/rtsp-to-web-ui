const { createApp } = Vue

createApp({
    data() {
        return {
            auth: btoa(sessionStorage.getItem('dev-auth')),
            streams: {},
            hlsUrl: 'http://127.0.0.1:8083/stream/27aec28e-6181-4753-9acd-0456a75f0289/channel/0/hls/live/index.m3u8',
            hls: null,
            mseUrl: 'ws://127.0.0.1:8083/stream/27aec28e-6181-4753-9acd-0456a75f0289/channel/0/mse?uuid=27aec28e-6181-4753-9acd-0456a75f0289&channel=0',
            mse: null,
            mseSrc: null,
            mseQueue: [],
            mseSourceBuffer: null,
            mseStreamingStarted: false,
            videoSound: false,
            mseWs: null
        }
    },
    methods: {
        listStreams() {
            axios.defaults.headers.common['Authorization'] = `Basic ${this.auth}`;
            axios.get(`http://localhost:8083/streams`).then(response => {
                this.streams = response.data.payload;
            });
        },
        playHls(url) {
            // ref: https://github.com/video-dev/hls.js/blob/master/docs/API.md
            let video = document.getElementById('hls');
            if (!!this.hls) {
                this.hls.destroy();
            }
            this.hls = new Hls();
            this.hls.on(Hls.Events.MEDIA_ATTACHED, () => {
                console.log('video and hls.js are now bound together!');
            });
            this.hls.attachMedia(video);
            this.hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
                console.log('manifest loaded, found ' + data.levels.length + ' quality level');
            });
            this.hls.loadSource(url);
            video.load();
        },
        playMse(url) {
            if (!!this.mse) {
                this.mseWs.close();
                this.mse.endOfStream();
            }
            this.mse = new MediaSource();
            this.mseSrc = window.URL.createObjectURL(this.mse);
            this.mse.addEventListener('sourceopen', () => {
                this.mseWs = new WebSocket(url);
                this.mseWs.binaryType = "arraybuffer";
                this.mseWs.onopen = event => {
                    console.log('Connect to ws');
                }
                this.mseWs.onmessage = event => {
                    let data = new Uint8Array(event.data);
                    if (data[0] == 9) {
                        decoded_arr = data.slice(1);
                        if (window.TextDecoder) {
                            mimeCodec = new TextDecoder("utf-8").decode(decoded_arr);
                        } else {
                            mimeCodec = Utf8ArrayToStr(decoded_arr);
                        }
                        if (mimeCodec.indexOf(',') > 0) {
                            this.videoSound = true;
                        }
                        this.mseSourceBuffer = this.mse.addSourceBuffer('video/mp4; codecs="' + mimeCodec + '"');
                        this.mseSourceBuffer.mode = "segments"
                        this.mseSourceBuffer.addEventListener("updateend", this.pushPacket);
                    } else {
                        this.readPacket(event.data);
                    }
                }
            }, false);
        },
        pushPacket() {
            if (!this.mseSourceBuffer.updating) {
                if (this.mseQueue.length > 0) {
                    packet = this.mseQueue.shift();
                    this.mseSourceBuffer.appendBuffer(packet);
                } else {
                    this.mseStreamingStarted = false;
                }
            }
            if (this.$refs.mse.buffered.length > 0) {
                if (typeof document.hidden !== "undefined" && document.hidden && !this.videoSound) {
                    this.$refs.mse.currentTime = this.$refs.mse.buffered.end((this.$refs.mse.buffered.length - 1)) - 0.5;
                }
            }
        },
        readPacket(packet) {
            if (!this.mseStreamingStarted) {
                this.mseSourceBuffer.appendBuffer(packet);
                this.mseStreamingStarted = true;
                return;
            }
            this.mseQueue.push(packet);
            if (!this.mseSourceBuffer.updating) {
                this.pushPacket();
            }
        },
        doPlayHls() {
            this.playHls(this.hlsUrl);
        },
        doPlayMse() {
            this.playMse(this.mseUrl);
        },
        switchVideo(streamId, channelId) {
            this.hlsUrl = `http://127.0.0.1:8083/stream/${streamId}/channel/${channelId}/hls/live/index.m3u8`;
            this.mseUrl = `ws://127.0.0.1:8083/stream/${streamId}/channel/${channelId}/mse?uuid=${streamId}&channel=${channelId}`;
            this.doPlayHls();
            this.doPlayMse();
        }
    },
    mounted() {
        this.listStreams();
    }
}).mount('#app');
