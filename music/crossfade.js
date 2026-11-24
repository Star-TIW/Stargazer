// Use two decks for mixed sources and reuse the visible iframe for consecutive videos.
class CrossfadePlayer {
  constructor({track, start, next, seconds, level, muted, state, advance, error, video, audio = () => new Audio()}) {
    Object.assign(this,{track,next,seconds,level,muted,state,advance,error,video,audio});
    this.active=this.make(track,true,start);
    this.blend=0;
    this.active.currentTime=start;
    this.bind();
  }
  make(track,immediate=false,start=0) {
    if(!track.audioId)return this.video(track,immediate,start);
    const el=this.audio();
    el.preload='auto'; el.volume=0; el.muted=this.muted;
    el.src='https://api.audius.co/v1/tracks/'+encodeURIComponent(track.audioId)+'/stream?app_name=Stargazer';
    return el;
  }
  bind() {
    const el=this.active;
    el.onplaying=()=>{if(this.started && this.incoming?.paused)this.incoming.play().catch(()=>this.clearNext());this.state(1);};
    el.onpause=()=>{if(!el.ended){this.incoming?.pause();this.state(2);}};
    el.onerror=()=>this.error();
    el.onended=()=>{
      if(this.incoming && this.next()?.id===this.nextId){
        if(!this.started || this.incoming.paused)this.incoming.play().catch(()=>this.error());
        this.promote();
      }
      else this.state(0);
    };
    this.gains();
  }
  gains() {
    const outgoing=this.blend===1?0:Math.cos(this.blend*Math.PI/2);
    this.active.volume=this.level*outgoing*(this.introGain??1);this.active.muted=this.muted;
    if(this.incoming){this.incoming.volume=this.level*Math.sin(this.blend*Math.PI/2);this.incoming.muted=this.muted;}
  }
  release(el) {
    if(!el)return;
    el.onended=el.onpause=el.onplaying=el.onerror=null;
    if(el.destroy){el.destroy();return;}
    el.pause();el.removeAttribute('src');el.load();
  }
  clearNext() {
    this.release(this.incoming);this.incoming=null;this.nextId=null;this.started=false;this.blend=0;
    this.gains();
  }
  tick() {
    const next=this.next(), length=this.seconds(), duration=this.active.duration;
    this.introGain=this.intro && length ? Math.sin(Math.min(1,this.active.currentTime/length)*Math.PI/2) : 1;
    if(this.introGain>=1)this.intro=false;
    if(!next || !Number.isFinite(duration) || duration<=0){
      if(this.incoming || this.blend)this.clearNext();else this.gains();return;
    }
    const remaining=Math.max(0,duration-this.active.currentTime);
    if(remaining<=.175 && !this.active.paused)this.active.exitSoon?.();
    const span=Math.min(length,duration);
    const sequential=!this.track.audioId && !next.audioId;
    if(sequential){
      if(this.incoming)this.clearNext();
      this.blend=span ? Math.max(0,1-remaining/span) : 0;this.gains();return;
    }
    if(this.incoming && (this.nextId!==next.id || (this.started && (!span || remaining>span))))this.clearNext();
    if(!this.incoming)this.blend=0;
    if(!this.incoming && remaining<=span+8){
      this.incoming=this.make(next);this.incoming.volume=0;this.incoming.muted=this.muted;this.nextId=next.id;
    }
    this.gains();
    if(!this.incoming || this.active.paused || this.active.ended || remaining>span || !span)return;
    if(!this.started){
      if(this.incoming.readyState<2)return;
      this.started=true;
      const el=this.incoming;
      el.play().catch(()=>{if(el===this.incoming)this.started=false;});
    }
    if(this.incoming.paused || this.incoming.readyState<2)return;
    this.blend=Math.max(0,Math.min(1,1-remaining/span));this.gains();
  }
  promote() {
    const completed=this.active, track=this.next();
    if(!track || track.id!==this.nextId){this.state(0);return;}
    this.active=this.incoming;this.incoming=null;this.started=false;this.blend=0;this.nextId=null;
    this.release(completed);this.track=track;this.bind();this.advance(track);if(!this.active.paused)this.state(1);
  }
  switchTrack(track,start,sequential){
    this.clearNext();this.intro=sequential;this.introGain=sequential && this.seconds()?0:1;
    if(!this.track.audioId && !track.audioId && this.active.select){
      this.active.select(track,start);
    }else{
      this.release(this.active);this.active=this.make(track,true,start);this.active.currentTime=start;
    }
    this.track=track;this.bind();this.playVideo();
  }
  getCurrentTime(){return this.active.currentTime;}
  getDuration(){return this.active.duration;}
  getVideoData(){return {video_id:this.track.id};}
  getPlayerState(){return this.active.paused?2:1;}
  setVolume(level){this.level=level/100;this.gains();}
  mute(){this.muted=true;this.gains();}
  unMute(){this.muted=false;this.gains();}
  playVideo(){
    const el=this.active;
    el.play().catch(()=>{if(!this.dead && this.active===el)this.error();});
    if(this.started && this.incoming)this.incoming.play().catch(()=>this.clearNext());
  }
  pauseVideo(){this.active.pause();this.incoming?.pause();}
  seekTo(time){this.intro=false;this.introGain=1;this.clearNext();this.active.currentTime=time;}
  destroy(){this.dead=true;this.release(this.active);this.release(this.incoming);}
}
if(typeof module!=='undefined') module.exports=CrossfadePlayer;
