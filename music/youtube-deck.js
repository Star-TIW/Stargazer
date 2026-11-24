// One visible iframe. Retain the user's play intent while the iframe API connects.
class YouTubeDeck {
  constructor(track,mount,onError,immediate,start) {
    this.mount=mount;
    this.onFailure=onError;
    this.level=0;
    this.silent=false;
    this.select(track,start);
    mount.hidden=false;
    mount.classList?.toggle('is-preloading',!immediate);
    const frame=document.createElement('iframe');
    frame.title=track.title+' by '+track.artist;
    frame.allow='autoplay; encrypted-media; fullscreen; picture-in-picture';
    frame.referrerPolicy='strict-origin-when-cross-origin';
    const url=new URL('https://www.youtube.com/embed/'+track.id);
    url.search=new URLSearchParams({enablejsapi:'1',origin:location.origin,playsinline:'1',rel:'0',autoplay:immediate?'1':'0',start:String(Math.floor(start))});
    frame.src=url.href;mount.replaceChildren(frame);
    YouTubeDeck.api().then(()=>{
      if(this.dead)return;
      this.api=new YT.Player(frame,{events:{
        onReady:()=>{
          if(this.dead)return;
          this.connected=true;this.configure();
          if(immediate && this.track.id===track.id && this.matches() && this.api.getPlayerState()===1)this.pendingLoad=false;
          this.command();
          this.onloadedmetadata?.();
        },
        onStateChange:e=>{
          if(this.dead || !this.matches())return;
          if(e.data===1){this.onplaying?.();this.onloadedmetadata?.();}
          if(e.data===2)this.onpause?.();
          if(e.data===0)this.onended?.();
        },
        onAutoplayBlocked:()=>{if(!this.dead && this.wanted)this.onFailure('Playback was blocked. Press Play or use the video controls.',false);},
        onError:()=>{if(!this.dead)this.onFailure('This video could not start. Press Play to retry.');}
      }});
    }).catch(()=>{if(!this.dead)this.onFailure('Video player unavailable. Press Play to retry.');});
  }
  static api(){
    if(window.YT?.Player)return Promise.resolve();
    if(!this.loading)this.loading=new Promise((resolve,reject)=>{
      window.onYouTubeIframeAPIReady=resolve;
      const tag=document.createElement('script');tag.src='https://www.youtube.com/iframe_api';
      tag.onerror=()=>{tag.remove();this.loading=null;reject(Error('YouTube unavailable'));};
      document.head.append(tag);
    });
    return this.loading;
  }
  matches(){return this.connected && this.api.getVideoData()?.video_id===this.track.id;}
  select(track,start){
    if(this.track && this.track.id!==track.id && !matchMedia('(prefers-reduced-motion:reduce)').matches){
      this.mount.animate([{transform:'translateX(0)',opacity:1},{transform:'translateX(-5px)',opacity:.85,offset:.48},
        {transform:'translateX(5px)',opacity:.85,offset:.5},{transform:'translateX(0)',opacity:1}],{duration:350,easing:'ease-out'});
    }
    const keepPlaying=this.track ? this.wanted : false;
    this.track=track;this.start=start;this.wanted=keepPlaying;this.pendingLoad=true;this.exiting=false;
    if(keepPlaying)this.mount.classList?.remove('is-preloading');
    if(this.mount.firstChild)this.mount.firstChild.title=track.title+' by '+track.artist;
  }
  configure(){this.api.setVolume(Math.round(this.level*100));this.silent?this.api.mute():this.api.unMute();}
  command(){
    if(!this.connected)return;
    if(this.pendingLoad){
      const request={videoId:this.track.id,startSeconds:this.start};
      if(this.wanted)this.api.loadVideoById(request);else this.api.cueVideoById(request);
      this.pendingLoad=false;
      this.onloadedmetadata?.();
    }else if(this.wanted)this.api.playVideo();else this.api.pauseVideo();
  }
  exitSoon(){
    if(this.exiting || matchMedia('(prefers-reduced-motion:reduce)').matches)return;
    this.exiting=true;
    this.exitAnimation=this.mount.animate([{transform:'translateX(0)',opacity:1},{transform:'translateX(-6px)',opacity:.85}],{duration:175,easing:'ease-out'});
  }
  get readyState(){return this.connected?4:0;}
  get paused(){return !this.matches() || this.api.getPlayerState()!==1;}
  get ended(){return this.matches() && this.api.getPlayerState()===0;}
  get duration(){return this.matches()?this.api.getDuration():0;}
  get currentTime(){return this.matches()?this.api.getCurrentTime():this.start;}
  set currentTime(t){
    this.exiting=false;this.exitAnimation?.cancel();this.start=t;
    if(this.matches() && !this.pendingLoad){this.api.seekTo(t,true);if(this.wanted)this.api.playVideo();}
  }
  set volume(v){if(v!==this.level){this.level=v;if(this.connected)this.api.setVolume(Math.round(v*100));}}
  set muted(v){if(v!==this.silent){this.silent=v;if(this.connected)this.configure();}}
  play(){this.wanted=true;this.mount.classList?.remove('is-preloading');this.command();return Promise.resolve();}
  pause(){this.wanted=false;if(this.connected)this.api.pauseVideo();}
  destroy(){this.dead=true;this.api?.destroy();this.mount.replaceChildren();this.mount.classList?.remove('is-preloading');this.mount.hidden=true;}
}
